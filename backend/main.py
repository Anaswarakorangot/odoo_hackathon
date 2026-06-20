from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

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

# Configure CORS - MUST be before other middleware
origins = [
    "http://localhost:5173",
    "http://localhost:3000",
    "http://127.0.0.1:5173",
    "http://127.0.0.1:3000",
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["*"],
)


# Global exception handler to ensure CORS headers on errors
@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    return JSONResponse(
        status_code=500,
        content={"detail": "Internal server error"},
        headers={
            "Access-Control-Allow-Origin": request.headers.get("origin", "*"),
            "Access-Control-Allow-Credentials": "true",
        },
    )


app.include_router(auth.router, prefix="/api")
app.include_router(users.router, prefix="/api")


@app.get("/")
def read_root():
    return {"message": "Welcome to the DriveForge Mini ERP backend"}


@app.get("/health")
def health_check():
    return {"status": "ok"}
