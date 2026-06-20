"""
EC-3: two concurrent ``adjust_stock`` calls against the same product must
either serialize cleanly (Postgres ``FOR UPDATE``) or fail loudly — never
produce a lost update.

Run with::

    TEST_DATABASE_URL=postgresql+psycopg2://user:pass@localhost/test pytest backend/tests

The test is skipped on SQLite because SQLAlchemy's ``with_for_update()`` is
a no-op there and SQLite's writer lock alone does not protect against the
"stale read, then write" interleaving this test is designed to catch.
"""

from __future__ import annotations

import os
import threading
import time
import uuid
from decimal import Decimal
from typing import Optional

import pytest
from sqlalchemy import create_engine, event
from sqlalchemy.orm import Session, sessionmaker

from app.db.database import Base
import app.models  # noqa: F401  -- register all tables on Base.metadata
from app.models.product import Product, ProductTypeEnum
from app.models.stock_ledger import LedgerMovementEnum, StockLedger
from app.services.stock_service import adjust_stock


def _test_database_url() -> Optional[str]:
    return os.getenv("TEST_DATABASE_URL")


pytestmark = pytest.mark.skipif(
    not (_test_database_url() or "").startswith("postgresql"),
    reason=(
        "EC-3 concurrency test requires Postgres for real FOR UPDATE semantics. "
        "Set TEST_DATABASE_URL=postgresql+psycopg2://... to run."
    ),
)


@pytest.fixture(scope="module")
def engine():
    url = _test_database_url()
    eng = create_engine(url, future=True)
    Base.metadata.create_all(bind=eng)
    yield eng
    eng.dispose()


@pytest.fixture()
def SessionFactory(engine):
    return sessionmaker(bind=engine, autocommit=False, autoflush=False, future=True)


@pytest.fixture()
def product_id(SessionFactory):
    pid = uuid.uuid4()
    s: Session = SessionFactory()
    try:
        s.add(
            Product(
                id=pid,
                name=f"concurrency-probe-{pid}",
                product_type=ProductTypeEnum.raw_component,
                sales_price=Decimal("0"),
                cost_price=Decimal("0"),
                on_hand_qty=Decimal("10"),
                reserved_qty=Decimal("0"),
                procure_on_demand=False,
            )
        )
        s.commit()
    finally:
        s.close()
    yield pid
    s = SessionFactory()
    try:
        s.query(StockLedger).filter(StockLedger.product_id == pid).delete()
        s.query(Product).filter(Product.id == pid).delete()
        s.commit()
    finally:
        s.close()


def test_two_concurrent_adjustments_do_not_lose_an_update(
    engine, SessionFactory, product_id
):
    """
    Two threads each add 5 units. The race window between SELECT and UPDATE
    is widened by an ``after_cursor_execute`` hook that sleeps 300 ms after
    any SELECT on ``products`` — enough that, without the row lock, both
    threads would read ``qty_before=10`` and one update would be lost.

    With ``FOR UPDATE`` the second SELECT blocks at the database until the
    first transaction commits, so the two ledger rows form a clean chain.
    """
    ref_a = uuid.uuid4()
    ref_b = uuid.uuid4()
    start_barrier = threading.Barrier(2)
    errors: list[BaseException] = []

    def widen_race_window(conn, cursor, statement, params, context, executemany):
        s = statement.upper()
        if "SELECT" in s and "FROM PRODUCTS" in s:
            time.sleep(0.3)

    event.listen(engine, "after_cursor_execute", widen_race_window)

    def worker(reference_id: uuid.UUID) -> None:
        session: Session = SessionFactory()
        try:
            start_barrier.wait(timeout=5)
            adjust_stock(
                db=session,
                product_id=product_id,
                qty_change=Decimal("5"),
                movement_type=LedgerMovementEnum.manual_adjustment,
                reference_type="test",
                reference_id=reference_id,
                user_id=None,
            )
            session.commit()
        except BaseException as exc:  # noqa: BLE001 -- re-raised in main thread
            session.rollback()
            errors.append(exc)
        finally:
            session.close()

    try:
        t_a = threading.Thread(target=worker, args=(ref_a,))
        t_b = threading.Thread(target=worker, args=(ref_b,))
        t_a.start()
        t_b.start()
        t_a.join(timeout=10)
        t_b.join(timeout=10)
    finally:
        event.remove(engine, "after_cursor_execute", widen_race_window)

    assert not errors, f"worker raised: {errors!r}"
    assert not t_a.is_alive() and not t_b.is_alive(), "worker thread hung"

    s: Session = SessionFactory()
    try:
        product = s.query(Product).filter(Product.id == product_id).one()
        ledgers = (
            s.query(StockLedger)
            .filter(StockLedger.product_id == product_id)
            .order_by(StockLedger.occurred_at, StockLedger.qty_after)
            .all()
        )

        # Final stock: 10 + 5 + 5 = 20. Anything less is a lost update.
        assert product.on_hand_qty == Decimal("20"), (
            f"on_hand_qty={product.on_hand_qty} — a concurrent write was lost"
        )

        assert len(ledgers) == 2, f"expected 2 ledger rows, got {len(ledgers)}"

        # Each row must satisfy qty_after = qty_before + qty_change (also a
        # DB CHECK constraint, but assert it explicitly for a clear failure).
        for row in ledgers:
            assert row.qty_after == row.qty_before + row.qty_change

        # The two rows must form a chain: {(10 -> 15), (15 -> 20)}, in either
        # order. If both rows have qty_before=10 the lock failed.
        befores = sorted(Decimal(r.qty_before) for r in ledgers)
        afters = sorted(Decimal(r.qty_after) for r in ledgers)
        assert befores == [Decimal("10"), Decimal("15")], (
            f"qty_before values {befores} indicate a stale read — FOR UPDATE not honored"
        )
        assert afters == [Decimal("15"), Decimal("20")]
    finally:
        s.close()
