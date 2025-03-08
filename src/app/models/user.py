from dataclasses import dataclass
from typing import Optional
from datetime import datetime

@dataclass
class User:
    nickname: str
    sid: str
    in_call: bool = False
    call_partner: Optional[str] = None
    last_seen: datetime = datetime.utcnow()

    def to_dict(self):
        return {
            'nickname': self.nickname,
            'in_call': self.in_call,
            'call_partner': self.call_partner,
            'last_seen': self.last_seen.isoformat()
        }
