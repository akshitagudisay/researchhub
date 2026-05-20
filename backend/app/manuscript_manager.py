from __future__ import annotations

import asyncio
from collections import defaultdict
from datetime import datetime
from typing import Dict, Any

from fastapi import WebSocket


class ManuscriptSession:
    def __init__(self, ws: WebSocket, user_id: int, email: str):
        self.ws = ws
        self.user_id = user_id
        self.email = email
        self.section: str | None = None
        self.last_active: datetime = datetime.utcnow()

    def to_dict(self) -> dict:
        return {
            "user_id": self.user_id,
            "email": self.email,
            "section": self.section,
            "last_active": self.last_active.isoformat(),
        }


class ManuscriptManager:
    def __init__(self):
        self._rooms: Dict[int, Dict[int, ManuscriptSession]] = defaultdict(dict)

    async def connect(self, project_id: int, user_id: int, email: str, ws: WebSocket) -> None:
        await ws.accept()
        session = ManuscriptSession(ws=ws, user_id=user_id, email=email)
        self._rooms[project_id][user_id] = session

    def disconnect(self, project_id: int, user_id: int) -> None:
        self._rooms[project_id].pop(user_id, None)

    def set_section(self, project_id: int, user_id: int, section: str | None) -> None:
        session = self._rooms[project_id].get(user_id)
        if session:
            session.section = section
            session.last_active = datetime.utcnow()

    def get_active_users(self, project_id: int) -> list[dict]:
        return [s.to_dict() for s in self._rooms[project_id].values()]

    def get_section_editor(self, project_id: int, section: str) -> ManuscriptSession | None:
        for uid, session in self._rooms[project_id].items():
            if session.section == section:
                return session
        return None

    async def broadcast_all(self, project_id: int, payload: dict) -> None:
        await self._broadcast(project_id, payload, exclude=None)

    async def broadcast_except(self, project_id: int, exclude_user_id: int, payload: dict) -> None:
        await self._broadcast(project_id, payload, exclude=exclude_user_id)

    async def send_to(self, project_id: int, user_id: int, payload: dict) -> None:
        session = self._rooms[project_id].get(user_id)
        if session:
            try:
                await session.ws.send_json(payload)
            except Exception:
                self.disconnect(project_id, user_id)

    async def _broadcast(self, project_id: int, payload: dict, exclude: int | None) -> None:
        dead: list[int] = []
        for uid, session in list(self._rooms[project_id].items()):
            if uid == exclude:
                continue
            try:
                await session.ws.send_json(payload)
            except Exception:
                dead.append(uid)
        for uid in dead:
            self.disconnect(project_id, uid)


manuscript_manager = ManuscriptManager()
