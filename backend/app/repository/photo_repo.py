from sqlalchemy.orm import Session
from app.models.photo import Photo
from app.models.album import Album
from app.schemas.photo import PhotoUpdate
from typing import List

def get_photos(db: Session, skip: int, limit: int):
    # 使用 id 排序可以確保結果的「唯一性」與「穩定性」
    # 即使拍攝時間相同，id 絕對不會重複，分頁就不會跳掉
    return db.query(Photo).order_by(Photo.id.desc()).offset(skip).limit(limit).all()

def get_photo_timeline(db: Session):
    return db.query(Photo.id, Photo.taken_at, Photo.created_at).order_by(Photo.created_at.desc()).all()

def get_photos_by_ids(db: Session, ids: List[int]):
    return db.query(Photo).order_by(Photo.id.desc()).filter(Photo.id.in_(ids)).all()

def get_photo(db: Session, id: int):
    return db.query(Photo).get(id)

# Dictionary 的寫法，這樣語意最清楚：
def get_adjacent_ids(db: Session, current_id: int):
    # 根據你的排序規則 Photo.id.desc()
    # 1. 找「上一張」：ID 比目前大的裡面，最小的那一個 (最接近目前 ID)
    prev_photo = db.query(Photo.id).filter(Photo.id > current_id).order_by(Photo.id.asc()).first()
    
    # 2. 找「下一張」：ID 比目前小的裡面，最大的那一個
    next_photo = db.query(Photo.id).filter(Photo.id < current_id).order_by(Photo.id.desc()).first()
    
    # Dictionary 的寫法，這樣語意最清楚：
    return {
        "prev": prev_photo.id if prev_photo else None,
        "next": next_photo.id if next_photo else None
    }    

def update_photo(db: Session, id: int, photo_in: PhotoUpdate):
    photo: Photo = db.query(Photo).get(id)

    if not photo:
        return None
    
    # 將前端傳來的資料轉為字典
    update_data = photo_in.model_dump(exclude_unset=True)

    for field, value in update_data.items():
        # 如果欄位是日期且值是字串，轉換它（Pydantic 通常會幫你處理這部分，詳見下方）
        setattr(photo, field, value)
        
    db.commit()
    db.refresh(photo)
    return photo


def create_photo(db: Session, photo_obj: Photo):
    db.add(photo_obj)
    db.commit()
    db.refresh(photo_obj)
    return photo_obj

def get_photos_byids(db: Session, photo_ids: list[int]):
    return db.query(Photo).filter(Photo.id.in_(photo_ids)).all()


def delete_photo(db: Session, photo: Photo):    
    db.delete(photo)
