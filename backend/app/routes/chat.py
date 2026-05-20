from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query, WebSocket, WebSocketDisconnect
from sqlalchemy.orm import Session
from typing import List

from ..database import get_db, SessionLocal
from .. import models
from ..auth import decode_access_token
from ..schemas import ChatMessageRead
from ..ws_manager import manager

router = APIRouter()


def _check_project_access(project_id: int, user: models.User, db: Session) -> bool:
    project = db.query(models.Project).filter(models.Project.id == project_id).first()
    if not project:
        return False
    if project.owner_id == user.id:
        return True
    collab = db.query(models.Collaborator).filter(
        models.Collaborator.project_id == project_id,
        models.Collaborator.user_id == user.id,
    ).first()
    return collab is not None


def _msg_to_dict(msg: models.ChatMessage) -> dict:
    return {
        "type": "message",
        "id": msg.id,
        "project_id": msg.project_id,
        "sender_id": msg.sender_id,
        "sender_email": msg.sender.email,
        "content": msg.content,
        "created_at": msg.created_at.isoformat(),
    }


def _online_payload(project_id: int, db: Session) -> dict:
    """Build an online_users broadcast payload from current connections."""
    online_ids = manager.online_users(project_id)
    users = []
    for uid in online_ids:
        u = db.query(models.User).filter(models.User.id == uid).first()
        if u:
            users.append({"id": uid, "email": u.email})
    return {"type": "online_users", "users": users}


@router.get("/projects/{project_id}/chat/history", response_model=List[ChatMessageRead])
def get_chat_history(
    project_id: int,
    limit: int = Query(default=50, le=200),
    token: str = Query(...),
    db: Session = Depends(get_db),
):
    user_id = decode_access_token(token)
    if user_id is None:
        raise HTTPException(status_code=403, detail="Invalid token")
    user = db.query(models.User).filter(models.User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=403, detail="User not found")
    if not _check_project_access(project_id, user, db):
        raise HTTPException(status_code=403, detail="No access to this project")

    messages = (
        db.query(models.ChatMessage)
        .filter(models.ChatMessage.project_id == project_id)
        .order_by(models.ChatMessage.created_at.desc())
        .limit(limit)
        .all()
    )
    messages.reverse()

    return [
        ChatMessageRead(
            id=m.id,
            project_id=m.project_id,
            sender_id=m.sender_id,
            sender_email=m.sender.email,
            content=m.content,
            created_at=m.created_at,
        )
        for m in messages
    ]


@router.websocket("/ws/chat/{project_id}")
async def websocket_chat(
    project_id: int,
    websocket: WebSocket,
    token: str = Query(...),
):
    db: Session = SessionLocal()

    try:
        user_id = decode_access_token(token)
        if user_id is None:
            await websocket.close(code=4001)
            return

        user = db.query(models.User).filter(models.User.id == user_id).first()
        if not user:
            await websocket.close(code=4001)
            return

        if not _check_project_access(project_id, user, db):
            await websocket.close(code=4003)
            return

        await manager.connect(project_id, user.id, websocket)

        try:
            history = (
                db.query(models.ChatMessage)
                .filter(models.ChatMessage.project_id == project_id)
                .order_by(models.ChatMessage.created_at.desc())
                .limit(50)
                .all()
            )
            history.reverse()

            await websocket.send_json({
                "type": "history",
                "messages": [_msg_to_dict(m) for m in history],
            })

            await manager.broadcast_all(project_id, _online_payload(project_id, db))

            while True:
                data = await websocket.receive_json()
                msg_type = data.get("type")

                if msg_type == "ping":
                    await websocket.send_json({"type": "pong"})

                elif msg_type == "typing":
                    is_typing = bool(data.get("is_typing", False))
                    manager.set_typing(project_id, user.id, is_typing)
                    typing_ids = manager.typing_users(project_id)
                    typing_users_list = []
                    for tid in typing_ids:
                        u = db.query(models.User).filter(models.User.id == tid).first()
                        if u:
                            typing_users_list.append({"id": tid, "email": u.email})
                    await manager.broadcast_all(project_id, {
                        "type": "typing",
                        "users": typing_users_list,
                    })

                elif msg_type == "message":
                    content = (data.get("content") or "").strip()
                    if not content:
                        continue

                    manager.set_typing(project_id, user.id, False)

                    db_msg = models.ChatMessage(
                        project_id=project_id,
                        sender_id=user.id,
                        content=content,
                    )
                    db.add(db_msg)
                    db.commit()
                    db.refresh(db_msg)

                    await manager.broadcast_all(project_id, _msg_to_dict(db_msg))

        except WebSocketDisconnect:
            pass
        finally:
            manager.disconnect(project_id, user.id)
            await manager.broadcast_all(project_id, _online_payload(project_id, db))

    finally:
        db.close()
