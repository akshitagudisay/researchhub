from fastapi import FastAPI, Depends, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware
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
    CollaboratorRead,
)
from .routes.invite import router as invite_router

Base.metadata.create_all(bind=engine)

app = FastAPI()
app.include_router(invite_router)

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
    # Link any accepted collaborator records that were created before this account existed
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


# ── Projects ──────────────────────────────────────────────────────────────────

def _is_collaborator(project_id: int, user_id: int, db: Session) -> bool:
    return db.query(models.Collaborator).filter(
        models.Collaborator.project_id == project_id,
        models.Collaborator.user_id == user_id,
    ).first() is not None


def _get_project_or_404(project_id: int, user: models.User, db: Session) -> models.Project:
    project = db.query(models.Project).filter(models.Project.id == project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    if project.owner_id == user.id:
        return project
    if _is_collaborator(project_id, user.id, db):
        return project
    raise HTTPException(status_code=403, detail="Not authorized to access this project")


@app.get("/projects", response_model=List[ProjectRead])
def list_projects(
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    owned = (
        db.query(models.Project)
        .filter(models.Project.owner_id == current_user.id)
        .all()
    )
    collab_ids = [
        row[0] for row in
        db.query(models.Collaborator.project_id)
        .filter(models.Collaborator.user_id == current_user.id)
        .all()
    ]
    shared = (
        db.query(models.Project)
        .filter(models.Project.id.in_(collab_ids))
        .all()
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


@app.patch("/projects/{project_id}", response_model=ProjectRead)
def update_project(
    project_id: int,
    payload: ProjectUpdate,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    project = _get_project_or_404(project_id, current_user, db)
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
    db.delete(project)
    db.commit()


# ── Manuscript (one per project, upsert) ──────────────────────────────────────

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
    _get_project_or_404(project_id, current_user, db)
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
    _get_project_or_404(project_id, current_user, db)
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
    _get_project_or_404(project_id, current_user, db)
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
    _get_project_or_404(project_id, current_user, db)
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
    _get_project_or_404(project_id, current_user, db)
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
    _get_project_or_404(project_id, current_user, db)
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
    _get_project_or_404(project_id, current_user, db)
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
    _get_project_or_404(project_id, current_user, db)
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


@app.delete("/projects/{project_id}/experiments/{experiment_id}", status_code=204)
def delete_experiment(
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
    db.delete(experiment)
    db.commit()
