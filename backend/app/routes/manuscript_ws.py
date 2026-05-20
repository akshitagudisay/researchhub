from __future__ import annotations

import json
from datetime import datetime

from fastapi import APIRouter, Query, WebSocket, WebSocketDisconnect
from sqlalchemy.orm import Session

from ..database import SessionLocal
from .. import models
from ..auth import decode_access_token
from ..manuscript_manager import manuscript_manager

router = APIRouter()

SECTIONS = {"abstract", "introduction", "methodology", "results", "conclusion"}

SCORE_MANUSCRIPT_EDIT = 5


def _load_content(manuscript: models.Manuscript | None) -> dict:
    if not manuscript:
        return {s: "" for s in ["abstract", "introduction", "methodology", "results", "conclusion"]}
    try:
        data = json.loads(manuscript.content)
    except Exception:
        data = {}
    return {
        "abstract": data.get("abstract", ""),
        "introduction": data.get("introduction", ""),
        "methodology": data.get("methodology", ""),
        "results": data.get("results", ""),
        "conclusion": data.get("conclusion", ""),
    }


def _check_access(project_id: int, user_id: int, db: Session) -> tuple[models.User | None, str]:
    user = db.query(models.User).filter(models.User.id == user_id).first()
    if not user:
        return None, "none"
    project = db.query(models.Project).filter(models.Project.id == project_id).first()
    if not project:
        return None, "none"
    if project.owner_id == user.id:
        return user, "owner"
    collab = db.query(models.Collaborator).filter(
        models.Collaborator.project_id == project_id,
        models.Collaborator.user_id == user.id,
    ).first()
    if collab:
        return user, collab.role
    return None, "none"


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


@router.websocket("/ws/manuscript/{project_id}")
async def manuscript_ws(
    project_id: int,
    websocket: WebSocket,
    token: str = Query(...),
):
    db: Session = SessionLocal()
    user_id_decoded = decode_access_token(token)

    if user_id_decoded is None:
        await websocket.close(code=4001)
        db.close()
        return

    user, role = _check_access(project_id, user_id_decoded, db)
    if not user or role == "none":
        await websocket.close(code=4003)
        db.close()
        return

    can_write = role in ("owner", "editor")

    await manuscript_manager.connect(project_id, user.id, user.email, websocket)

    try:
        manuscript = db.query(models.Manuscript).filter(
            models.Manuscript.project_id == project_id
        ).first()

        content = _load_content(manuscript)
        updated_at = manuscript.updated_at.isoformat() if manuscript and manuscript.updated_at else None

        await websocket.send_json({
            "type": "init",
            "content": content,
            "updated_at": updated_at,
            "can_write": can_write,
            "active_collaborators": manuscript_manager.get_active_users(project_id),
        })

        await manuscript_manager.broadcast_except(project_id, user.id, {
            "type": "active_collaborators",
            "users": manuscript_manager.get_active_users(project_id),
        })

        while True:
            data = await websocket.receive_json()
            msg_type = data.get("type")

            if msg_type == "ping":
                await websocket.send_json({"type": "pong"})

            elif msg_type == "section_focus":
                section = data.get("section", "")
                if section not in SECTIONS:
                    continue

                current_editor = manuscript_manager.get_section_editor(project_id, section)
                if current_editor and current_editor.user_id != user.id:
                    await websocket.send_json({
                        "type": "section_conflict",
                        "section": section,
                        "editor_email": current_editor.email,
                    })

                manuscript_manager.set_section(project_id, user.id, section)
                await manuscript_manager.broadcast_all(project_id, {
                    "type": "active_collaborators",
                    "users": manuscript_manager.get_active_users(project_id),
                })

            elif msg_type == "edit" and can_write:
                section = data.get("section", "")
                new_content = data.get("content", "")
                if section not in SECTIONS:
                    continue

                db.refresh(db.query(models.Manuscript).filter(
                    models.Manuscript.project_id == project_id
                ).first() or models.Manuscript())

                manuscript = db.query(models.Manuscript).filter(
                    models.Manuscript.project_id == project_id
                ).first()

                content_dict = _load_content(manuscript)
                content_dict[section] = new_content
                content_json = json.dumps(content_dict)

                now = datetime.utcnow()
                if manuscript:
                    manuscript.content = content_json
                    manuscript.updated_at = now
                else:
                    manuscript = models.Manuscript(
                        content=content_json,
                        project_id=project_id,
                        updated_at=now,
                    )
                    db.add(manuscript)
                db.commit()

                _log_contribution(db, user.id, project_id, "manuscript_edit", SCORE_MANUSCRIPT_EDIT, {"section": section})

                await websocket.send_json({
                    "type": "autosaved",
                    "section": section,
                    "timestamp": now.isoformat(),
                })

                await manuscript_manager.broadcast_except(project_id, user.id, {
                    "type": "edit",
                    "section": section,
                    "content": new_content,
                    "editor_id": user.id,
                    "editor_email": user.email,
                })

            elif msg_type == "section_blur":
                section = data.get("section", "")
                current = manuscript_manager.get_section_editor(project_id, section)
                if current and current.user_id == user.id:
                    manuscript_manager.set_section(project_id, user.id, None)
                    await manuscript_manager.broadcast_all(project_id, {
                        "type": "active_collaborators",
                        "users": manuscript_manager.get_active_users(project_id),
                    })

    except WebSocketDisconnect:
        pass
    finally:
        manuscript_manager.disconnect(project_id, user.id)
        await manuscript_manager.broadcast_all(project_id, {
            "type": "active_collaborators",
            "users": manuscript_manager.get_active_users(project_id),
        })
        db.close()
