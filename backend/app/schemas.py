from datetime import datetime
from typing import Literal, Optional
from pydantic import BaseModel, EmailStr

InviteStatus = Literal["pending", "accepted"]
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


class ProjectUpdate(BaseModel):
    title: Optional[str] = None


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


class DatasetUpdate(BaseModel):
    name: Optional[str] = None
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


class ExperimentUpdate(BaseModel):
    name: Optional[str] = None
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


# ── Invite ────────────────────────────────────────────────────────────────────

class InviteCreate(BaseModel):
    email: EmailStr
    project_id: int
    role: UserRole = "viewer"


class InviteRead(BaseModel):
    id: int
    email: str
    role: str
    project_id: int
    invited_by: int
    status: str
    created_at: datetime
    email_warning: Optional[str] = None

    model_config = {"from_attributes": True}


class InvitePreview(BaseModel):
    invite_id: int
    email: str
    role: str
    status: str
    project_title: str
    inviter_email: str
    created_at: datetime


class InviteAcceptResponse(BaseModel):
    message: str
    project_id: int
    project_title: str
    role: str
    collaborator_id: int


# ── Collaborator ──────────────────────────────────────────────────────────────

class CollaboratorRead(BaseModel):
    id: int
    project_id: int
    invite_id: Optional[int]
    email: str
    role: str
    user_id: Optional[int]
    joined_at: datetime

    model_config = {"from_attributes": True}


class RoleUpdatePayload(BaseModel):
    role: Literal["editor", "viewer"]


# ── Access Request ────────────────────────────────────────────────────────────

class AccessRequestCreate(BaseModel):
    requested_role: Literal["editor", "viewer"] = "editor"


class RequestReviewPayload(BaseModel):
    status: Literal["approved", "rejected"]


class AccessRequestRead(BaseModel):
    id: int
    project_id: int
    requester_id: int
    requested_role: str
    status: str
    created_at: datetime

    model_config = {"from_attributes": True}
