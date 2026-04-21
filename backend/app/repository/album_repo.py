from sqlalchemy.orm import Session, joinedload, selectinload
from app.models.album import Album, AlbumCover
from app.models.photo import Photo
from typing import List
from app.schemas.album import AlbumCreate, AlbumUpdate

def create_album(db: Session, name: str, description: str = None):
    db_album = Album(name=name, description=description)
    db.add(db_album)
    db.commit()
    db.refresh(db_album)
    return db_album

def update_album(db: Session, id: int, album_data: AlbumUpdate):
    # 1. 取得現有的相簿實體
    # 使用你寫的高效載入方式
    album = db.query(Album).options(
        joinedload(Album.covers).joinedload(AlbumCover.photo),
        selectinload(Album.photos)
    ).filter(Album.id == id).first()
    if not album:
        return None  # 或者拋出異常
    
    # 2. 更新基本資訊
    album.title = album_data.title
    album.description = album_data.description
    
    # 3. 更新封面 (利用 cascade="all, delete-orphan")
    # 直接清空列表，SQLAlchemy 會自動幫你從資料庫刪除那些舊的 AlbumCover
    # 這裡操作 album.covers 和 album.photos 就會非常快，因為都已經在記憶體裡了
    # 「帶有屬性的關聯 (Association Object)」
    # 不能自動賦值？ 如果你原本在位置 1 有照片 A，現在你想把位置 1 換成照片 B
    # 如果直接賦值，ORM 會困惑：是要把原本那列的 photo_id 從 A 改成 B？還是要把整列刪掉重塞？
    # 萬一你原本位置 1 是 A，現在位置 2 也是 A，邏輯會變得異常複雜。
    album.covers.clear()
    for c in album_data.covers:
        album.covers.append(AlbumCover(photo_id=c.photo_id, position=c.position))
    
    album.photos = db.query(Photo).filter(Photo.id.in_(album_data.photo_ids)).all()

    db.commit()
    db.refresh(album)
    return album


def get_album_by_name(db: Session, name: str):
    return db.query(Album).filter(Album.name == name).first()

def get_album_detail(db: Session, album_id: int):
    return db.query(Album).options(
        # 封面通常只有幾張，用 joinedload (JOIN) OK
        joinedload(Album.covers).joinedload(AlbumCover.photo),
        # 照片可能很多，用 selectinload (會發出第二條 IN 查詢，效率更高)
        selectinload(Album.photos) 
    ).filter(Album.id == album_id).first()

def list_albums(db: Session):
    # 使用 joinedload 預先載入 covers 及其對應的 photo 資料
    return db.query(Album).options(
        joinedload(Album.covers).joinedload(AlbumCover.photo)
    ).all()

def add_photos_to_album( db: Session, album_id: int, photo_ids: List[int]):
    album = db.query(Album).get(album_id)
    if not album: return  {"status": "false"}
    photos = db.query(Photo).filter(Photo.id.in_(photo_ids)).all()
    album.photos.extend(photos)
    db.commit()
    return {"status": "success", "added_count": len(photos)}

# SQLAlchemy ORM（Object-Relational Mapping）的核心用法。
# 它的本質是將資料庫的一列（Row）映射為一個 Python 物件（Object）
def create_album(db: Session, album_data: AlbumCreate):
    # 1. 先建立相簿本體
    db_album = Album(
        title=album_data.title, 
        description=album_data.description)
    db.add(db_album)
    db.flush() # 取得 db_album.id 但先不 Commit

    # 2. 如果有選取照片，建立關聯
    if album_data.photo_ids:
        photos = db.query(Photo).filter(Photo.id.in_(album_data.photo_ids)).all()
        db_album.photos = photos # SQLAlchemy 會自動處理關聯表

    # 3. 建立封面九宮格設定 (AlbumCover 表)
    if album_data.covers:
        for cover_item in album_data.covers:
            new_cover = AlbumCover(
                album_id=db_album.id,
                photo_id=cover_item.photo_id, # 注意：如果用 Schema，這裡要用 . 而非 ['']
                position=cover_item.position
            )
            db.add(new_cover)

    db.commit()
    db.refresh(db_album)
    return db_album