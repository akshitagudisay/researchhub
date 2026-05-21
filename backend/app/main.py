from fastapi import FastAPI, Depends, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from sqlalchemy.orm import Session
from typing import List
import json
from datetime import datetime

from .database import engine, Base, get_db, run_migrations
from . import models  # noqa: F401
from .auth import hash_password, verify_password, create_access_token, get_current_user
from .schemas import (
    UserSignup, UserRead, LoginRequest, Token,
    ProjectCreate, ProjectUpdate, ProjectRead,
    ManuscriptSave, ManuscriptRead,
    DatasetCreate, DatasetUpdate, DatasetRead,
    ExperimentCreate, ExperimentUpdate, ExperimentRead,
    CollaboratorRead, RoleUpdatePayload,
    AccessRequestCreate, RequestReviewPayload, AccessRequestRead,
)
from .routes.invite import router as invite_router
from .routes.chat import router as chat_router
from .routes.manuscript_ws import router as manuscript_ws_router
from .routes.citations import router as citations_router
from .routes.contributions import router as contributions_router
from .routes.reviews import router as reviews_router
from .routes.reproducibility import router as reproducibility_router
from .routes.ai_writing import router as ai_writing_router
from .routes.file_manager import router as file_manager_router
from .routes.search import router as search_router
from .routes.presence import router as presence_router
from .routes.ipfs import router as ipfs_router
from .routes.comments import router as comments_router
from .routes.export import router as export_router

Base.metadata.create_all(bind=engine)
run_migrations()

app = FastAPI()
app.include_router(invite_router)
app.include_router(chat_router)
app.include_router(manuscript_ws_router)
app.include_router(citations_router)
app.include_router(contributions_router)
app.include_router(reviews_router)
app.include_router(reproducibility_router)
app.include_router(ai_writing_router)
app.include_router(file_manager_router)
app.include_router(search_router)
app.include_router(presence_router)
app.include_router(ipfs_router)
app.include_router(comments_router)
app.include_router(export_router)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ── Contribution logging helper ────────────────────────────────────────────────

def _log_contribution(db: Session, user_id: int, project_id: int, action_type: str, score: int, meta: dict | None = None):
    contrib = models.Contribution(
        user_id=user_id,
        project_id=project_id,
        action_type=action_type,
        contribution_score=score,
        extra_data=json.dumps(meta or {}),
    )
    db.add(contrib)
    db.commit()


# ── Health ────────────────────────────────────────────────────────────────────

@app.get("/health")
def health_check():
    return {"status": "ok"}


# ── Auth ──────────────────────────────────────────────────────────────────────

