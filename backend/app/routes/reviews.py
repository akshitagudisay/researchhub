from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import Optional
from datetime import datetime

from ..database import get_db
from .. import models
from ..auth import get_current_user

router = APIRouter(prefix="/reviews", tags=["reviews"])

VALID_STATUSES = {"pending", "in_review", "approved", "rejected", "revision_requested"}
VALID_DECISIONS = {"approve", "reject", "minor_revision", "major_revision"}


# ── Schemas ───────────────────────────────────────────────────────────────────

class AssignReviewerPayload(BaseModel):
    manuscript_id: int
    reviewer_id: int
    project_id: int


class AddCommentPayload(BaseModel):
    comments: str


class DecisionPayload(BaseModel):
    decision: str
    comments: Optional[str] = None


# ── Helpers ───────────────────────────────────────────────────────────────────

def _review_to_dict(review: models.Review, db: Session) -> dict:
    reviewer = db.query(models.User).filter(models.User.id == review.reviewer_id).first()
    assigner = db.query(models.User).filter(models.User.id == review.assigned_by).first()
    return {
        "id": review.id,
        "manuscript_id": review.manuscript_id,
        "reviewer_id": review.reviewer_id,
        "reviewer_email": reviewer.email if reviewer else None,
        "assigned_by": review.assigned_by,
        "assigned_by_email": assigner.email if assigner else None,
        "status": review.status,
        "comments": review.comments,
        "decision": review.decision,
        "created_at": review.created_at.isoformat(),
        "updated_at": review.updated_at.isoformat() if review.updated_at else None,
    }


def _get_project_for_manuscript(manuscript_id: int, user: models.User, db: Session) -> models.Project:
    manuscript = db.query(models.Manuscript).filter(models.Manuscript.id == manuscript_id).first()
    if not manuscript:
        raise HTTPException(status_code=404, detail="Manuscript not found")
    project = db.query(models.Project).filter(models.Project.id == manuscript.project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    is_owner = project.owner_id == user.id
    is_collab = db.query(models.Collaborator).filter(
        models.Collaborator.project_id == project.id,
        models.Collaborator.user_id == user.id,
    ).first() is not None
    if not is_owner and not is_collab:
        raise HTTPException(status_code=403, detail="Not authorized to access this project")
    return project


# ── Routes ────────────────────────────────────────────────────────────────────

@router.post("/assign")
def assign_reviewer(
    payload: AssignReviewerPayload,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    manuscript = db.query(models.Manuscript).filter(models.Manuscript.id == payload.manuscript_id).first()
    if not manuscript:
        raise HTTPException(status_code=404, detail="Manuscript not found")

    project = db.query(models.Project).filter(models.Project.id == payload.project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    if project.owner_id != current_user.id:
        raise HTTPException(status_code=403, detail="Only the project owner can assign reviewers")

    reviewer = db.query(models.User).filter(models.User.id == payload.reviewer_id).first()
    if not reviewer:
        raise HTTPException(status_code=404, detail="Reviewer user not found")

    existing = db.query(models.Review).filter(
        models.Review.manuscript_id == payload.manuscript_id,
        models.Review.reviewer_id == payload.reviewer_id,
        models.Review.status.notin_(["approved", "rejected"]),
    ).first()
    if existing:
        raise HTTPException(status_code=409, detail="Reviewer already assigned to this manuscript")

    review = models.Review(
        manuscript_id=payload.manuscript_id,
        reviewer_id=payload.reviewer_id,
        assigned_by=current_user.id,
        status="pending",
        updated_at=datetime.utcnow(),
    )
    db.add(review)
    try:
        db.commit()
        db.refresh(review)
    except Exception as exc:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Failed to assign reviewer: {exc}") from exc

    return _review_to_dict(review, db)


@router.get("/project/{project_id}")
def get_project_reviews(
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

    manuscripts = db.query(models.Manuscript).filter(models.Manuscript.project_id == project_id).all()
    ms_ids = [m.id for m in manuscripts]
    if not ms_ids:
        return []

    reviews = db.query(models.Review).filter(models.Review.manuscript_id.in_(ms_ids)).all()
    return [_review_to_dict(r, db) for r in reviews]


@router.get("/manuscript/{manuscript_id}")
def get_manuscript_reviews(
    manuscript_id: int,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    _get_project_for_manuscript(manuscript_id, current_user, db)
    reviews = db.query(models.Review).filter(models.Review.manuscript_id == manuscript_id).all()
    return [_review_to_dict(r, db) for r in reviews]


@router.get("/mine")
def get_my_reviews(
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    reviews = db.query(models.Review).filter(
        models.Review.reviewer_id == current_user.id
    ).order_by(models.Review.created_at.desc()).all()
    return [_review_to_dict(r, db) for r in reviews]


@router.post("/{review_id}/comment")
def add_comment(
    review_id: int,
    payload: AddCommentPayload,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    review = db.query(models.Review).filter(models.Review.id == review_id).first()
    if not review:
        raise HTTPException(status_code=404, detail="Review not found")
    if review.reviewer_id != current_user.id:
        raise HTTPException(status_code=403, detail="Only the assigned reviewer can add comments")

    if review.status == "pending":
        review.status = "in_review"

    review.comments = payload.comments
    review.updated_at = datetime.utcnow()
    try:
        db.commit()
        db.refresh(review)
    except Exception as exc:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Failed to save comment: {exc}") from exc

    return _review_to_dict(review, db)


@router.patch("/{review_id}/decision")
def submit_decision(
    review_id: int,
    payload: DecisionPayload,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if payload.decision not in VALID_DECISIONS:
        raise HTTPException(status_code=422, detail=f"Invalid decision. Must be one of: {', '.join(VALID_DECISIONS)}")

    review = db.query(models.Review).filter(models.Review.id == review_id).first()
    if not review:
        raise HTTPException(status_code=404, detail="Review not found")
    if review.reviewer_id != current_user.id:
        raise HTTPException(status_code=403, detail="Only the assigned reviewer can submit a decision")

    review.decision = payload.decision
    if payload.comments:
        review.comments = payload.comments

    status_map = {
        "approve": "approved",
        "reject": "rejected",
        "minor_revision": "revision_requested",
        "major_revision": "revision_requested",
    }
    review.status = status_map[payload.decision]
    review.updated_at = datetime.utcnow()

    try:
        db.commit()
        db.refresh(review)
    except Exception as exc:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Failed to submit decision: {exc}") from exc

    return _review_to_dict(review, db)


@router.get("/history/{manuscript_id}")
def get_review_history(
    manuscript_id: int,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    _get_project_for_manuscript(manuscript_id, current_user, db)
    reviews = (
        db.query(models.Review)
        .filter(models.Review.manuscript_id == manuscript_id)
        .order_by(models.Review.updated_at.desc())
        .all()
    )
    return [_review_to_dict(r, db) for r in reviews]
