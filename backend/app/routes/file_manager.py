from __future__ import annotations

import json
import os
import uuid
from datetime import datetime
from pathlib import Path

from fastapi import APIRouter, Depends, Form, HTTPException, UploadFile, File
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session

from ..database import get_db
from .. import models
from ..auth import get_current_user
from ..ipfs_client import compute_cid

router = APIRouter(tags=["files"])

BASE_DIR = Path(__file__).resolve().parents[3]
DATASET_UPLOAD_DIR = BASE_DIR / "uploads" / "datasets"
EXPERIMENT_UPLOAD_DIR = BASE_DIR / "uploads" / "experiments"

DATASET_UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
EXPERIMENT_UPLOAD_DIR.mkdir(parents=True, exist_ok=True)

ALLOWED_DATASET_EXTS = {".csv", ".xlsx", ".json", ".txt", ".zip"}
ALLOWED_EXPERIMENT_EXTS = {".txt", ".csv", ".json", ".png", ".jpg", ".jpeg", ".pdf", ".zip"}
MAX_FILE_SIZE = 50 * 1024 * 1024  # 50 MB


def _format_size(n: int) -> str:
    for unit in ("B", "KB", "MB", "GB"):
        if n < 1024:
            return f"{n:.1f} {unit}"
        n /= 1024
    return f"{n:.1f} GB"


def _get_project_or_403(project_id: int, user: models.User, db: Session) -> models.Project:
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


def _get_user_role(project: models.Project, user: models.User, db: Session) -> str:
    if project.owner_id == user.id:
        return "owner"
    collab = db.query(models.Collaborator).filter(
        models.Collaborator.project_id == project.id,
        models.Collaborator.user_id == user.id,
    ).first()
    return collab.role if collab else "none"


def _require_write(project: models.Project, user: models.User, db: Session) -> None:
    role = _get_user_role(project, user, db)
    if role not in ("owner", "editor"):
        raise HTTPException(status_code=403, detail="Write access required")


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


# ── Dataset Upload ─────────────────────────────────────────────────────────────

