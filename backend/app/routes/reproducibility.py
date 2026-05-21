from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import Optional

from ..database import get_db
from .. import models
from ..auth import get_current_user

router = APIRouter(prefix="/reproducibility", tags=["reproducibility"])

VALID_SECTIONS = {"abstract", "introduction", "methodology", "results", "conclusion"}


# ── Schemas ───────────────────────────────────────────────────────────────────

class LinkDatasetPayload(BaseModel):
    dataset_id: int
    experiment_id: int
    project_id: int
    relationship_note: Optional[str] = None


class LinkExperimentPayload(BaseModel):
    experiment_id: int
    manuscript_section: str
    project_id: int
    figure_reference: Optional[str] = None
    description: Optional[str] = None


# ── Helpers ───────────────────────────────────────────────────────────────────

def _assert_project_access(project_id: int, user: models.User, db: Session) -> models.Project:
    project = db.query(models.Project).filter(models.Project.id == project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    is_owner = project.owner_id == user.id
    is_collab = db.query(models.Collaborator).filter(
        models.Collaborator.project_id == project_id,
        models.Collaborator.user_id == user.id,
    ).first() is not None
    if not is_owner and not is_collab:
        raise HTTPException(status_code=403, detail="Not authorized to access this project")
    return project


def _assert_write_access(project: models.Project, user: models.User, db: Session) -> None:
    if project.owner_id == user.id:
        return
    collab = db.query(models.Collaborator).filter(
        models.Collaborator.project_id == project.id,
        models.Collaborator.user_id == user.id,
    ).first()
    if not collab or collab.role not in ("editor",):
        raise HTTPException(status_code=403, detail="Write access required")


# ── Routes ────────────────────────────────────────────────────────────────────

@router.post("/link-dataset")
def link_dataset_to_experiment(
    payload: LinkDatasetPayload,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    project = _assert_project_access(payload.project_id, current_user, db)
    _assert_write_access(project, current_user, db)

    dataset = db.query(models.Dataset).filter(
        models.Dataset.id == payload.dataset_id,
        models.Dataset.project_id == payload.project_id,
    ).first()
    if not dataset:
        raise HTTPException(status_code=404, detail="Dataset not found in this project")

    experiment = db.query(models.Experiment).filter(
        models.Experiment.id == payload.experiment_id,
        models.Experiment.project_id == payload.project_id,
    ).first()
    if not experiment:
        raise HTTPException(status_code=404, detail="Experiment not found in this project")

    existing = db.query(models.DatasetExperimentLink).filter(
        models.DatasetExperimentLink.dataset_id == payload.dataset_id,
        models.DatasetExperimentLink.experiment_id == payload.experiment_id,
    ).first()
    if existing:
        raise HTTPException(status_code=409, detail="This dataset-experiment link already exists")

    link = models.DatasetExperimentLink(
        dataset_id=payload.dataset_id,
        experiment_id=payload.experiment_id,
        relationship_note=payload.relationship_note,
    )
    db.add(link)
    try:
        db.commit()
        db.refresh(link)
    except Exception as exc:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Failed to create link: {exc}") from exc

    return {
        "id": link.id,
        "dataset_id": link.dataset_id,
        "dataset_name": dataset.name,
        "experiment_id": link.experiment_id,
        "experiment_name": experiment.name,
        "relationship_note": link.relationship_note,
        "created_at": link.created_at.isoformat(),
    }


@router.post("/link-experiment")
def link_experiment_to_manuscript(
    payload: LinkExperimentPayload,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    project = _assert_project_access(payload.project_id, current_user, db)
    _assert_write_access(project, current_user, db)

    if payload.manuscript_section not in VALID_SECTIONS:
        raise HTTPException(
            status_code=422,
            detail=f"Invalid section. Must be one of: {', '.join(sorted(VALID_SECTIONS))}",
        )

    experiment = db.query(models.Experiment).filter(
        models.Experiment.id == payload.experiment_id,
        models.Experiment.project_id == payload.project_id,
    ).first()
    if not experiment:
        raise HTTPException(status_code=404, detail="Experiment not found in this project")

    existing = db.query(models.ExperimentManuscriptLink).filter(
        models.ExperimentManuscriptLink.experiment_id == payload.experiment_id,
        models.ExperimentManuscriptLink.manuscript_section == payload.manuscript_section,
    ).first()
    if existing:
        raise HTTPException(
            status_code=409,
            detail=f"Experiment already linked to the '{payload.manuscript_section}' section",
        )

    link = models.ExperimentManuscriptLink(
        experiment_id=payload.experiment_id,
        manuscript_section=payload.manuscript_section,
        figure_reference=payload.figure_reference,
        description=payload.description,
    )
    db.add(link)
    try:
        db.commit()
        db.refresh(link)
    except Exception as exc:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Failed to create link: {exc}") from exc

    return {
        "id": link.id,
        "experiment_id": link.experiment_id,
        "experiment_name": experiment.name,
        "manuscript_section": link.manuscript_section,
        "figure_reference": link.figure_reference,
        "description": link.description,
        "created_at": link.created_at.isoformat(),
    }


@router.delete("/link-dataset/{link_id}")
def delete_dataset_link(
    link_id: int,
    project_id: int,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    project = _assert_project_access(project_id, current_user, db)
    _assert_write_access(project, current_user, db)
    link = db.query(models.DatasetExperimentLink).filter(
        models.DatasetExperimentLink.id == link_id
    ).first()
    if not link:
        raise HTTPException(status_code=404, detail="Link not found")
    db.delete(link)
    db.commit()


@router.delete("/link-experiment/{link_id}")
def delete_experiment_link(
    link_id: int,
    project_id: int,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    project = _assert_project_access(project_id, current_user, db)
    _assert_write_access(project, current_user, db)
    link = db.query(models.ExperimentManuscriptLink).filter(
        models.ExperimentManuscriptLink.id == link_id
    ).first()
    if not link:
        raise HTTPException(status_code=404, detail="Link not found")
    db.delete(link)
    db.commit()


@router.get("/project/{project_id}")
def get_reproducibility_graph(
    project_id: int,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    _assert_project_access(project_id, current_user, db)

    datasets = db.query(models.Dataset).filter(models.Dataset.project_id == project_id).all()
    experiments = db.query(models.Experiment).filter(models.Experiment.project_id == project_id).all()

    ds_ids = {d.id for d in datasets}
    exp_ids = {e.id for e in experiments}

    ds_links = (
        db.query(models.DatasetExperimentLink)
        .filter(models.DatasetExperimentLink.dataset_id.in_(ds_ids))
        .all()
    ) if ds_ids else []

    exp_links = (
        db.query(models.ExperimentManuscriptLink)
        .filter(models.ExperimentManuscriptLink.experiment_id.in_(exp_ids))
        .all()
    ) if exp_ids else []

    return {
        "datasets": [
            {"id": d.id, "name": d.name, "description": d.description, "created_at": d.created_at.isoformat()}
            for d in datasets
        ],
        "experiments": [
            {"id": e.id, "name": e.name, "description": e.description, "created_at": e.created_at.isoformat()}
            for e in experiments
        ],
        "dataset_experiment_links": [
            {
                "id": l.id,
                "dataset_id": l.dataset_id,
                "experiment_id": l.experiment_id,
                "relationship_note": l.relationship_note,
            }
            for l in ds_links
        ],
        "experiment_manuscript_links": [
            {
                "id": l.id,
                "experiment_id": l.experiment_id,
                "manuscript_section": l.manuscript_section,
                "figure_reference": l.figure_reference,
                "description": l.description,
            }
            for l in exp_links
        ],
    }
