from __future__ import annotations

from datetime import datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session
from sqlalchemy.dialects.sqlite import insert as sqlite_insert

from ..database import get_db
from .. import models
from ..auth import get_current_user

router = APIRouter(prefix="/presence", tags=["presence"])

ONLINE_WINDOW_SECONDS = 60


class HeartbeatPayload(BaseModel):
    project_id: int
    current_tab: str | None = None


@router.post("/heartbeat", status_code=200)
def heartbeat(
    payload: HeartbeatPayload,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    project = db.query(models.Project).filter(models.Project.id == payload.project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    is_owner = project.owner_id == current_user.id
    is_collab = db.query(models.Collaborator).filter(
        models.Collaborator.project_id == payload.project_id,
        models.Collaborator.user_id == current_user.id,
    ).first() is not None
    if not is_owner and not is_collab:
        raise HTTPException(status_code=403, detail="Not authorized")

    existing = db.query(models.UserPresence).filter(
        models.UserPresence.user_id == current_user.id,
    ).first()

    if existing:
        existing.project_id = payload.project_id
        existing.last_seen = datetime.utcnow()
        existing.current_tab = payload.current_tab
    else:
        presence = models.UserPresence(
            user_id=current_user.id,
            project_id=payload.project_id,
            last_seen=datetime.utcnow(),
            current_tab=payload.current_tab,
        )
        db.add(presence)

    db.commit()
    return {"status": "ok"}


@router.get("/project/{project_id}")
def get_project_presence(
    project_id: int,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    project = db.query(models.Project).filter(models.Project.id == project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    is_owner = project.owner_id == current_user.id
    is_collab = db.query(models.Collaborator).filter(
        models.Collaborator.project_id == project_id,
        models.Collaborator.user_id == current_user.id,
    ).first() is not None
    if not is_owner and not is_collab:
        raise HTTPException(status_code=403, detail="Not authorized")

    cutoff = datetime.utcnow() - timedelta(seconds=ONLINE_WINDOW_SECONDS)
    active = (
        db.query(models.UserPresence)
        .filter(
            models.UserPresence.project_id == project_id,
            models.UserPresence.last_seen >= cutoff,
        )
        .all()
    )

    results = []
    for p in active:
        user = db.query(models.User).filter(models.User.id == p.user_id).first()
        if not user:
            continue
        results.append({
            "user_id": p.user_id,
            "email": user.email,
            "current_tab": p.current_tab,
            "last_seen": p.last_seen.isoformat(),
            "is_me": p.user_id == current_user.id,
        })

    return results
