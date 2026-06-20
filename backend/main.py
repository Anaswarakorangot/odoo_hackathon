from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.api.routes import auth, users
from app.db.database import engine, Base

# Create DB tables
Base.metadata.create_all(bind=engine)

app = FastAPI(title="FastAPI + React App")

# Configure CORS
origins = [
    "http://localhost:5173", # Vite default port
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
    return {"message": "Welcome to the FastAPI backend"}
