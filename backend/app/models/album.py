
from sqlalchemy import Column, Integer, String, Float, DateTime, ForeignKey, Table
from pydantic import BaseModel # FastAPI 的**「合約管理器」**
from sqlalchemy.orm import relationship
from typing import List, Optional
from app.database import Base
from datetime import datetime
from app.models.associations import album_photos # 引用獨立的關聯表
from .photo import Photo

class Album(Base):
    __tablename__ = "albums"

    id = Column(Integer, primary_key=True, index=True)
    title = Column(String, nullable=False)
    description = Column(String)
    created_at = Column(DateTime, default=datetime.now)

    # 關聯設定
    photos = relationship("Photo", secondary=album_photos, back_populates="albums")
    # 九宮格封面關聯
    covers = relationship("AlbumCover", back_populates="album", cascade="all, delete-orphan")

class AlbumCover(Base):
    __tablename__ = "album_covers"
    
    id = Column(Integer, primary_key=True, index=True)
    album_id = Column(Integer, ForeignKey("albums.id", ondelete="CASCADE"))
    photo_id = Column(Integer, ForeignKey("photos.id", ondelete="CASCADE"))
    position = Column(Integer) # 儲存 1-9 的位置

    album = relationship("Album", back_populates="covers")
    photo = relationship("Photo")
