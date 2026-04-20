from datetime import datetime
from typing import Literal, Optional
from pydantic import BaseModel, EmailStr

UserRole = Literal["owner", "editor", "viewer"]


# ── User ──────────────────────────────────────────────────────────────────────

class UserSignup(BaseModel):
    email: EmailStr
    password: str
    role: UserRole = "viewer"


class UserCreate(BaseModel):
    email: EmailStr
    hashed_password: str
    role: UserRole = "viewer"


class UserRead(BaseModel):
    id: int
    email: EmailStr
    role: str
    created_at: datetime

    model_config = {"from_attributes": True}


# ── Auth / Token ──────────────────────────────────────────────────────────────

class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class Token(BaseModel):
    access_token: str
    token_type: str = "bearer"


class TokenData(BaseModel):
    user_id: int | None = None


# ── Project ───────────────────────────────────────────────────────────────────

class ProjectCreate(BaseModel):
    title: str


class ProjectRead(BaseModel):
    id: int
    title: str
    owner_id: int
    created_at: datetime

    model_config = {"from_attributes": True}


# ── Manuscript ────────────────────────────────────────────────────────────────

class ManuscriptSave(BaseModel):
    content: str


class ManuscriptRead(BaseModel):
    id: int
    content: str
    project_id: int
    created_at: datetime

    model_config = {"from_attributes": True}


# ── Dataset ───────────────────────────────────────────────────────────────────

class DatasetCreate(BaseModel):
    name: str
    description: Optional[str] = None
    file_name: Optional[str] = None
    file_size: Optional[str] = None


class DatasetRead(BaseModel):
    id: int
    name: str
    description: Optional[str]
    file_name: Optional[str]
    file_size: Optional[str]
    project_id: int
    created_at: datetime

    model_config = {"from_attributes": True}


# ── Experiment ────────────────────────────────────────────────────────────────

class ExperimentCreate(BaseModel):
    name: str
    description: Optional[str] = None
    notes: Optional[str] = None
    attachments: Optional[str] = None


class ExperimentRead(BaseModel):
    id: int
    name: str
    description: Optional[str]
    notes: Optional[str]
    attachments: Optional[str]
    project_id: int
    created_at: datetime

    model_config = {"from_attributes": True}
