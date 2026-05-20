from __future__ import annotations

import json
from collections import defaultdict
from typing import List

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from ..database import get_db
from .. import models
from ..auth import get_current_user
from ..schemas import ContributionRead, ContributionSummary

router = APIRouter()

ACTION_SCORES = {
    "manuscript_edit": 5,
    "dataset_upload": 10,
    "experiment_add": 8,
    "citation_add": 4,
    "peer_review": 6,
}

ACTION_LABELS = {
    "manuscript_edit": "Edited manuscript",
    "dataset_upload": "Uploaded dataset",
    "experiment_add": "Added experiment",
    "citation_add": "Added citation",
    "peer_review": "Peer review",
}


def _check_access(project_id: int, user: models.User, db: Session) -> bool:
    project = db.query(models.Project).filter(models.Project.id == project_id).first()
    if not project:
        return False
    if project.owner_id == user.id:
        return True
    return db.query(models.Collaborator).filter(
        models.Collaborator.project_id == project_id,
        models.Collaborator.user_id == user.id,
    ).first() is not None


@router.get("/projects/{project_id}/contributions", response_model=List[ContributionRead])
def list_contributions(
    project_id: int,
    limit: int = 100,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if not _check_access(project_id, current_user, db):
        raise HTTPException(status_code=403, detail="No access")
    return (
        db.query(models.Contribution)
        .filter(models.Contribution.project_id == project_id)
        .order_by(models.Contribution.timestamp.desc())
        .limit(limit)
        .all()
    )


@router.get("/projects/{project_id}/contributions/summary")
def get_summary(
    project_id: int,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if not _check_access(project_id, current_user, db):
        raise HTTPException(status_code=403, detail="No access")

    contributions = (
        db.query(models.Contribution)
        .filter(models.Contribution.project_id == project_id)
        .order_by(models.Contribution.timestamp.desc())
        .all()
    )

    user_scores: dict[int, dict] = {}
    for c in contributions:
        if c.user_id not in user_scores:
            user = db.query(models.User).filter(models.User.id == c.user_id).first()
            user_scores[c.user_id] = {
                "user_id": c.user_id,
                "email": user.email if user else f"user_{c.user_id}",
                "total_score": 0,
                "actions": defaultdict(int),
            }
        user_scores[c.user_id]["total_score"] += c.contribution_score
        user_scores[c.user_id]["actions"][c.action_type] += 1

    total_score = sum(u["total_score"] for u in user_scores.values())

    contributors = []
    for uid, data in user_scores.items():
        pct = round((data["total_score"] / total_score * 100), 1) if total_score > 0 else 0.0
        contributors.append({
            "user_id": uid,
            "email": data["email"],
            "total_score": data["total_score"],
            "percentage": pct,
            "actions": dict(data["actions"]),
        })

    contributors.sort(key=lambda x: x["total_score"], reverse=True)

    recent_activity = []
    for c in contributions[:30]:
        user = db.query(models.User).filter(models.User.id == c.user_id).first()
        recent_activity.append({
            "action_type": c.action_type,
            "label": ACTION_LABELS.get(c.action_type, c.action_type),
            "email": user.email if user else f"user_{c.user_id}",
            "score": c.contribution_score,
            "timestamp": c.timestamp.isoformat(),
        })

    return {
        "contributors": contributors,
        "total_score": total_score,
        "recent_activity": recent_activity,
        "action_scores": ACTION_SCORES,
    }
