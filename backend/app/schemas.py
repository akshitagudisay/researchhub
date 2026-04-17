from datetime import datetime
from pydantic import BaseModel, EmailStr


# ── User ──────────────────────────────────────────────────────────────────────

class UserCreate(BaseModel):
    email: EmailStr
    hashed_password: str
    role: str = "user"


class UserRead(BaseModel):
    id: int
    email: EmailStr
    role: str
    created_at: datetime

    model_config = {"from_attributes": True}


# ── Project ───────────────────────────────────────────────────────────────────

class ProjectCreate(BaseModel):
    title: str
    owner_id: int


class ProjectRead(BaseModel):
    id: int
    title: str
    owner_id: int
    created_at: datetime

    model_config = {"from_attributes": True}


# ── Manuscript ────────────────────────────────────────────────────────────────

class ManuscriptCreate(BaseModel):
    content: str
    project_id: int


class ManuscriptRead(BaseModel):
    id: int
    content: str
    project_id: int
    created_at: datetime

    model_config = {"from_attributes": True}


# ── Dataset ───────────────────────────────────────────────────────────────────

class DatasetCreate(BaseModel):
    name: str
    project_id: int


class DatasetRead(BaseModel):
    id: int
    name: str
    project_id: int
    created_at: datetime

    model_config = {"from_attributes": True}


# ── Experiment ────────────────────────────────────────────────────────────────

class ExperimentCreate(BaseModel):
    name: str
    project_id: int


class ExperimentRead(BaseModel):
    id: int
    name: str
    project_id: int
    created_at: datetime

    model_config = {"from_attributes": True}
