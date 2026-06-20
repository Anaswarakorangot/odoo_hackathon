import re
from datetime import datetime, timedelta
from typing import Optional, List, Tuple

from jose import jwt
from passlib.context import CryptContext

from app.core.config import settings

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


def verify_password(plain_password: str, hashed_password: str) -> bool:
    return pwd_context.verify(plain_password, hashed_password)


def get_password_hash(password: str) -> str:
    return pwd_context.hash(password)


def create_access_token(data: dict, expires_delta: Optional[timedelta] = None) -> str:
    to_encode = data.copy()
    if expires_delta:
        expire = datetime.utcnow() + expires_delta
    else:
        expire = datetime.utcnow() + timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(to_encode, settings.SECRET_KEY, algorithm=settings.ALGORITHM)
    return encoded_jwt


def validate_password(password: str) -> Tuple[bool, List[str]]:
    """
    Validate password against the wireframe rules:
    - Must be more than 8 characters long
    - Must contain a lowercase letter
    - Must contain an uppercase letter
    - Must contain a special character

    Returns a tuple of (is_valid, list_of_errors)
    """
    errors = []

    if len(password) <= 8:
        errors.append("Password must be more than 8 characters long")

    if not re.search(r"[a-z]", password):
        errors.append("Password must contain a lowercase letter")

    if not re.search(r"[A-Z]", password):
        errors.append("Password must contain an uppercase letter")

    # Special characters: anything that's not alphanumeric
    if not re.search(r"[^a-zA-Z0-9]", password):
        errors.append("Password must contain a special character")

    return (len(errors) == 0, errors)
