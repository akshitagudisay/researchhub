from fastapi import FastAPI, Depends, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from sqlalchemy.orm import Session
from typing import List

from .database import engine, Base, get_db
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

Base.metadata.create_all(bind=engine)

app = FastAPI()
app.include_router(invite_router)
app.include_router(chat_router)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


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
    # Link any accepted collaborator records that existed before account creation
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
    """Return the effective role string for a user on a project."""
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
    """Allow owner and editor. Block viewer."""
    role = _get_user_role(project, user, db)
    if role not in ("owner", "editor"):
        raise HTTPException(
            status_code=403,
            detail="Viewers have read-only access. Ask the project owner to upgrade your role.",
        )


def _require_owner(project: models.Project, user: models.User) -> None:
    """Only the project owner may perform this action."""
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
    _require_owner(project, current_user)   # only owner can delete
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
    if manuscript:
        manuscript.content = payload.content
    else:
        manuscript = models.Manuscript(content=payload.content, project_id=project_id)
        db.add(manuscript)
    db.commit()
    db.refresh(manuscript)
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
    db.commit()
    db.refresh(manuscript)
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


# ── Datasets ──────────────────────────────────────────────────────────────────

@app.get("/projects/{project_id}/datasets", response_model=List[DatasetRead])
def list_datasets(
    project_id: int,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    _get_project_or_404(project_id, current_user, db)
    return (
        db.query(models.Dataset)
        .filter(models.Dataset.project_id == project_id)
        .order_by(models.Dataset.created_at.desc())
        .all()
    )


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
    db.delete(dataset)
    db.commit()


# ── Experiments ───────────────────────────────────────────────────────────────

@app.get("/projects/{project_id}/experiments", response_model=List[ExperimentRead])
def list_experiments(
    project_id: int,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    _get_project_or_404(project_id, current_user, db)
    return (
        db.query(models.Experiment)
        .filter(models.Experiment.project_id == project_id)
        .order_by(models.Experiment.created_at.desc())
        .all()
    )


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
    db.delete(experiment)
    db.commit()


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
    # Prevent duplicate pending requests
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
        raise HTTPException(status_code=400, detail="This request has already been reviewed.")
    req.status = payload.status
    if payload.status == "approved":
        collab = db.query(models.Collaborator).filter(
            models.Collaborator.project_id == req.project_id,
            models.Collaborator.user_id == req.requester_id,
        ).first()
        if collab:
            collab.role = req.requested_role
    db.commit()
    db.refresh(req)
    return req
