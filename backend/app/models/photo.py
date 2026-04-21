from sqlalchemy import Column, Integer, String, Float, DateTime, ForeignKey, Table, func
from sqlalchemy.orm import relationship
from app.database import Base
from datetime import date, datetime
from app.models.associations import album_photos # 引用獨立的關聯表
from typing import Optional, Union

# 繼承自 Base（這相當於 C# 的 Entity 基底類別）
class Photo(Base):
    __tablename__ = "photos"

    id = Column(Integer, primary_key=True, index=True)
    file_name = Column(String)
    file_path = Column(String)
    make = Column(String)
    model = Column(String)
    lens = Column(String)
    f_number = Column(Float)
    iso = Column(Integer)
    lat = Column(Float)
    lng = Column(Float)
    # 資料庫裡它就是一個 DateTime 欄位
    taken_at = Column(DateTime, nullable=True)

    # 新增上傳時間，預設為存入資料庫的當下時間
    created_at = Column(DateTime, server_default=func.now(), nullable=False)
    
    # 關聯設定
    albums = relationship("Album", secondary=album_photos, back_populates="photos")
