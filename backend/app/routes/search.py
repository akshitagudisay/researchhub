from __future__ import annotations

import json
from typing import Optional

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from ..database import get_db
from .. import models
from ..auth import get_current_user

router = APIRouter(prefix="/search", tags=["search"])


def _accessible_project_ids(user: models.User, db: Session) -> list[int]:
    owned = [
        row[0]
        for row in db.query(models.Project.id)
        .filter(models.Project.owner_id == user.id)
        .all()
    ]
    collab = [
        row[0]
        for row in db.query(models.Collaborator.project_id)
        .filter(models.Collaborator.user_id == user.id)
        .all()
    ]
    return list(set(owned + collab))


def _highlight(text: str | None, q: str) -> str | None:
    if not text or not q:
        return text
    lower_text = text.lower()
    lower_q = q.lower()
    idx = lower_text.find(lower_q)
    if idx == -1:
        return text
    start = max(0, idx - 40)
    end = min(len(text), idx + len(q) + 80)
    snippet = ("…" if start > 0 else "") + text[start:end] + ("…" if end < len(text) else "")
    return snippet


def _get_collab_role(user_id: int, project_id: int, owner_id: int, db: Session) -> str:
    if user_id == owner_id:
        return "owner"
    collab = (
        db.query(models.Collaborator)
        .filter(
            models.Collaborator.project_id == project_id,
            models.Collaborator.user_id == user_id,
        )
        .first()
    )
    return collab.role if collab else "viewer"


@router.get("/projects")
def search_projects(
    q: str = Query(default="", description="Keyword to search in project title"),
    role: Optional[str] = Query(default=None, description="Filter by role: owner, editor, viewer"),
    created_by: Optional[str] = Query(default=None, description="'me' to show only owned projects"),
    collaborator: Optional[str] = Query(default=None, description="Filter by collaborator email"),
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    project_ids = _accessible_project_ids(current_user, db)
    if not project_ids:
        return []

    query = db.query(models.Project).filter(models.Project.id.in_(project_ids))

    if q.strip():
        query = query.filter(models.Project.title.ilike(f"%{q.strip()}%"))

    if created_by == "me":
        query = query.filter(models.Project.owner_id == current_user.id)

    if collaborator:
        collab_project_ids = [
            row[0]
            for row in db.query(models.Collaborator.project_id)
            .join(models.User, models.Collaborator.user_id == models.User.id)
            .filter(models.User.email.ilike(f"%{collaborator}%"))
            .all()
        ]
        query = query.filter(models.Project.id.in_(collab_project_ids))

    projects = query.order_by(models.Project.created_at.desc()).all()

    results = []
    for p in projects:
        user_role = _get_collab_role(current_user.id, p.id, p.owner_id, db)
        if role and role != "owner" and user_role != role:
            continue
        if role == "owner" and p.owner_id != current_user.id:
            continue
        owner = db.query(models.User).filter(models.User.id == p.owner_id).first()
        results.append({
            "id": p.id,
            "title": p.title,
            "owner_id": p.owner_id,
            "owner_email": owner.email if owner else None,
            "user_role": user_role,
            "created_at": p.created_at.isoformat(),
            "snippet": _highlight(p.title, q) if q.strip() else None,
        })

    return results


@router.get("/manuscripts")
def search_manuscripts(
    q: str = Query(default="", description="Keyword to search in manuscript content"),
    project_id: Optional[int] = Query(default=None, description="Scope to a specific project"),
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if not q.strip():
        return []

    project_ids = _accessible_project_ids(current_user, db)
    if not project_ids:
        return []

    if project_id is not None:
        if project_id not in project_ids:
            return []
        project_ids = [project_id]

    manuscripts = (
        db.query(models.Manuscript)
        .filter(
            models.Manuscript.project_id.in_(project_ids),
            models.Manuscript.content.ilike(f"%{q.strip()}%"),
        )
        .all()
    )

    results = []
    for m in manuscripts:
        project = db.query(models.Project).filter(models.Project.id == m.project_id).first()
        snippet = None
        matched_section = None
        try:
            content = json.loads(m.content)
            for section in ("abstract", "introduction", "methodology", "results", "conclusion"):
                text = content.get(section, "")
                if text and q.lower() in text.lower():
                    snippet = _highlight(text, q)
                    matched_section = section
                    break
        except Exception:
            snippet = _highlight(m.content[:300], q)

        results.append({
            "id": m.id,
            "project_id": m.project_id,
            "project_title": project.title if project else None,
            "matched_section": matched_section,
            "snippet": snippet,
            "updated_at": m.updated_at.isoformat() if m.updated_at else m.created_at.isoformat(),
        })

    return results


@router.get("/datasets")
def search_datasets(
    q: str = Query(default="", description="Keyword to search in dataset name/description"),
    project_id: Optional[int] = Query(default=None, description="Scope to a specific project"),
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    project_ids = _accessible_project_ids(current_user, db)
    if not project_ids:
        return []

    if project_id is not None:
        if project_id not in project_ids:
            return []
        project_ids = [project_id]

    query = db.query(models.Dataset).filter(models.Dataset.project_id.in_(project_ids))

    if q.strip():
        query = query.filter(
            models.Dataset.name.ilike(f"%{q.strip()}%")
            | models.Dataset.description.ilike(f"%{q.strip()}%")
        )

    datasets = query.order_by(models.Dataset.created_at.desc()).limit(50).all()

    results = []
    for d in datasets:
        project = db.query(models.Project).filter(models.Project.id == d.project_id).first()
        uploader = db.query(models.User).filter(models.User.id == d.uploaded_by).first() if d.uploaded_by else None
        results.append({
            "id": d.id,
            "name": d.name,
            "description": d.description,
            "file_name": d.file_name,
            "file_size": d.file_size,
            "has_file": bool(d.file_path),
            "uploaded_by_email": uploader.email if uploader else None,
            "project_id": d.project_id,
            "project_title": project.title if project else None,
            "snippet": _highlight(d.description or d.name, q) if q.strip() else None,
            "created_at": d.created_at.isoformat(),
        })

    return results


@router.get("/experiments")
def search_experiments(
    q: str = Query(default="", description="Keyword to search in experiment name/notes"),
    project_id: Optional[int] = Query(default=None, description="Scope to a specific project"),
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    project_ids = _accessible_project_ids(current_user, db)
    if not project_ids:
        return []

    if project_id is not None:
        if project_id not in project_ids:
            return []
        project_ids = [project_id]

    query = db.query(models.Experiment).filter(models.Experiment.project_id.in_(project_ids))

    if q.strip():
        query = query.filter(
            models.Experiment.name.ilike(f"%{q.strip()}%")
            | models.Experiment.description.ilike(f"%{q.strip()}%")
            | models.Experiment.notes.ilike(f"%{q.strip()}%")
        )

    experiments = query.order_by(models.Experiment.created_at.desc()).limit(50).all()

    results = []
    for e in experiments:
        project = db.query(models.Project).filter(models.Project.id == e.project_id).first()
        results.append({
            "id": e.id,
            "name": e.name,
            "description": e.description,
            "notes": e.notes,
            "has_attachment": bool(e.attachment_path),
            "project_id": e.project_id,
            "project_title": project.title if project else None,
            "snippet": _highlight(e.notes or e.description or e.name, q) if q.strip() else None,
            "created_at": e.created_at.isoformat(),
        })

    return results
