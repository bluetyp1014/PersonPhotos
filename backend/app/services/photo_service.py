from sqlalchemy.orm import Session
from app.repository import photo_repo
import os
import shutil
import uuid  # <--- 加入這一行
from fastapi import UploadFile
from sqlalchemy.orm import Session
from app.repository import photo_repo
from app.models.photo import Photo
import utils # 假設你原本的 utils 還在
from app.core.config import settings # 引入設定
from datetime import datetime
from app.schemas.photo import PhotoUpdate
from typing import List

def get_all_photos(db: Session, skip: int, limit: int):
    # 這裡可以加入緩存邏輯或複雜過濾
    return photo_repo.get_photos(db, skip, limit)

def get_photo_timeline(db: Session):
    return photo_repo.get_photo_timeline(db)

def get_photos_by_ids(db: Session, ids: List[int]):
    # 這裡可以加入緩存邏輯或複雜過濾
    return photo_repo.get_photos_by_ids(db, ids)

def get_photo(db: Session, id: int):
    # 這裡可以加入緩存邏輯或複雜過濾
    return photo_repo.get_photo(db, id)

def get_adjacent_ids(db: Session, id: int):
    # 這裡可以加入緩存邏輯或複雜過濾
    return photo_repo.get_adjacent_ids(db, id)

def update_photo(db: Session, id: int, photo_in: PhotoUpdate):
    # 這裡可以加入緩存邏輯或複雜過濾
    return photo_repo.update_photo(db, id, photo_in)

async def handle_photo_upload(db: Session, file: UploadFile):
    # 直接使用 settings.target_dir
    target_dir = settings.target_dir

    # -- 關鍵修正：確保最頂層的基礎資料夾存在
    # 如果 D:\Sorted_test 不存在
    os.makedirs(target_dir, exist_ok=True)

    # 1. 建立初始暫存路徑 (直接串流寫入，不經過 await file.read())
    # 使用 UUID 確保暫存檔名唯一
    temp_filename = f"temp_{uuid.uuid4()}_{file.filename}"
    temp_path = os.path.join(target_dir, temp_filename)

    try:
        # 保存暫存檔
        # 直接串流寫入硬碟，完全不佔用多餘記憶體
        with open(temp_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)
            
        # 2. 嘗試讀取影像資訊 (EXIF)
        img = None
        
        try:
            # 這裡是最容易噴 ValueError 的地方
            img = utils.Image(temp_path)
            # 檢查是否有基本 EXIF 屬性 (有些截圖檔會通過初始化但讀取屬性會掛)
            _ = img.has_exif 
        except Exception as exif_err:
            print(f"⚠️ 無法讀取 EXIF 資訊 (可能為截圖): {exif_err}")
            img = None # 標記為 None，後面用安全方式讀取

        # 3. 安全地取得日期 (taken_at)
        taken_at = None
        if img:
            try:
                taken_at = utils.get_best_date(img, temp_path)
            except:
                pass
        
        # 如果讀不到日期，就用現在時間
        if not taken_at:
            taken_at = datetime.now()

        # 4. 安全地處理 GPS 與相機資訊 (截圖一定沒有)
        lat, lng = None, None
        make, model, lens, f_number, iso = None, None, None, None, None
        
        if img:
            # 只有在 img 物件存在且合法時才嘗試讀取
            lat_raw = img.get("gps_latitude")
            lng_raw = img.get("gps_longitude")
            lat = utils.dms_to_decimal(lat_raw, img.get("gps_latitude_ref")) if lat_raw else None
            lng = utils.dms_to_decimal(lng_raw, img.get("gps_longitude_ref")) if lng_raw else None
            
            make = img.get("make")
            model = img.get("model")
            lens = img.get("lens_model")
            f_number = img.get("f_number")
            iso = img.get("iso")

        # 建立分類目錄 (年/月/日)
        sub_dir = os.path.join(target_dir, str(taken_at.year), f"{taken_at.month:02d}", f"{taken_at.day:02d}")
        os.makedirs(sub_dir, exist_ok=True)

        # 最終存檔路徑
        # --- 處理檔名重複 (質感序號邏輯) ---
        base_name = file.filename
        name, ext = os.path.splitext(base_name) # 分離檔名與副檔名，例如 ("screenshot", ".png")
        final_path = os.path.join(sub_dir, base_name)
        
        counter = 1
        # 如果檔案已存在，就進入循環找尋可用的檔名
        while os.path.exists(final_path):
            # 產生新名稱：例如 screenshot_1.png, screenshot_2.png
            new_filename = f"{name}_{counter}{ext}"
            final_path = os.path.join(sub_dir, new_filename)
            counter += 1
        
        # 確保在移動前，如果是用 PIL 或其他工具打開檔案，必須先關閉
        # 如果上面使用了 img = utils.Image(temp_path)，請確保該物件已銷毀或關閉
        if 'img' in locals() and img:
            del img # 顯式刪除物件以釋放檔案控制權
            
        shutil.move(temp_path, final_path)
        # --------------------------------
        
        # 封裝模型
        new_photo = Photo(
            file_name=os.path.basename(final_path), # 這才是真正的存檔名稱
            file_path=final_path,
            # 使用 .get() 並提供預設值 None，防止截圖檔崩潰
            make=make,
            model=model,
            lens=lens,
            f_number=f_number,
            iso=iso,
            lat=lat,
            lng=lng,
            taken_at=taken_at,
            created_at=datetime.now() # 別忘了我們新加的排序欄位   
        )
        
        # 存入 DB
        return photo_repo.create_photo(db, new_photo)
        
    except Exception as e:
        print(f"致命錯誤詳細資訊: {str(e)}") # 這行能在終端機幫你抓兇手
        if os.path.exists(temp_path): os.remove(temp_path)
        raise e
 
# 這是同步函數，最穩健 
def batch_delete_photos(db: Session, photo_ids: list[int]):
    # 1. 一次抓出所有要刪除的照片資訊
    photos = photo_repo.get_photos_byids(db, photo_ids)
    
    deleted_count = 0
    for photo in photos:
        try:
            # 物理刪除檔案
            if os.path.exists(photo.file_path):
                os.remove(photo.file_path)
            # 刪除資料庫紀錄
            photo_repo.delete_photo(db, photo)
            deleted_count += 1
        except Exception as e:
            print(f"刪除檔案失敗: {photo.file_path}, 錯誤: {e}")

    db.commit()
    return deleted_count