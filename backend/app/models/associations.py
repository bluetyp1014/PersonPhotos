# app/models/associations.py
from sqlalchemy import Table, Column, Integer, ForeignKey
from app.database import Base

album_photos = Table(
    "album_photos",
    Base.metadata,
    Column("album_id", Integer, ForeignKey("albums.id", ondelete="CASCADE"), primary_key=True),
    Column("photo_id", Integer, ForeignKey("photos.id", ondelete="CASCADE"), primary_key=True),
)