from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.routes import auth, users
from app.db.database import engine, Base, SessionLocal
from app.db.seed_permissions import seed_role_permissions

# Import all models so they are registered with Base.metadata
import app.models  # noqa: F401


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Create all tables on startup
    Base.metadata.create_all(bind=engine)

    # Seed role_permissions if table is empty (idempotent)
    db = SessionLocal()
    try:
        seeded = seed_role_permissions(db)
        if seeded:
            print("[OK] Seeded default role_permissions")
        else:
            print("[OK] role_permissions already populated")
    finally:
        db.close()

    yield
    # Cleanup on shutdown (if needed)


app = FastAPI(title="DriveForge Mini ERP", lifespan=lifespan)

# Configure CORS
origins = [
    "http://localhost:5173",  # Vite default port
    "http://localhost:3000",
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router, prefix="/api")
app.include_router(users.router, prefix="/api")


@app.get("/")
def read_root():
    return {"message": "Welcome to the DriveForge Mini ERP backend"}
