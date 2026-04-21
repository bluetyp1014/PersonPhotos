from pydantic import BaseModel, Field, computed_field, ConfigDict, field_validator
from datetime import date, datetime
from app.core.utils import encode_id, decode_id  # 假設你把 hashids 封裝在這裡
from typing import Optional, Union, List

# Schemas 指的是「數據結構的形狀」，特別是指 JSON 的架構。 Like DTOs
class PhotoBase(BaseModel):
    photo_id_raw: int = Field(alias="id", exclude=True)
    file_name: str
    taken_at: datetime | None = None
    created_at: datetime | None = None

    # Pydantic V2 的計算欄位
    @computed_field
    @property
    def hash_id(self) -> str:
        return encode_id(self.photo_id_raw)

    # V2 的 Config 寫法
    model_config = ConfigDict(from_attributes=True)

class PhotoUpdate(BaseModel):
    file_name: str
    # 這裡才是解決 422 錯誤的關鍵！
    taken_at: Optional[Union[datetime, date]] = None

class Timeline(BaseModel):
    # 因為你在 Repo query 的是 Photo.id，這裡直接定義 id 即可
    # 如果希望輸出的 JSON 裡面叫 hash_id，則保留你的 computed_field
    id: int = Field(exclude=True) 
    taken_at: datetime | None = None
    created_at: datetime | None = None

    # Pydantic V2 的計算欄位
    @computed_field
    @property
    def hash_id(self) -> str:
        return encode_id(self.id)

    # V2 的 Config 寫法
    model_config = ConfigDict(from_attributes=True)

class PhotoTimeDetail(BaseModel):
    # id 改用網址傳遞
    # id: int  # 這是相簿本身的 ID
    photo_ids: List[int] = [] # 這裡也改回 int

    @field_validator("photo_ids", mode="before")
    @classmethod
    def transform_ids_to_ints(cls, v):
        if isinstance(v, list):
            # 將列表中的每個 HashID 都解碼成 int
            return [decode_id(i) if isinstance(i, str) else i for i in v]
        return v     