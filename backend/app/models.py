from datetime import datetime
from sqlalchemy import Column, Integer, String, Text, DateTime, ForeignKey
from sqlalchemy.orm import relationship
from .database import Base


class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    email = Column(String, unique=True, index=True, nullable=False)
    hashed_password = Column(String, nullable=False)
    role = Column(String, default="viewer", nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)

    projects = relationship("Project", back_populates="owner")


class Project(Base):
    __tablename__ = "projects"

    id = Column(Integer, primary_key=True, index=True)
    title = Column(String, nullable=False)
    owner_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)

    owner = relationship("User", back_populates="projects")
    manuscripts = relationship("Manuscript", back_populates="project")
    datasets = relationship("Dataset", back_populates="project")
    experiments = relationship("Experiment", back_populates="project")
    collaborators = relationship("Collaborator", back_populates="project")


class Manuscript(Base):
    __tablename__ = "manuscripts"

    id = Column(Integer, primary_key=True, index=True)
    content = Column(Text, nullable=False, default="{}")
    project_id = Column(Integer, ForeignKey("projects.id"), nullable=False, unique=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, nullable=True)

    project = relationship("Project", back_populates="manuscripts")


class Dataset(Base):
    __tablename__ = "datasets"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False)
    description = Column(Text, nullable=True)
    file_name = Column(String, nullable=True)
    file_size = Column(String, nullable=True)
    project_id = Column(Integer, ForeignKey("projects.id"), nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)

    project = relationship("Project", back_populates="datasets")


class Experiment(Base):
    __tablename__ = "experiments"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False)
    description = Column(Text, nullable=True)
    notes = Column(Text, nullable=True)
    attachments = Column(Text, nullable=True)
    project_id = Column(Integer, ForeignKey("projects.id"), nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)

    project = relationship("Project", back_populates="experiments")


class Invite(Base):
    __tablename__ = "invites"

    id = Column(Integer, primary_key=True, index=True)
    token = Column(String, unique=True, index=True, nullable=False)
    email = Column(String, nullable=False, index=True)
    role = Column(String, default="viewer", nullable=False)
    project_id = Column(Integer, ForeignKey("projects.id"), nullable=False)
    invited_by = Column(Integer, ForeignKey("users.id"), nullable=False)
    status = Column(String, default="pending", nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)

    project = relationship("Project")
    inviter = relationship("User")


class Collaborator(Base):
    __tablename__ = "collaborators"

    id = Column(Integer, primary_key=True, index=True)
    project_id = Column(Integer, ForeignKey("projects.id"), nullable=False)
    invite_id = Column(Integer, ForeignKey("invites.id"), nullable=True)
    email = Column(String, nullable=False)
    role = Column(String, nullable=False, default="viewer")
    user_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    joined_at = Column(DateTime, default=datetime.utcnow, nullable=False)

    project = relationship("Project", back_populates="collaborators")
    invite = relationship("Invite")
    user = relationship("User")


class AccessRequest(Base):
    __tablename__ = "access_requests"

    id = Column(Integer, primary_key=True, index=True)
    project_id = Column(Integer, ForeignKey("projects.id"), nullable=False)
    requester_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    requested_role = Column(String, nullable=False, default="editor")
    status = Column(String, nullable=False, default="pending")
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)

    project = relationship("Project")
    requester = relationship("User")


class ChatMessage(Base):
    __tablename__ = "chat_messages"

    id = Column(Integer, primary_key=True, index=True)
    project_id = Column(Integer, ForeignKey("projects.id"), nullable=False)
    sender_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    content = Column(Text, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)

    project = relationship("Project")
    sender = relationship("User")


# ── Sprint 3: Citation Management ─────────────────────────────────────────────

class Citation(Base):
    __tablename__ = "citations"

    id = Column(Integer, primary_key=True, index=True)
    project_id = Column(Integer, ForeignKey("projects.id"), nullable=False)
    doi = Column(String, nullable=True)
    title = Column(Text, nullable=False)
    authors = Column(Text, nullable=False, default="[]")  # JSON array string
    journal = Column(String, nullable=True)
    year = Column(Integer, nullable=True)
    citation_type = Column(String, default="article", nullable=False)
    formatted_apa = Column(Text, nullable=True)
    formatted_ieee = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)

    project = relationship("Project")


# ── Sprint 3: Contribution Tracking ───────────────────────────────────────────

class Contribution(Base):
    __tablename__ = "contributions"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    project_id = Column(Integer, ForeignKey("projects.id"), nullable=False)
    action_type = Column(String, nullable=False)  # manuscript_edit, dataset_upload, experiment_add, citation_add
    contribution_score = Column(Integer, default=0, nullable=False)
    extra_data = Column(Text, nullable=True)  # JSON string for extra context
    timestamp = Column(DateTime, default=datetime.utcnow, nullable=False)

    user = relationship("User")
    project = relationship("Project")


# ── Sprint 3: Manuscript Versions ─────────────────────────────────────────────

class ManuscriptVersion(Base):
    __tablename__ = "manuscript_versions"

    id = Column(Integer, primary_key=True, index=True)
    manuscript_id = Column(Integer, ForeignKey("manuscripts.id"), nullable=False)
    content = Column(Text, nullable=False)
    saved_by = Column(Integer, ForeignKey("users.id"), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)

    manuscript = relationship("Manuscript")
    saver = relationship("User")
