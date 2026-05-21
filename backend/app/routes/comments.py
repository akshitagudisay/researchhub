from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime

from ..database import get_db
from .. import models
from ..auth import get_current_user

router = APIRouter(prefix="/comments", tags=["comments"])

VALID_TARGET_TYPES = {"dataset", "experiment", "section"}


class CommentCreate(BaseModel):
    project_id: int
    target_type: str
    target_id: str
    content: str
    parent_id: Optional[int] = None


class CommentResolvePayload(BaseModel):
    resolved: bool


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


def _serialize(comment: models.Comment, author_email: str, replies: list) -> dict:
    return {
        "id": comment.id,
        "project_id": comment.project_id,
        "target_type": comment.target_type,
        "target_id": comment.target_id,
        "parent_id": comment.parent_id,
        "author_id": comment.author_id,
        "author_email": author_email,
        "content": comment.content,
        "resolved": bool(comment.resolved),
        "created_at": comment.created_at.isoformat(),
        "replies": replies,
    }


@router.get("/project/{project_id}")
def list_comments(
    project_id: int,
    target_type: Optional[str] = None,
    target_id: Optional[str] = None,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    _assert_project_access(project_id, current_user, db)

    query = db.query(models.Comment).filter(
        models.Comment.project_id == project_id,
        models.Comment.parent_id.is_(None),
    )
    if target_type:
        query = query.filter(models.Comment.target_type == target_type)
    if target_id:
        query = query.filter(models.Comment.target_id == target_id)

    top_level = query.order_by(models.Comment.created_at.asc()).all()

    user_cache: dict[int, str] = {}

    def get_email(uid: int) -> str:
        if uid not in user_cache:
            u = db.query(models.User).filter(models.User.id == uid).first()
            user_cache[uid] = u.email if u else "unknown"
        return user_cache[uid]

    def build_replies(parent_id: int) -> list:
        children = (
            db.query(models.Comment)
            .filter(models.Comment.parent_id == parent_id)
            .order_by(models.Comment.created_at.asc())
            .all()
        )
        return [_serialize(c, get_email(c.author_id), build_replies(c.id)) for c in children]

    return [_serialize(c, get_email(c.author_id), build_replies(c.id)) for c in top_level]


@router.post("/project/{project_id}", status_code=201)
def create_comment(
    project_id: int,
    payload: CommentCreate,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    project = _assert_project_access(project_id, current_user, db)
    role = _get_user_role(project, current_user, db)
    if role not in ("owner", "editor"):
        raise HTTPException(status_code=403, detail="Viewers cannot create comments")

    if payload.target_type not in VALID_TARGET_TYPES:
        raise HTTPException(status_code=422, detail=f"Invalid target_type. Must be one of: {', '.join(VALID_TARGET_TYPES)}")

    if payload.parent_id:
        parent = db.query(models.Comment).filter(models.Comment.id == payload.parent_id).first()
        if not parent:
            raise HTTPException(status_code=404, detail="Parent comment not found")

    comment = models.Comment(
        project_id=project_id,
        target_type=payload.target_type,
        target_id=payload.target_id,
        parent_id=payload.parent_id,
        author_id=current_user.id,
        content=payload.content,
        resolved=False,
    )
    db.add(comment)
    db.commit()
    db.refresh(comment)

    return _serialize(comment, current_user.email, [])


@router.patch("/{comment_id}/resolve")
def resolve_comment(
    comment_id: int,
    payload: CommentResolvePayload,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    comment = db.query(models.Comment).filter(models.Comment.id == comment_id).first()
    if not comment:
        raise HTTPException(status_code=404, detail="Comment not found")
    project = _assert_project_access(comment.project_id, current_user, db)
    role = _get_user_role(project, current_user, db)
    if role not in ("owner", "editor"):
        raise HTTPException(status_code=403, detail="Viewers cannot resolve comments")

    comment.resolved = payload.resolved
    db.commit()
    return {"id": comment.id, "resolved": comment.resolved}


@router.delete("/{comment_id}", status_code=204)
def delete_comment(
    comment_id: int,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    comment = db.query(models.Comment).filter(models.Comment.id == comment_id).first()
    if not comment:
        raise HTTPException(status_code=404, detail="Comment not found")
    project = _assert_project_access(comment.project_id, current_user, db)
    role = _get_user_role(project, current_user, db)
    is_author = comment.author_id == current_user.id
    is_owner_or_editor = role in ("owner", "editor")
    if not is_author and not is_owner_or_editor:
        raise HTTPException(status_code=403, detail="Cannot delete this comment")
    db.delete(comment)
    db.commit()
