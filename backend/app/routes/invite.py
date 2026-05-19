from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from ..database import get_db
from .. import models
from ..auth import get_current_user
from ..schemas import InviteCreate, InviteRead
from ..email_utils import send_email

router = APIRouter(prefix="/invite", tags=["invites"])


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

    invite = models.Invite(
        email=payload.email,
        role=payload.role,
        project_id=payload.project_id,
        invited_by=current_user.id,
        status="pending",
    )
    db.add(invite)
    db.commit()
    db.refresh(invite)

    email_warning: str | None = None
    try:
        send_email(
            to_email=payload.email,
            subject=f'You\'ve been invited to collaborate on "{project.title}"',
            body=(
                f"Hi,\n\n"
                f"{current_user.email} has invited you to collaborate on the project "
                f'"{project.title}" on ResearchHub.\n\n'
                f"You have been invited to a project. Click to join.\n\n"
                f"-- The ResearchHub Team"
            ),
        )
    except Exception as exc:
        email_warning = str(exc)

    response = InviteRead.model_validate(invite)
    if email_warning:
        response.email_warning = email_warning
    return response


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
