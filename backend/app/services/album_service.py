from sqlalchemy.orm import Session
from app.repository import album_repo
from sqlalchemy.orm import Session
from typing import List
from app.schemas.album import AlbumCreate, AlbumUpdate

def list_albums(db: Session):
    return album_repo.list_albums(db)

def search_album(db: Session, name: str):
    # 這裡可以加邏輯：如果沒找到，拋出 404
    album = album_repo.get_album_by_exact_name(db, name)
    return album

def add_photos_to_album(db: Session, album_id: int, photo_ids: List[int]):
    return album_repo.add_photos_to_album(db, album_id, photo_ids)

def create_album(db: Session, album_data: AlbumCreate):
    return album_repo.create_album(db, album_data)

def get_album_detail(db: Session, album_id: int):
    # 使用 joinedload 抓封面，selectinload 抓照片清單 (效能最佳化)
    return album_repo.get_album_detail(db, album_id)

def update_album(db: Session, id: int, album_data: AlbumUpdate):
    return album_repo.update_album(db, id, album_data)
