from fastapi import APIRouter, Depends, File, UploadFile, HTTPException
from sqlalchemy.orm import Session
from app.database import get_db
from app.services import album_service
import os
from app.schemas.album import AlbumCreate, AlbumSchema, AlbumDetailSchema, AlbumUpdate
from typing import List
from app.core.utils import decode_id

router = APIRouter()
TARGET_DIR = os.getenv("TARGET_DIR")

@router.get("", response_model=list[AlbumSchema]) # 回傳一個相簿清單 DTO
def list_albums(db: Session = Depends(get_db)):
    # 這裡呼叫 Service -> Repo 拿回來的會是 Model 列表
    # FastAPI 會自動根據 AlbumSchema 幫你轉成 JSON 列表
    return album_service.list_albums(db)


# 將照片加入相簿
@router.post("/{album_id}/photos")
def add_photos_to_album(
    album_id: int, 
    photo_ids: List[int], # 支援多個 ID，例如 [1, 2, 3]
    db: Session = Depends(get_db) # 加上 Depends，FastAPI 才會從 DI 容器拿資料庫連線
):
    return album_service.add_photos_to_album(db, album_id, photo_ids)

# 1. 建立相簿的核心路由
@router.post("", response_model=AlbumSchema)
def create_album(
    album_data: AlbumCreate,  # 接收前端傳來的 title 和 photo_ids
    db: Session = Depends(get_db)
):
    # 呼叫 service 同時處理建立相簿與關聯照片
    new_album = album_service.create_album(db, album_data)
    return new_album

@router.get("/{hash_id}", response_model=AlbumDetailSchema)
def get_album_detail(hash_id: str, db: Session = Depends(get_db)):
    # 1. 解碼
    real_id = decode_id(hash_id)
    if not real_id:
        raise HTTPException(status_code=400, detail="無效的相簿 ID")
    
    # 2. 取得資料
    album = album_service.get_album_detail(db, real_id)
    if not album:
        raise HTTPException(status_code=404, detail="找不到該相簿")
        
    return album

@router.put("/{h_id}")
def update_album(
    h_id: str,
    album_in: AlbumUpdate, # FastAPI 會自動將 Body 資料對應到這裡
    db: Session = Depends(get_db)
):    
    # 手動解碼網址上的 ID
    real_id = decode_id(h_id)
    if not real_id:
        raise HTTPException(status_code=400, detail="無效的相簿 ID")
        
    return album_service.update_album(db, real_id, album_in)