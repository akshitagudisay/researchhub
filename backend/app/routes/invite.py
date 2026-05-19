import os
import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from ..database import get_db
from .. import models
from ..auth import get_current_user
from ..schemas import (
    InviteCreate, InviteRead,
    InvitePreview, InviteAcceptResponse,
)
from ..email_utils import send_email

router = APIRouter(prefix="/invite", tags=["invites"])


def _frontend_url() -> str:
    domain = os.environ.get("REPLIT_DEV_DOMAIN", "")
    if domain:
        return f"https://{domain}"
    return "http://localhost:5000"


# ── Send invite ───────────────────────────────────────────────────────────────

@router.post("", response_model=InviteRead, status_code=status.HTTP_201_CREATED)
def send_invite(
    payload: InviteCreate,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    project = db.query(models.Project).filter(models.Project.id == payload.project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    if project.owner_id != current_user.id:
        raise HTTPException(status_code=403, detail="Only the project owner can send invites")

    token = str(uuid.uuid4())
    invite = models.Invite(
        token=token,
        email=payload.email,
        role=payload.role,
        project_id=payload.project_id,
        invited_by=current_user.id,
        status="pending",
    )
    db.add(invite)
    db.commit()
    db.refresh(invite)

    accept_link = f"{_frontend_url()}/invite/accept/{token}"

    email_warning: str | None = None
    try:
        send_email(
            to_email=payload.email,
            subject=f'You\'ve been invited to collaborate on "{project.title}"',
            body=(
                f"Hi,\n\n"
                f"{current_user.email} has invited you to collaborate on the "
                f'project "{project.title}" on ResearchHub as {payload.role}.\n\n'
                f"Click the link below to accept your invitation:\n"
                f"{accept_link}\n\n"
                f"This link is unique to you — do not share it.\n\n"
                f"-- The ResearchHub Team"
            ),
        )
    except Exception as exc:
        email_warning = str(exc)

    response = InviteRead.model_validate(invite)
    if email_warning:
        response.email_warning = email_warning
    return response


# ── List sent invites ─────────────────────────────────────────────────────────

@router.get("", response_model=list[InviteRead])
def list_invites(
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return (
        db.query(models.Invite)
        .filter(models.Invite.invited_by == current_user.id)
        .order_by(models.Invite.created_at.desc())
        .all()
    )


# ── Preview invite (public — no auth) ────────────────────────────────────────

@router.get("/preview/{token}", response_model=InvitePreview)
def preview_invite(token: str, db: Session = Depends(get_db)):
    invite = db.query(models.Invite).filter(models.Invite.token == token).first()
    if not invite:
        raise HTTPException(status_code=404, detail="Invite not found or link is invalid")
    return InvitePreview(
        invite_id=invite.id,
        email=invite.email,
        role=invite.role,
        status=invite.status,
        project_title=invite.project.title,
        inviter_email=invite.inviter.email,
        created_at=invite.created_at,
    )


# ── Accept invite (public — no auth) ─────────────────────────────────────────

@router.post("/accept/{token}", response_model=InviteAcceptResponse)
def accept_invite(token: str, db: Session = Depends(get_db)):
    invite = db.query(models.Invite).filter(models.Invite.token == token).first()
    if not invite:
        raise HTTPException(status_code=404, detail="Invite not found or link is invalid")
    if invite.status == "accepted":
        existing = (
            db.query(models.Collaborator)
            .filter(models.Collaborator.invite_id == invite.id)
            .first()
        )
        return InviteAcceptResponse(
            message="already_accepted",
            project_id=invite.project_id,
            project_title=invite.project.title,
            role=invite.role,
            collaborator_id=existing.id if existing else 0,
        )

    invite.status = "accepted"

    matched_user = (
        db.query(models.User).filter(models.User.email == invite.email).first()
    )

    collaborator = models.Collaborator(
        project_id=invite.project_id,
        invite_id=invite.id,
        email=invite.email,
        role=invite.role,
        user_id=matched_user.id if matched_user else None,
    )
    db.add(collaborator)
    db.commit()
    db.refresh(collaborator)

    return InviteAcceptResponse(
        message="accepted",
        project_id=invite.project_id,
        project_title=invite.project.title,
        role=invite.role,
        collaborator_id=collaborator.id,
    )
