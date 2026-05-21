from __future__ import annotations

from datetime import datetime
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import RedirectResponse
from sqlalchemy.orm import Session

from ..database import get_db
from .. import models
from ..auth import get_current_user
from ..ipfs_client import compute_cid, verify_integrity, gateway_url

router = APIRouter(prefix="/ipfs", tags=["ipfs"])


def _project_access(project_id: int, user: models.User, db: Session) -> models.Project:
    project = db.query(models.Project).filter(models.Project.id == project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    is_owner = project.owner_id == user.id
    is_collab = db.query(models.Collaborator).filter(
        models.Collaborator.project_id == project_id,
        models.Collaborator.user_id == user.id,
    ).first() is not None
    if not is_owner and not is_collab:
        raise HTTPException(status_code=403, detail="Not authorized")
    return project


# ── Dataset IPFS endpoints ─────────────────────────────────────────────────────

@router.post("/datasets/{dataset_id}/pin")
def pin_dataset(
    dataset_id: int,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    dataset = db.query(models.Dataset).filter(models.Dataset.id == dataset_id).first()
    if not dataset:
        raise HTTPException(status_code=404, detail="Dataset not found")
    _project_access(dataset.project_id, current_user, db)

    if not dataset.file_path or not Path(dataset.file_path).exists():
        raise HTTPException(status_code=404, detail="File not found on server")

    content = Path(dataset.file_path).read_bytes()
    cid = compute_cid(content)
    dataset.ipfs_hash = cid
    dataset.ipfs_uploaded_at = datetime.utcnow()
    dataset.integrity_verified = "verified"
    db.commit()

    return {
        "ipfs_hash": cid,
        "ipfs_uploaded_at": dataset.ipfs_uploaded_at.isoformat(),
        "integrity_verified": dataset.integrity_verified,
        "gateway_url": gateway_url(cid),
    }


@router.get("/datasets/{dataset_id}/verify")
def verify_dataset(
    dataset_id: int,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    dataset = db.query(models.Dataset).filter(models.Dataset.id == dataset_id).first()
    if not dataset:
        raise HTTPException(status_code=404, detail="Dataset not found")
    _project_access(dataset.project_id, current_user, db)

    if not dataset.ipfs_hash:
        raise HTTPException(status_code=400, detail="Dataset has no IPFS hash stored")
    if not dataset.file_path or not Path(dataset.file_path).exists():
        raise HTTPException(status_code=404, detail="File not found on server")

    content = Path(dataset.file_path).read_bytes()
    ok = verify_integrity(content, dataset.ipfs_hash)
    status = "verified" if ok else "tampered"
    dataset.integrity_verified = status
    db.commit()

    return {
        "ipfs_hash": dataset.ipfs_hash,
        "integrity_verified": status,
        "match": ok,
        "gateway_url": gateway_url(dataset.ipfs_hash),
    }


# ── Experiment IPFS endpoints ──────────────────────────────────────────────────

@router.post("/experiments/{experiment_id}/pin")
def pin_experiment(
    experiment_id: int,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    experiment = db.query(models.Experiment).filter(models.Experiment.id == experiment_id).first()
    if not experiment:
        raise HTTPException(status_code=404, detail="Experiment not found")
    _project_access(experiment.project_id, current_user, db)

    if not experiment.attachment_path or not Path(experiment.attachment_path).exists():
        raise HTTPException(status_code=404, detail="Attachment not found on server")

    content = Path(experiment.attachment_path).read_bytes()
    cid = compute_cid(content)
    experiment.ipfs_hash = cid
    experiment.ipfs_uploaded_at = datetime.utcnow()
    experiment.integrity_verified = "verified"
    db.commit()

    return {
        "ipfs_hash": cid,
        "ipfs_uploaded_at": experiment.ipfs_uploaded_at.isoformat(),
        "integrity_verified": experiment.integrity_verified,
        "gateway_url": gateway_url(cid),
    }


@router.get("/experiments/{experiment_id}/verify")
def verify_experiment(
    experiment_id: int,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    experiment = db.query(models.Experiment).filter(models.Experiment.id == experiment_id).first()
    if not experiment:
        raise HTTPException(status_code=404, detail="Experiment not found")
    _project_access(experiment.project_id, current_user, db)

    if not experiment.ipfs_hash:
        raise HTTPException(status_code=400, detail="Experiment has no IPFS hash stored")
    if not experiment.attachment_path or not Path(experiment.attachment_path).exists():
        raise HTTPException(status_code=404, detail="Attachment not found on server")

    content = Path(experiment.attachment_path).read_bytes()
    ok = verify_integrity(content, experiment.ipfs_hash)
    status = "verified" if ok else "tampered"
    experiment.integrity_verified = status
    db.commit()

    return {
        "ipfs_hash": experiment.ipfs_hash,
        "integrity_verified": status,
        "match": ok,
        "gateway_url": gateway_url(experiment.ipfs_hash),
    }


# ── IPFS gateway redirect ──────────────────────────────────────────────────────

@router.get("/gateway/{cid}")
def ipfs_gateway_redirect(cid: str):
    return RedirectResponse(url=gateway_url(cid))
