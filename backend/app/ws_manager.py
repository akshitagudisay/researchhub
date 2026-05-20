from __future__ import annotations

import asyncio
from collections import defaultdict
from typing import Dict, Set

from fastapi import WebSocket


class ConnectionManager:
    def __init__(self):
        self._rooms: Dict[int, Dict[int, WebSocket]] = defaultdict(dict)
        self._typing: Dict[int, Set[int]] = defaultdict(set)

    def _room(self, project_id: int) -> Dict[int, WebSocket]:
        return self._rooms[project_id]

    async def connect(self, project_id: int, user_id: int, ws: WebSocket) -> None:
        await ws.accept()
        self._room(project_id)[user_id] = ws

    def disconnect(self, project_id: int, user_id: int) -> None:
        self._room(project_id).pop(user_id, None)
        self._typing[project_id].discard(user_id)

    def online_users(self, project_id: int) -> list[int]:
        return list(self._room(project_id).keys())

    def set_typing(self, project_id: int, user_id: int, is_typing: bool) -> None:
        if is_typing:
            self._typing[project_id].add(user_id)
        else:
            self._typing[project_id].discard(user_id)

    def typing_users(self, project_id: int) -> list[int]:
        return list(self._typing[project_id])

    async def broadcast(self, project_id: int, payload: dict, exclude: int | None = None) -> None:
        dead: list[int] = []
        for uid, ws in list(self._room(project_id).items()):
            if uid == exclude:
                continue
            try:
                await ws.send_json(payload)
            except Exception:
                dead.append(uid)
        for uid in dead:
            self.disconnect(project_id, uid)

    async def broadcast_all(self, project_id: int, payload: dict) -> None:
        await self.broadcast(project_id, payload, exclude=None)

    async def send_to(self, project_id: int, user_id: int, payload: dict) -> None:
        ws = self._room(project_id).get(user_id)
        if ws:
            try:
                await ws.send_json(payload)
            except Exception:
                self.disconnect(project_id, user_id)


manager = ConnectionManager()
