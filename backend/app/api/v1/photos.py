from fastapi import APIRouter, Depends, File, UploadFile, HTTPException
from sqlalchemy.orm import Session
from app.database import get_db
from app.models.photo import Photo
from app.services import photo_service
from app.schemas.photo import PhotoBase, PhotoUpdate, Timeline, PhotoTimeDetail
import os
from fastapi.responses import FileResponse
from app.services import image_service
from app.core.utils import decode_id, encode_id
from pydantic import BaseModel
from typing import List

router = APIRouter()

@router.get("", response_model=list[PhotoBase])
def read_photos(skip: int = 0, limit: int = 30, db: Session = Depends(get_db)):
    return photo_service.get_all_photos(db, skip, limit)

@router.get("/timeline-index", response_model=list[Timeline])
def get_photo_timeline(db: Session = Depends(get_db)):
    return photo_service.get_photo_timeline(db)

@router.post("/batch-details", response_model=list[PhotoBase])
def get_photos_by_ids(photoTimeDetail: PhotoTimeDetail, db: Session = Depends(get_db)):
    # 這裡借用 BatchDeleteRequest 的 Schema，因為它也是接收 ids: list[str]
    # 實際邏輯是根據傳入的 hash_ids 回傳對應的照片詳細資訊
    return photo_service.get_photos_by_ids(db, photoTimeDetail.photo_ids)

@router.get("/thumbnail/{hash_id}")
async def get_thumbnail(hash_id: str, db: Session = Depends(get_db)):
    # 1. 解碼取得真實 ID
    real_id = decode_id(hash_id)
    if not real_id:
        raise HTTPException(status_code=400, detail="Invalid Photo ID")

    # 2. 取得實體路徑
    photo = photo_service.get_photo(db, real_id)
    if not photo:
        raise HTTPException(status_code=404, detail="Photo not found")

    # base_dir = os.getenv("TARGET_DIR", "").strip().replace('"', '').replace("'", "")
    full_path = photo.file_path
    
    # print(f"--- DEBUG START ---")
    # print(f"Original BaseDir: [{os.getenv('TARGET_DIR')}]")
    # print(f"Cleaned BaseDir: [{base_dir}]")
    # print(f"Request Path: [{path}]")
    print(f"Full Joined Path: [{full_path}]")

    # 防禦性程式碼：檢查原始檔案是否存在
    if not os.path.exists(full_path):
        raise HTTPException(status_code=404, detail="找不到原始圖片")

    try:
        # 委託 Service 處理縮圖
        thumbnail_path = image_service.get_or_create_thumbnail(full_path, full_path)
        return FileResponse(thumbnail_path)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"縮圖處理失敗: {str(e)}")


@router.get("/original/{hash_id}")
async def get_original(hash_id: str, db: Session = Depends(get_db)):
    # 1. 解碼取得真實 ID
    real_id = decode_id(hash_id)
    if not real_id:
        raise HTTPException(status_code=400, detail="Invalid Photo ID")

    # 2. 取得實體路徑
    photo = photo_service.get_photo(db, real_id)
    if not photo:
        raise HTTPException(status_code=404, detail="Photo not found")

    # base_dir = os.getenv("TARGET_DIR", "").strip().replace('"', '').replace("'", "")
    # 確保路徑是 OS 友善的格式
    full_path = os.path.abspath(photo.file_path)
    
    # print(f"--- DEBUG START ---")
    # print(f"Original BaseDir: [{os.getenv('TARGET_DIR')}]")
    # print(f"Cleaned BaseDir: [{base_dir}]")
    # print(f"Request Path: [{path}]")
    print(f"Full Joined Path: [{full_path}]")

    # 防禦性程式碼：檢查原始檔案是否存在
    if not os.path.exists(full_path):
        raise HTTPException(status_code=404, detail="找不到原始圖片")

    try:
        return FileResponse(full_path, media_type="image/jpeg")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"失敗: {str(e)}")
    
    
    
@router.get("/{hash_id}")
async def get_photo_detail(hash_id: str, db: Session = Depends(get_db)):
    # 1. 解碼
    real_id = decode_id(hash_id)
    if not real_id:
        raise HTTPException(status_code=400, detail="Invalid Photo ID")

    # 2. 從資料庫取得照片完整資訊
    photo : Photo = photo_service.get_photo(db, real_id)
    if not photo:
        raise HTTPException(status_code=404, detail="Photo not found")

    adj = photo_service.get_adjacent_ids(db, real_id)
    
    # 3. 回傳 JSON 格式的資料 (讓前端顯示 EXIF)
    return {
        "hash_id": hash_id,
        "file_name": photo.file_name,
        "file_path": photo.file_path,
        "make": photo.make,
        "model": photo.model,
        "lens": photo.lens,
        "f_number": photo.f_number,
        "iso": photo.iso,
        "taken_at": photo.taken_at,
        "created_at": photo.created_at,
        # 這裡提供縮圖與原圖的 URL 路徑
        "url": f"http://localhost:8000/photos/thumbnail/{hash_id}" ,
        "pagination": {
            "prev": encode_id(adj["prev"]) if adj["prev"] else None,
            "next": encode_id(adj["next"]) if adj["next"] else None
        }
    }


@router.post("/upload")
async def upload_photo(file: UploadFile = File(...), db: Session = Depends(get_db)): # 改為單個 file
    try:        
        # 這裡一定要加 await，否則 Python 只會建立一個 coroutine 物件，而不會執行它
        result = await photo_service.handle_photo_upload(db, file)
        return result # 記得回傳 Service 處理完的結果 (通常是 Photo 物件)
    except Exception as e:        
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        # 重要：顯式關閉 FastAPI 的臨時檔案
        await file.close()


# 1. 定義一個 Model，這會告訴 FastAPI：我要收一個名為 "ids" 的欄位，內容是 list
class BatchDeleteRequest(BaseModel):
    ids: List[str]

# 1. 將裝飾器從 .post 改為 .delete
@router.delete("/batch-delete")
async def batchDelete(request: BatchDeleteRequest, db: Session = Depends(get_db)): # 改為單個 file
    # 這裡要改成從 request.ids 拿資料
    try:
        # 列表推導式 的邏輯是：
        # 「我要一個結果 (decode_id)，這個結果來自於這個迴圈 (for h_id in ids)。」
        photo_ids = [decode_id(h_id) for h_id in request.ids]
        count = photo_service.batch_delete_photos(db, photo_ids)
        return {"status": "success", "deleted_count": count}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    
@router.patch("/{hash_id}")
async def update_photo_detail(hash_id: str, photo_in: PhotoUpdate, db: Session = Depends(get_db)):
    # 1. 解碼
    real_id = decode_id(hash_id)
    if not real_id:
        raise HTTPException(status_code=400, detail="Invalid Photo ID")

    # 2. 從資料庫取得照片完整資訊
    photo = photo_service.update_photo(db, real_id, photo_in)
    if not photo:
        raise HTTPException(status_code=404, detail="Photo not found")

    # 3. 回傳 JSON 格式的資料 (讓前端顯示 EXIF)
    return {
        "hash_id": hash_id,
        "file_name": photo.file_name,
        "file_path": photo.file_path,
        "make": photo.make,
        "model": photo.model,
        "lens": photo.lens,
        "f_number": photo.f_number,
        "iso": photo.iso,
        "taken_at": photo.taken_at,
        "created_at": photo.created_at,
        # 這裡提供縮圖與原圖的 URL 路徑
        "url": f"http://localhost:8000/photos/thumbnail/{hash_id}" 
    }
