# app/core/utils.py
from hashids import Hashids
from app.core.config import settings

hashids = Hashids(salt=settings.HASHIDS_SALT, min_length=settings.HASHIDS_MIN_LENGTH)

def encode_id(real_id: int) -> str:
    return hashids.encode(real_id)

def decode_id(hashed_id: str) -> int:
    try:
        decoded = hashids.decode(hashed_id)
        if not decoded:
            raise ValueError(f"無法解碼 ID: {hashed_id}")
        return decoded[0]
    except Exception as e:
        # 這裡拋出 Python 原生錯誤，不涉及 HTTP
        raise ValueError(f"無效的 ID 格式") from e