@router.post("/projects/{project_id}/datasets/upload")
async def upload_dataset(
    project_id: int,
    file: UploadFile = File(...),
    name: str = Form(...),
    description: str = Form(""),
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    project = _get_project_or_403(project_id, current_user, db)
    _require_write(project, current_user, db)

    original_name = file.filename or "upload"
    ext = Path(original_name).suffix.lower()
    if ext not in ALLOWED_DATASET_EXTS:
        raise HTTPException(
            status_code=422,
            detail=f"File type '{ext}' not allowed. Allowed: {', '.join(sorted(ALLOWED_DATASET_EXTS))}",
        )

    contents = await file.read()
    if len(contents) > MAX_FILE_SIZE:
        raise HTTPException(status_code=413, detail="File exceeds 50 MB limit")
    if len(contents) == 0:
        raise HTTPException(status_code=422, detail="Uploaded file is empty")

    stored_name = f"{uuid.uuid4().hex}{ext}"
    project_dir = DATASET_UPLOAD_DIR / str(project_id)
    project_dir.mkdir(parents=True, exist_ok=True)
    dest = project_dir / stored_name

    try:
        dest.write_bytes(contents)
    except OSError as exc:
        raise HTTPException(status_code=500, detail=f"Failed to save file: {exc}") from exc

    ipfs_hash: str | None = None
    try:
        ipfs_hash = compute_cid(contents)
    except Exception:
        ipfs_hash = None

    dataset = models.Dataset(
        project_id=project_id,
        name=name.strip() or Path(original_name).stem,
        description=description.strip() or None,
        file_name=original_name,
        file_size=_format_size(len(contents)),
        uploaded_by=current_user.id,
        stored_filename=stored_name,
        file_path=str(dest),
        ipfs_hash=ipfs_hash,
        ipfs_uploaded_at=datetime.utcnow() if ipfs_hash else None,
        integrity_verified="verified" if ipfs_hash else None,
    )
    db.add(dataset)
    try:
        db.commit()
        db.refresh(dataset)
    except Exception as exc:
        dest.unlink(missing_ok=True)
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Database error: {exc}") from exc

    _log_contribution(db, current_user.id, project_id, "dataset_upload", 10, {"name": dataset.name})

    uploader = db.query(models.User).filter(models.User.id == current_user.id).first()
    return {
        "id": dataset.id,
        "name": dataset.name,
        "description": dataset.description,
        "file_name": dataset.file_name,
        "file_size": dataset.file_size,
        "uploaded_by": dataset.uploaded_by,
        "uploaded_by_email": uploader.email if uploader else None,
        "stored_filename": dataset.stored_filename,
        "file_path": dataset.file_path,
        "has_file": True,
        "project_id": dataset.project_id,
        "created_at": dataset.created_at.isoformat(),
        "ipfs_hash": dataset.ipfs_hash,
        "ipfs_uploaded_at": dataset.ipfs_uploaded_at.isoformat() if dataset.ipfs_uploaded_at else None,
        "integrity_verified": dataset.integrity_verified,
    }


# ── Dataset Download ───────────────────────────────────────────────────────────

@router.get("/datasets/{dataset_id}/download")
def download_dataset(
    dataset_id: int,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    dataset = db.query(models.Dataset).filter(models.Dataset.id == dataset_id).first()
    if not dataset:
        raise HTTPException(status_code=404, detail="Dataset not found")

    _get_project_or_403(dataset.project_id, current_user, db)

    if not dataset.file_path or not Path(dataset.file_path).exists():
        raise HTTPException(status_code=404, detail="File not found on server")

    return FileResponse(
        path=dataset.file_path,
        filename=dataset.file_name or dataset.stored_filename,
        media_type="application/octet-stream",
    )


# ── Experiment Upload ──────────────────────────────────────────────────────────

@router.post("/projects/{project_id}/experiments/upload")
async def upload_experiment(
    project_id: int,
    name: str = Form(...),
    description: str = Form(""),
    notes: str = Form(""),
    dataset_ids: str = Form(""),
    file: UploadFile | None = File(None),
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    project = _get_project_or_403(project_id, current_user, db)
    _require_write(project, current_user, db)

    attachment_path_str: str | None = None
    original_name: str | None = None
    stored_name: str | None = None

    if file and file.filename:
        original_name = file.filename
        ext = Path(original_name).suffix.lower()
        if ext not in ALLOWED_EXPERIMENT_EXTS:
            raise HTTPException(
                status_code=422,
                detail=f"File type '{ext}' not allowed. Allowed: {', '.join(sorted(ALLOWED_EXPERIMENT_EXTS))}",
            )
        contents = await file.read()
        if len(contents) > MAX_FILE_SIZE:
            raise HTTPException(status_code=413, detail="File exceeds 50 MB limit")
        if len(contents) == 0:
            raise HTTPException(status_code=422, detail="Uploaded file is empty")

        stored_name = f"{uuid.uuid4().hex}{ext}"
        project_dir = EXPERIMENT_UPLOAD_DIR / str(project_id)
        project_dir.mkdir(parents=True, exist_ok=True)
        dest = project_dir / stored_name
        try:
            dest.write_bytes(contents)
            attachment_path_str = str(dest)
        except OSError as exc:
            raise HTTPException(status_code=500, detail=f"Failed to save file: {exc}") from exc

    exp_ipfs_hash: str | None = None
    if attachment_path_str and stored_name:
        try:
            exp_contents = Path(attachment_path_str).read_bytes()
            exp_ipfs_hash = compute_cid(exp_contents)
        except Exception:
            exp_ipfs_hash = None

    experiment = models.Experiment(
        project_id=project_id,
        name=name.strip(),
        description=description.strip() or None,
        notes=notes.strip() or None,
        attachment_path=attachment_path_str,
        attachment_filename=original_name,
        attachment_stored_name=stored_name,
        linked_dataset_ids=dataset_ids.strip() or None,
        ipfs_hash=exp_ipfs_hash,
        ipfs_uploaded_at=datetime.utcnow() if exp_ipfs_hash else None,
        integrity_verified="verified" if exp_ipfs_hash else None,
    )
    db.add(experiment)
    try:
        db.commit()
        db.refresh(experiment)
    except Exception as exc:
        if attachment_path_str:
            Path(attachment_path_str).unlink(missing_ok=True)
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Database error: {exc}") from exc

    # Link datasets via DatasetExperimentLink
    if dataset_ids.strip():
        try:
            ids = [int(x) for x in dataset_ids.split(",") if x.strip().isdigit()]
            for ds_id in ids:
                ds = db.query(models.Dataset).filter(
                    models.Dataset.id == ds_id,
                    models.Dataset.project_id == project_id,
                ).first()
                if ds:
                    existing = db.query(models.DatasetExperimentLink).filter(
                        models.DatasetExperimentLink.dataset_id == ds_id,
                        models.DatasetExperimentLink.experiment_id == experiment.id,
                    ).first()
                    if not existing:
                        link = models.DatasetExperimentLink(
                            dataset_id=ds_id,
                            experiment_id=experiment.id,
                        )
                        db.add(link)
            db.commit()
        except Exception:
            db.rollback()

    _log_contribution(db, current_user.id, project_id, "experiment_add", 8, {"name": experiment.name})

    return {
        "id": experiment.id,
        "name": experiment.name,
        "description": experiment.description,
        "notes": experiment.notes,
        "attachments": experiment.attachments,
        "attachment_path": experiment.attachment_path,
        "attachment_filename": experiment.attachment_filename,
        "attachment_stored_name": experiment.attachment_stored_name,
        "linked_dataset_ids": experiment.linked_dataset_ids,
        "has_attachment": bool(experiment.attachment_path),
        "project_id": experiment.project_id,
        "created_at": experiment.created_at.isoformat(),
        "ipfs_hash": experiment.ipfs_hash,
        "ipfs_uploaded_at": experiment.ipfs_uploaded_at.isoformat() if experiment.ipfs_uploaded_at else None,
        "integrity_verified": experiment.integrity_verified,
    }


# ── Experiment Download ────────────────────────────────────────────────────────

@router.get("/experiments/{experiment_id}/download")
def download_experiment_attachment(
    experiment_id: int,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    experiment = db.query(models.Experiment).filter(models.Experiment.id == experiment_id).first()
    if not experiment:
        raise HTTPException(status_code=404, detail="Experiment not found")

    _get_project_or_403(experiment.project_id, current_user, db)

    if not experiment.attachment_path or not Path(experiment.attachment_path).exists():
        raise HTTPException(status_code=404, detail="Attachment not found on server")

    return FileResponse(
        path=experiment.attachment_path,
        filename=experiment.attachment_filename or experiment.attachment_stored_name,
        media_type="application/octet-stream",
    )
