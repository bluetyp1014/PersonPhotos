# 「Schema 定義」就是你的 API 合約
from pydantic import BaseModel, Field, computed_field, ConfigDict, field_validator
from datetime import datetime
from typing import List, Optional
from app.core.utils import encode_id, decode_id  # 假設你把 hashids 封裝在這裡

# 1. 定義封面九宮格的格式
class CoverCreate(BaseModel):
    photo_id: int  # 這裡定義為 int，因為 validator 會確保它變成 int
    position: int

    @field_validator("photo_id", mode="before")
    @classmethod
    def transform_hash_to_int(cls, v):
        # 如果是字串，就解碼；如果是 int (預防萬一)，直接回傳
        if isinstance(v, str):
            return decode_id(v)
        return v

# 2. 基礎欄位：定義大家都有的欄位 (title, description)
class AlbumBase(BaseModel):
    title: str
    description: Optional[str] = None # Optional[str] 代表可以是字串也可以是 None

# 3. 建立相簿時用的：繼承 AlbumBase，並增加照片 ID 和封面列表
class AlbumCreate(AlbumBase):
    photo_ids: List[int] = [] # 這裡也改回 int
    covers: List[CoverCreate] = [] # 九宮格封面的強型別定義

    @field_validator("photo_ids", mode="before")
    @classmethod
    def transform_ids_to_ints(cls, v):
        if isinstance(v, list):
            # 將列表中的每個 HashID 都解碼成 int
            return [decode_id(i) if isinstance(i, str) else i for i in v]
        return v
    
# 3. 用於「更新」的 Schema
# 繼承 AlbumBase，這樣 title 和 description 就不必重寫
class AlbumUpdate(AlbumBase):
    # id 改用網址傳遞
    # id: int  # 這是相簿本身的 ID
    photo_ids: List[int] = [] # 這裡也改回 int
    covers: List[CoverCreate] = [] # 九宮格封面的強型別定義

    @field_validator("photo_ids", mode="before")
    @classmethod
    def transform_ids_to_ints(cls, v):
        if isinstance(v, list):
            # 將列表中的每個 HashID 都解碼成 int
            return [decode_id(i) if isinstance(i, str) else i for i in v]
        return v     
    
    # 一次指定兩個來源
    # 處理方式完全不同，才必須分開寫
    """ 
    @field_validator("id", "photo_ids", mode="before")
    @classmethod
    def transform_hash_to_int(cls, v):
        # 邏輯 A：如果進來的是單一 HashID (對應 id 欄位)
        if isinstance(v, str):
            return decode_id(v)
        
        # 邏輯 B：如果進來的是清單 (對應 photo_ids 欄位)
        if isinstance(v, list):
            return [decode_id(i) if isinstance(i, str) else i for i in v]
        
        # 邏輯 C：如果都不是 (或已經是 int)，就原樣回傳
        return v
     """
    """     
    @field_validator("id", mode="before")
    @classmethod
    def transform_id_to_int(cls, v): # cls 就是 AlbumUpdate 類別, v = value
        return decode_id(v) if isinstance(v, str) else v

    @field_validator("photo_ids", mode="before")
    @classmethod
    def transform_ids_to_ints(cls, v):
        if isinstance(v, list):
            # 將列表中的每個 HashID 都解碼成 int
            return [decode_id(i) if isinstance(i, str) else i for i in v]
        return v     
    """
    

# 增加這個，用來回傳封面資訊
class AlbumCoverRead(BaseModel):
    # 用 alias 讀取資料庫的 photo_id，但不直接在 JSON 顯示 (exclude=True)
    photo_id_raw: int = Field(alias="photo_id", exclude=True)
    position: int

    @computed_field
    @property
    def photo_id(self) -> str:
        return encode_id(self.photo_id_raw)
    
    model_config = ConfigDict(from_attributes=True, populate_by_name=True)

# 4. 回傳給前端用的：繼承 AlbumBase，多了 id 和時間
class AlbumSchema(AlbumBase):
    # 用 alias 讀取資料庫的 id，並隱藏原始整數
    id_raw: int = Field(alias="id", exclude=True)
    created_at: datetime | None = None
    covers: List[AlbumCoverRead] = []

    @computed_field
    @property
    def hash_id(self) -> str:
        return encode_id(self.id_raw)
    
    model_config = ConfigDict(from_attributes=True, populate_by_name=True)

    # class Config:
        # 它讓 Pydantic 可以直接讀取 SQLAlchemy 的 Model 物件
        # from_attributes=True,   # 1. 支援直接讀取 SQLAlchemy 物件
        # populate_by_name=True   # 2. 支援透過 alias "id" 找到資料庫的欄位

# 基本照片資訊
class PhotoSchema(BaseModel):
    file_name: str
    taken_at: datetime | None = None
    created_at: datetime | None = None

    # 這裡不放 id，改用 computed_field 自動產生 hash_id
    @computed_field
    def hash_id(self) -> str:
        return encode_id(self.id)
    
    # 為了讓 computed_field 能抓到 self.id，Schema 內部要有個隱藏欄位或從屬性抓
    id: int = Field(exclude=True) # 存在但不輸出到 JSON

    class Config:
        from_attributes = True

# 封面資訊
class AlbumCoverSchema(BaseModel):
    position: int
    photo: PhotoSchema # 嵌套照片資訊

    class Config:
        from_attributes = True

# 最終相簿詳情
class AlbumDetailSchema(AlbumBase):
    title: str
    description: Optional[str]
    created_at: datetime | None = None

    @computed_field
    def hash_id(self) -> str:
        return encode_id(self.id)
    
    id: int = Field(exclude=True)
    
    # 嵌套資料
    covers: List[AlbumCoverSchema]
    photos: List[PhotoSchema]

    class Config:
        from_attributes = True        