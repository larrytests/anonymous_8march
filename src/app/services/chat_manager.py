from threading import Lock
from datetime import datetime, timedelta
import re
from typing import Dict, List, Optional
from flask_socketio import emit

from ..models.user import User
from ..utils.logger import get_logger

logger = get_logger(__name__)

class ChatManager:
    def __init__(self):
        self.users: Dict[str, User] = {}
        self.sid_to_nickname: Dict[str, str] = {}
        self.lock = Lock()

    def add_user(self, nickname: str, sid: str) -> bool:
        """Add a new user to the chat system"""
        with self.lock:
            if not self.is_valid_nickname(nickname):
                logger.warning(f"Invalid nickname attempt: {nickname}")
                return False

            if nickname in self.users:
                logger.info(f"Nickname already taken: {nickname}")
                return False

            self.users[nickname] = User(
                nickname=nickname,
                sid=sid,
                last_seen=datetime.utcnow()
            )
            self.sid_to_nickname[sid] = nickname
            logger.info(f"User added: {nickname}")
            return True

    def remove_user(self, sid: str) -> None:
        """Remove a user from the chat system"""
        with self.lock:
            if sid in self.sid_to_nickname:
                nickname = self.sid_to_nickname[sid]
                if nickname in self.users:
                    self._handle_user_disconnect(nickname)
                    del self.users[nickname]
                    logger.info(f"User removed: {nickname}")
                del self.sid_to_nickname[sid]

    def get_user_list(self) -> List[str]:
        """Get list of all active users"""
        with self.lock:
            return list(self.users.keys())

    def get_user(self, nickname: str) -> Optional[User]:
        """Get user by nickname"""
        with self.lock:
            return self.users.get(nickname)

    def get_user_by_sid(self, sid: str) -> Optional[User]:
        """Get user by session ID"""
        with self.lock:
            nickname = self.sid_to_nickname.get(sid)
            return self.users.get(nickname) if nickname else None

    def update_last_seen(self, sid: str) -> None:
        """Update user's last seen timestamp"""
        with self.lock:
            if user := self.get_user_by_sid(sid):
                user.last_seen = datetime.utcnow()

    def cleanup_stale_users(self, max_idle_time: int = 300) -> int:
        """Remove inactive users"""
        with self.lock:
            now = datetime.utcnow()
            stale_users = [
                nickname for nickname, user in self.users.items()
                if (now - user.last_seen) > timedelta(seconds=max_idle_time)
            ]

            for nickname in stale_users:
                if user := self.users.get(nickname):
                    self.remove_user(user.sid)

            return len(stale_users)

    def _handle_user_disconnect(self, nickname: str) -> None:
        """Handle user disconnect and cleanup their active calls"""
        user = self.users[nickname]
        if user.in_call and user.call_partner:
            if partner := self.get_user(user.call_partner):
                partner.in_call = False
                partner.call_partner = None
                emit('end_call', {'from': nickname}, room=partner.sid)
                logger.info(f"Ended call between {nickname} and {user.call_partner}")

    @staticmethod
    def is_valid_nickname(nickname: str) -> bool:
        """Validate nickname format"""
        return bool(re.match(r'^[a-zA-Z0-9]{3,20}$', nickname))