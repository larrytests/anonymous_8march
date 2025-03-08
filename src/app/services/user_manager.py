from dataclasses import dataclass
from typing import Dict, Optional
from threading import Lock
import re
import time
import logging

logger = logging.getLogger(__name__)

@dataclass
class User:
    username: str
    socket_id: str
    connected: bool = True
    in_call: bool = False
    call_partner: Optional[str] = None
    last_seen: float = time.time()

class UserManager:
    def __init__(self):
        self._users: Dict[str, User] = {}  # username -> User
        self._socket_to_user: Dict[str, str] = {}  # socket_id -> username
        self._lock = Lock()

    def add_user(self, username: str, socket_id: str) -> bool:
        """Add a new user or update existing user's socket."""
        with self._lock:
            if not self._is_valid_username(username):
                logger.warning(f"Invalid username format: {username}")
                return False

            # If username exists but with different socket, disconnect old socket
            if username in self._users:
                old_socket = self._users[username].socket_id
                if old_socket != socket_id:
                    if old_socket in self._socket_to_user:
                        del self._socket_to_user[old_socket]
                    logger.info(f"Updating socket for user: {username}")

            user = User(username=username, socket_id=socket_id)
            self._users[username] = user
            self._socket_to_user[socket_id] = username
            logger.info(f"User added/updated: {username}")
            return True

    def remove_user(self, socket_id: str) -> Optional[str]:
        """Remove user by socket ID. Returns username if found."""
        with self._lock:
            if socket_id not in self._socket_to_user:
                return None

            username = self._socket_to_user[socket_id]
            del self._socket_to_user[socket_id]

            if username in self._users:
                user = self._users[username]
                if user.in_call:
                    logger.info(f"User {username} disconnected while in call")
                del self._users[username]

            logger.info(f"User removed: {username}")
            return username

    def get_user_by_socket(self, socket_id: str) -> Optional[User]:
        """Get user by socket ID."""
        with self._lock:
            username = self._socket_to_user.get(socket_id)
            return self._users.get(username) if username else None

    def get_user(self, username: str) -> Optional[User]:
        """Get user by username."""
        with self._lock:
            return self._users.get(username)

    def get_all_users(self) -> list[str]:
        """Get list of all usernames."""
        with self._lock:
            return list(self._users.keys())

    def update_last_seen(self, socket_id: str):
        """Update last seen timestamp for a user."""
        with self._lock:
            if user := self.get_user_by_socket(socket_id):
                user.last_seen = time.time()

    def cleanup_inactive_users(self, max_idle_time: int = 300) -> int:
        """Remove users who haven't been seen recently. Returns count of removed users."""
        with self._lock:
            current_time = time.time()
            inactive_sockets = []

            for user in self._users.values():
                if current_time - user.last_seen > max_idle_time:
                    inactive_sockets.append(user.socket_id)

            for socket_id in inactive_sockets:
                self.remove_user(socket_id)

            if inactive_sockets:
                logger.info(f"Cleaned up {len(inactive_sockets)} inactive users")
            return len(inactive_sockets)

    @staticmethod
    def _is_valid_username(username: str) -> bool:
        """Validate username format."""
        return bool(re.match(r'^[a-zA-Z0-9]{3,20}$', username))