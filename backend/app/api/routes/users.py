from typing import Annotated
from fastapi import APIRouter, Depends, HTTPException, status
from app.api.dependencies import db_dependency, get_current_user
from app.models.user import User as UserModel
from app.schemas.user import User, UserCreate
from app.core.security import get_password_hash

router = APIRouter(prefix="/users", tags=["users"])

@router.post("/", response_model=User, status_code=status.HTTP_201_CREATED)
def create_user(user: UserCreate, db: db_dependency):
    db_user = db.query(UserModel).filter(UserModel.email == user.email).first()
    if db_user:
        raise HTTPException(status_code=400, detail="Email already registered")
    
    hashed_password = get_password_hash(user.password)
    new_user = UserModel(email=user.email, hashed_password=hashed_password)
    db.add(new_user)
    db.commit()
    db.refresh(new_user)
    return new_user

@router.get("/me", response_model=User)
def read_users_me(current_user: Annotated[UserModel, Depends(get_current_user)]):
    return current_user