@app.post("/auth/signup", response_model=UserRead, status_code=status.HTTP_201_CREATED)
def signup(payload: UserSignup, db: Session = Depends(get_db)):
    if db.query(models.User).filter(models.User.email == payload.email).first():
        raise HTTPException(status_code=400, detail="Email already registered")
    user = models.User(
        email=payload.email,
        hashed_password=hash_password(payload.password),
        role=payload.role,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    db.query(models.Collaborator).filter(
        models.Collaborator.email == payload.email,
        models.Collaborator.user_id.is_(None),
    ).update({"user_id": user.id})
    db.commit()
    return user


@app.post("/auth/login", response_model=Token)
def login(payload: LoginRequest, db: Session = Depends(get_db)):
    user = db.query(models.User).filter(models.User.email == payload.email).first()
    if not user or not verify_password(payload.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password",
            headers={"WWW-Authenticate": "Bearer"},
        )
    return {"access_token": create_access_token(user_id=user.id), "token_type": "bearer"}


@app.get("/users/me", response_model=UserRead)
def get_me(current_user: models.User = Depends(get_current_user)):
    return current_user


# ── Project access helpers ────────────────────────────────────────────────────

def _is_collaborator(project_id: int, user_id: int, db: Session) -> bool:
    return db.query(models.Collaborator).filter(
        models.Collaborator.project_id == project_id,
        models.Collaborator.user_id == user_id,
    ).first() is not None


def _get_user_role(project: models.Project, user: models.User, db: Session) -> str:
    if project.owner_id == user.id:
        return "owner"
    collab = db.query(models.Collaborator).filter(
        models.Collaborator.project_id == project.id,
        models.Collaborator.user_id == user.id,
    ).first()
    return collab.role if collab else "none"


def _get_project_or_404(project_id: int, user: models.User, db: Session) -> models.Project:
    project = db.query(models.Project).filter(models.Project.id == project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    if project.owner_id == user.id:
        return project
    if _is_collaborator(project_id, user.id, db):
        return project
    raise HTTPException(status_code=403, detail="Not authorized to access this project")


def _require_write_access(project: models.Project, user: models.User, db: Session) -> None:
    role = _get_user_role(project, user, db)
    if role not in ("owner", "editor"):
        raise HTTPException(
            status_code=403,
            detail="Viewers have read-only access. Ask the project owner to upgrade your role.",
        )


def _require_owner(project: models.Project, user: models.User) -> None:
    if project.owner_id != user.id:
        raise HTTPException(
            status_code=403,
            detail="Only the project owner can perform this action.",
        )


# ── Projects ──────────────────────────────────────────────────────────────────

@app.get("/projects", response_model=List[ProjectRead])
def list_projects(
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    owned = db.query(models.Project).filter(models.Project.owner_id == current_user.id).all()
    collab_ids = [
        row[0] for row in
        db.query(models.Collaborator.project_id)
        .filter(models.Collaborator.user_id == current_user.id)
        .all()
    ]
    shared = (
        db.query(models.Project).filter(models.Project.id.in_(collab_ids)).all()
    ) if collab_ids else []
    seen = {p.id for p in owned}
    combined = list(owned) + [p for p in shared if p.id not in seen]
    combined.sort(key=lambda p: p.created_at, reverse=True)
    return combined


@app.post("/projects", response_model=ProjectRead, status_code=201)
def create_project(
    payload: ProjectCreate,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    project = models.Project(title=payload.title, owner_id=current_user.id)
    db.add(project)
    db.commit()
    db.refresh(project)
    return project


@app.get("/projects/{project_id}", response_model=ProjectRead)
def get_project(
    project_id: int,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return _get_project_or_404(project_id, current_user, db)


class RoleResponse(BaseModel):
    role: str


@app.get("/projects/{project_id}/my-role", response_model=RoleResponse)
def get_my_role(
    project_id: int,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    project = _get_project_or_404(project_id, current_user, db)
    return {"role": _get_user_role(project, current_user, db)}


@app.patch("/projects/{project_id}", response_model=ProjectRead)
def update_project(
    project_id: int,
    payload: ProjectUpdate,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    project = _get_project_or_404(project_id, current_user, db)
    _require_write_access(project, current_user, db)
    if payload.title is not None:
        project.title = payload.title
    db.commit()
    db.refresh(project)
    return project


@app.delete("/projects/{project_id}", status_code=204)
def delete_project(
    project_id: int,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    project = _get_project_or_404(project_id, current_user, db)
    _require_owner(project, current_user)
    db.delete(project)
    db.commit()


# ── Manuscript ────────────────────────────────────────────────────────────────

@app.get("/projects/{project_id}/manuscript", response_model=ManuscriptRead | None)
def get_manuscript(
    project_id: int,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    _get_project_or_404(project_id, current_user, db)
    return db.query(models.Manuscript).filter(models.Manuscript.project_id == project_id).first()


@app.post("/projects/{project_id}/manuscript", response_model=ManuscriptRead)
def save_manuscript(
    project_id: int,
    payload: ManuscriptSave,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    project = _get_project_or_404(project_id, current_user, db)
    _require_write_access(project, current_user, db)
    manuscript = db.query(models.Manuscript).filter(models.Manuscript.project_id == project_id).first()
    now = datetime.utcnow()
    if manuscript:
        manuscript.content = payload.content
        manuscript.updated_at = now
    else:
        manuscript = models.Manuscript(content=payload.content, project_id=project_id, updated_at=now)
        db.add(manuscript)
    db.commit()
    db.refresh(manuscript)
    _log_contribution(db, current_user.id, project_id, "manuscript_edit", 5)
    return manuscript


@app.patch("/projects/{project_id}/manuscript", response_model=ManuscriptRead)
def update_manuscript(
    project_id: int,
    payload: ManuscriptSave,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    project = _get_project_or_404(project_id, current_user, db)
    _require_write_access(project, current_user, db)
    manuscript = db.query(models.Manuscript).filter(models.Manuscript.project_id == project_id).first()
    if not manuscript:
        raise HTTPException(status_code=404, detail="Manuscript not found")
    manuscript.content = payload.content
    manuscript.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(manuscript)
    _log_contribution(db, current_user.id, project_id, "manuscript_edit", 5)
    return manuscript


@app.delete("/projects/{project_id}/manuscript", status_code=204)
def delete_manuscript(
    project_id: int,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    project = _get_project_or_404(project_id, current_user, db)
    _require_write_access(project, current_user, db)
    manuscript = db.query(models.Manuscript).filter(models.Manuscript.project_id == project_id).first()
    if not manuscript:
        raise HTTPException(status_code=404, detail="Manuscript not found")
    db.delete(manuscript)
    db.commit()


# ── Manuscript Versions ───────────────────────────────────────────────────────

def _version_to_dict(v: models.ManuscriptVersion, db: Session) -> dict:
    saver = db.query(models.User).filter(models.User.id == v.saved_by).first() if v.saved_by else None
    try:
        content_dict = json.loads(v.content)
        preview_text = next(
            (content_dict.get(s, "") for s in ["abstract", "introduction", "methodology", "results", "conclusion"]
             if content_dict.get(s, "").strip()),
            "",
        )
        preview = preview_text[:150].strip()
    except Exception:
        preview = ""
    return {
        "id": v.id,
        "manuscript_id": v.manuscript_id,
        "content": v.content,
        "saved_by": v.saved_by,
        "saved_by_email": saver.email if saver else None,
        "preview": preview,
        "created_at": v.created_at.isoformat(),
    }


@app.post("/projects/{project_id}/manuscript/version", status_code=201)
def save_manuscript_version(
    project_id: int,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    project = _get_project_or_404(project_id, current_user, db)
    _require_write_access(project, current_user, db)
    manuscript = db.query(models.Manuscript).filter(models.Manuscript.project_id == project_id).first()
    if not manuscript:
        raise HTTPException(status_code=404, detail="No manuscript found — save content first")
    version = models.ManuscriptVersion(
        manuscript_id=manuscript.id,
        content=manuscript.content,
        saved_by=current_user.id,
    )
    db.add(version)
    db.commit()
    db.refresh(version)
    return _version_to_dict(version, db)


@app.get("/projects/{project_id}/manuscript/history")
def get_manuscript_history(
    project_id: int,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    _get_project_or_404(project_id, current_user, db)
    manuscript = db.query(models.Manuscript).filter(models.Manuscript.project_id == project_id).first()
    if not manuscript:
        return []
    versions = (
        db.query(models.ManuscriptVersion)
        .filter(models.ManuscriptVersion.manuscript_id == manuscript.id)
        .order_by(models.ManuscriptVersion.created_at.desc())
        .all()
    )
    return [_version_to_dict(v, db) for v in versions]


# ── Datasets ──────────────────────────────────────────────────────────────────

@app.get("/projects/{project_id}/datasets")
def list_datasets(
    project_id: int,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    _get_project_or_404(project_id, current_user, db)
    datasets = (
        db.query(models.Dataset)
        .filter(models.Dataset.project_id == project_id)
        .order_by(models.Dataset.created_at.desc())
        .all()
    )
    result = []
    for d in datasets:
        uploader = db.query(models.User).filter(models.User.id == d.uploaded_by).first() if d.uploaded_by else None
        result.append({
            "id": d.id,
            "name": d.name,
            "description": d.description,
            "file_name": d.file_name,
            "file_size": d.file_size,
            "uploaded_by": d.uploaded_by,
            "uploaded_by_email": uploader.email if uploader else None,
            "stored_filename": d.stored_filename,
            "file_path": d.file_path,
            "has_file": bool(d.file_path),
            "project_id": d.project_id,
            "created_at": d.created_at.isoformat(),
            "ipfs_hash": d.ipfs_hash,
            "ipfs_uploaded_at": d.ipfs_uploaded_at.isoformat() if d.ipfs_uploaded_at else None,
            "integrity_verified": d.integrity_verified,
        })
    return result


@app.post("/projects/{project_id}/datasets", response_model=DatasetRead, status_code=201)
def create_dataset(
    project_id: int,
    payload: DatasetCreate,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    project = _get_project_or_404(project_id, current_user, db)
    _require_write_access(project, current_user, db)
    dataset = models.Dataset(project_id=project_id, **payload.model_dump())
    db.add(dataset)
    db.commit()
    db.refresh(dataset)
    _log_contribution(db, current_user.id, project_id, "dataset_upload", 10, {"name": dataset.name})
    return dataset


@app.get("/projects/{project_id}/datasets/{dataset_id}", response_model=DatasetRead)
def get_dataset(
    project_id: int,
    dataset_id: int,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    _get_project_or_404(project_id, current_user, db)
    dataset = db.query(models.Dataset).filter(
        models.Dataset.id == dataset_id,
        models.Dataset.project_id == project_id,
    ).first()
    if not dataset:
        raise HTTPException(status_code=404, detail="Dataset not found")
    return dataset


@app.patch("/projects/{project_id}/datasets/{dataset_id}", response_model=DatasetRead)
def update_dataset(
    project_id: int,
    dataset_id: int,
    payload: DatasetUpdate,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    project = _get_project_or_404(project_id, current_user, db)
    _require_write_access(project, current_user, db)
    dataset = db.query(models.Dataset).filter(
        models.Dataset.id == dataset_id,
        models.Dataset.project_id == project_id,
    ).first()
    if not dataset:
        raise HTTPException(status_code=404, detail="Dataset not found")
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(dataset, field, value)
    db.commit()
    db.refresh(dataset)
    return dataset


@app.delete("/projects/{project_id}/datasets/{dataset_id}", status_code=204)
def delete_dataset(
    project_id: int,
    dataset_id: int,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    project = _get_project_or_404(project_id, current_user, db)
    _require_write_access(project, current_user, db)
    dataset = db.query(models.Dataset).filter(
        models.Dataset.id == dataset_id,
        models.Dataset.project_id == project_id,
    ).first()
    if not dataset:
        raise HTTPException(status_code=404, detail="Dataset not found")
    file_path = dataset.file_path
    db.delete(dataset)
    db.commit()
    if file_path:
        try:
            import os
            os.remove(file_path)
        except OSError:
            pass


# ── Experiments ───────────────────────────────────────────────────────────────

@app.get("/projects/{project_id}/experiments")
def list_experiments(
    project_id: int,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    _get_project_or_404(project_id, current_user, db)
    experiments = (
        db.query(models.Experiment)
        .filter(models.Experiment.project_id == project_id)
        .order_by(models.Experiment.created_at.desc())
        .all()
    )
    result = []
    for e in experiments:
        result.append({
            "id": e.id,
            "name": e.name,
            "description": e.description,
            "notes": e.notes,
            "attachments": e.attachments,
            "attachment_path": e.attachment_path,
            "attachment_filename": e.attachment_filename,
            "attachment_stored_name": e.attachment_stored_name,
            "linked_dataset_ids": e.linked_dataset_ids,
            "has_attachment": bool(e.attachment_path),
            "project_id": e.project_id,
            "created_at": e.created_at.isoformat(),
            "ipfs_hash": e.ipfs_hash,
            "ipfs_uploaded_at": e.ipfs_uploaded_at.isoformat() if e.ipfs_uploaded_at else None,
            "integrity_verified": e.integrity_verified,
        })
    return result


@app.post("/projects/{project_id}/experiments", response_model=ExperimentRead, status_code=201)
def create_experiment(
    project_id: int,
    payload: ExperimentCreate,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    project = _get_project_or_404(project_id, current_user, db)
    _require_write_access(project, current_user, db)
    experiment = models.Experiment(project_id=project_id, **payload.model_dump())
    db.add(experiment)
    db.commit()
    db.refresh(experiment)
    _log_contribution(db, current_user.id, project_id, "experiment_add", 8, {"name": experiment.name})
    return experiment


@app.get("/projects/{project_id}/experiments/{experiment_id}", response_model=ExperimentRead)
def get_experiment(
    project_id: int,
    experiment_id: int,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    _get_project_or_404(project_id, current_user, db)
    experiment = db.query(models.Experiment).filter(
        models.Experiment.id == experiment_id,
        models.Experiment.project_id == project_id,
    ).first()
    if not experiment:
        raise HTTPException(status_code=404, detail="Experiment not found")
    return experiment


@app.patch("/projects/{project_id}/experiments/{experiment_id}", response_model=ExperimentRead)
def update_experiment(
    project_id: int,
    experiment_id: int,
    payload: ExperimentUpdate,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    project = _get_project_or_404(project_id, current_user, db)
    _require_write_access(project, current_user, db)
    experiment = db.query(models.Experiment).filter(
        models.Experiment.id == experiment_id,
        models.Experiment.project_id == project_id,
    ).first()
    if not experiment:
        raise HTTPException(status_code=404, detail="Experiment not found")
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(experiment, field, value)
    db.commit()
    db.refresh(experiment)
    return experiment


@app.delete("/projects/{project_id}/experiments/{experiment_id}", status_code=204)
def delete_experiment(
    project_id: int,
    experiment_id: int,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    project = _get_project_or_404(project_id, current_user, db)
    _require_write_access(project, current_user, db)
    experiment = db.query(models.Experiment).filter(
        models.Experiment.id == experiment_id,
        models.Experiment.project_id == project_id,
    ).first()
    if not experiment:
        raise HTTPException(status_code=404, detail="Experiment not found")
    attachment_path = experiment.attachment_path
    db.delete(experiment)
    db.commit()
    if attachment_path:
        try:
            import os
            os.remove(attachment_path)
        except OSError:
            pass


# ── Collaborators ─────────────────────────────────────────────────────────────

@app.get("/projects/{project_id}/collaborators", response_model=List[CollaboratorRead])
def list_collaborators(
    project_id: int,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    _get_project_or_404(project_id, current_user, db)
    return (
        db.query(models.Collaborator)
        .filter(models.Collaborator.project_id == project_id)
        .order_by(models.Collaborator.joined_at.desc())
        .all()
    )


@app.patch("/projects/{project_id}/collaborators/{user_id}/role", response_model=CollaboratorRead)
def update_collaborator_role(
    project_id: int,
    user_id: int,
    payload: RoleUpdatePayload,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    project = _get_project_or_404(project_id, current_user, db)
    _require_owner(project, current_user)
    if user_id == project.owner_id:
        raise HTTPException(status_code=403, detail="Cannot change the role of the project owner.")
    collab = db.query(models.Collaborator).filter(
        models.Collaborator.project_id == project_id,
        models.Collaborator.user_id == user_id,
    ).first()
    if not collab:
        raise HTTPException(status_code=404, detail="Collaborator not found.")
    collab.role = payload.role
    db.commit()
    db.refresh(collab)
    return collab


@app.delete("/projects/{project_id}/collaborators/{user_id}", status_code=204)
def remove_collaborator(
    project_id: int,
    user_id: int,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    project = _get_project_or_404(project_id, current_user, db)
    _require_owner(project, current_user)
    if user_id == project.owner_id:
        raise HTTPException(status_code=403, detail="Cannot remove the project owner.")
    collab = db.query(models.Collaborator).filter(
        models.Collaborator.project_id == project_id,
        models.Collaborator.user_id == user_id,
    ).first()
    if not collab:
        raise HTTPException(status_code=404, detail="Collaborator not found.")
    db.delete(collab)
    db.commit()


# ── Access Requests ───────────────────────────────────────────────────────────

@app.post("/projects/{project_id}/request-role", response_model=AccessRequestRead, status_code=201)
def request_role(
    project_id: int,
    payload: AccessRequestCreate,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    project = _get_project_or_404(project_id, current_user, db)
    if project.owner_id == current_user.id:
        raise HTTPException(status_code=403, detail="Project owners cannot submit access requests.")
    existing = db.query(models.AccessRequest).filter(
        models.AccessRequest.project_id == project_id,
        models.AccessRequest.requester_id == current_user.id,
        models.AccessRequest.status == "pending",
    ).first()
    if existing:
        raise HTTPException(status_code=409, detail="You already have a pending access request for this project.")
    req = models.AccessRequest(
        project_id=project_id,
        requester_id=current_user.id,
        requested_role=payload.requested_role,
        status="pending",
    )
    db.add(req)
    db.commit()
    db.refresh(req)
    return req


@app.get("/projects/{project_id}/requests", response_model=List[AccessRequestRead])
def get_access_requests(
    project_id: int,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    project = _get_project_or_404(project_id, current_user, db)
    _require_owner(project, current_user)
    return (
        db.query(models.AccessRequest)
        .filter(
            models.AccessRequest.project_id == project_id,
            models.AccessRequest.status == "pending",
        )
        .order_by(models.AccessRequest.created_at.desc())
        .all()
    )


@app.get("/projects/{project_id}/my-requests", response_model=List[AccessRequestRead])
def get_my_requests(
    project_id: int,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    _get_project_or_404(project_id, current_user, db)
    return (
        db.query(models.AccessRequest)
        .filter(
            models.AccessRequest.project_id == project_id,
            models.AccessRequest.requester_id == current_user.id,
        )
        .order_by(models.AccessRequest.created_at.desc())
        .all()
    )


@app.patch("/requests/{request_id}", response_model=AccessRequestRead)
def review_access_request(
    request_id: int,
    payload: RequestReviewPayload,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    req = db.query(models.AccessRequest).filter(models.AccessRequest.id == request_id).first()
    if not req:
        raise HTTPException(status_code=404, detail="Access request not found.")
    project = _get_project_or_404(req.project_id, current_user, db)
    _require_owner(project, current_user)
    if req.status != "pending":
        raise HTTPException(status_code=409, detail="Request already reviewed.")
    req.status = payload.status
    if payload.status == "approved":
        collab = db.query(models.Collaborator).filter(
            models.Collaborator.project_id == req.project_id,
            models.Collaborator.user_id == req.requester_id,
        ).first()
        if collab:
            collab.role = req.requested_role
        else:
            requester = db.query(models.User).filter(models.User.id == req.requester_id).first()
            collab = models.Collaborator(
                project_id=req.project_id,
                email=requester.email if requester else "",
                role=req.requested_role,
                user_id=req.requester_id,
            )
            db.add(collab)
    db.commit()
    db.refresh(req)
    return req
