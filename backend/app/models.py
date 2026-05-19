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


class Manuscript(Base):
    __tablename__ = "manuscripts"

    id = Column(Integer, primary_key=True, index=True)
    content = Column(Text, nullable=False, default="{}")
    project_id = Column(Integer, ForeignKey("projects.id"), nullable=False, unique=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)

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
    email = Column(String, nullable=False, index=True)
    role = Column(String, default="viewer", nullable=False)
    project_id = Column(Integer, ForeignKey("projects.id"), nullable=False)
    invited_by = Column(Integer, ForeignKey("users.id"), nullable=False)
    status = Column(String, default="pending", nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)

    project = relationship("Project")
    inviter = relationship("User")
