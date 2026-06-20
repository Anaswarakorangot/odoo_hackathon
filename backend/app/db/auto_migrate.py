"""
Idempotent SQLite ORM-vs-DB schema reconciliation.

`Base.metadata.create_all()` only creates new tables — it never ALTERs existing
ones. When we add a new column to a model and restart against an existing
test.db, the ORM emits SELECTs that reference the new column and SQLite raises
"no such column" errors.

This helper runs *before* `create_all()` and adds any missing columns to
existing tables via ALTER TABLE ADD COLUMN. Idempotent — safe to run on every
startup. SQLite limitation: ALTER TABLE ADD COLUMN does not support NOT NULL
without DEFAULT, but every column we add this way is nullable or has a default
in the model, so this is fine for our schema.

Tables that don't exist yet are skipped — `create_all()` will handle them next.
"""
from sqlalchemy import inspect, text
from sqlalchemy.engine import Engine

from app.db.database import Base


# Map SQLAlchemy column types to SQLite-compatible type names for ADD COLUMN.
_TYPE_FALLBACKS = {
    "DATETIME": "DATETIME",
    "DATE": "DATE",
    "BOOLEAN": "BOOLEAN",
    "INTEGER": "INTEGER",
    "BIGINT": "INTEGER",
    "FLOAT": "REAL",
    "NUMERIC": "NUMERIC",
    "UUID": "BLOB",
}


def _column_ddl(column) -> str:
    """Build a minimal ADD COLUMN clause that SQLite accepts."""
    try:
        col_type = column.type.compile(dialect=None)
    except Exception:
        col_type = _TYPE_FALLBACKS.get(str(column.type).upper(), "TEXT")

    parts = [f'"{column.name}"', col_type]

    # SQLite ADD COLUMN forbids NOT NULL without a default if the table has rows.
    # We always treat newly-added columns as nullable to stay safe; the model
    # default will populate them on next write.
    parts.append("NULL")

    if column.default is not None and getattr(column.default, "is_scalar", False):
        # Literal default — emit it. Skip callables and server-side defaults.
        try:
            default_val = column.default.arg
            if isinstance(default_val, bool):
                parts.append(f"DEFAULT {1 if default_val else 0}")
            elif isinstance(default_val, (int, float)):
                parts.append(f"DEFAULT {default_val}")
            elif isinstance(default_val, str):
                escaped = default_val.replace("'", "''")
                parts.append(f"DEFAULT '{escaped}'")
        except Exception:
            pass

    return " ".join(parts)


def reconcile_sqlite_schema(engine: Engine) -> list[str]:
    """
    Inspect every table in Base.metadata. For tables that already exist in the
    DB, ALTER TABLE ADD COLUMN any column declared on the model but missing
    from the DB. Returns a list of human-readable change descriptions.
    """
    changes: list[str] = []
    inspector = inspect(engine)
    existing_tables = set(inspector.get_table_names())

    with engine.connect() as conn:
        for table_name, table in Base.metadata.tables.items():
            if table_name not in existing_tables:
                # create_all() will handle this in its own pass.
                continue

            existing_cols = {c["name"] for c in inspector.get_columns(table_name)}
            for column in table.columns:
                if column.name in existing_cols:
                    continue
                ddl = _column_ddl(column)
                stmt = f'ALTER TABLE "{table_name}" ADD COLUMN {ddl}'
                try:
                    conn.execute(text(stmt))
                    changes.append(f"+ {table_name}.{column.name}")
                except Exception as exc:
                    changes.append(f"! FAILED {table_name}.{column.name}: {exc}")
        conn.commit()

    return changes
