# routers/editor.py
from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, UploadFile, File
from pydantic import BaseModel
from sqlmodel import Session
import os
from dotenv import load_dotenv
import io
import torch  # <--- 補上這一行
import uuid
from app.database import get_db
from app.core.utils import decode_id
from app.services import photo_service
# 這裡導入你處理影像的工具
from app.services import ai_service
from PIL import Image, ImageOps  # 引入 ImageOps
from app.services.lama_raw_service import LaMaInpainter
from app.services.sam_service import sam_service
from app.services.sd_service import sd_service
import cv2
import numpy as np
import shutil
from app.services import image_service
from fastapi.responses import FileResponse
import httpx # 建議使用 httpx 處理非同步請求
from typing import Optional
from pathlib import Path

# 載入 .env 檔案內容
load_dotenv()

# 讀取環境變數，若沒設定則預設為 gemma3:4b
OLLAMA_MODEL = os.getenv("OLLAMA_MODEL", "llama3")

# 存檔目錄與 URL 路徑保持一致
TEMP_DIR = os.path.join(os.getcwd(), "static", "adjust")
os.makedirs(TEMP_DIR, exist_ok=True)

# 建議將模型實例化放在全域，避免每次請求都重複載入 200MB 的模型
# 這是最常見的寫法，確保在不同作業系統 (Windows/Linux) 都能跑
# 1. 模型路徑標準化
BASE_DIR = os.getcwd()
LAMA_PATH = os.path.join(BASE_DIR, "models", "big-lama.pt")

# 2. 模型實例化 (全域)
# 這裡會佔用 3080 約 5-6GB VRAM
inpainter = LaMaInpainter(LAMA_PATH)

router = APIRouter()

@router.post("/smart-adjust/{hash_id}")
async def smart_adjust_photo(
    hash_id: str, 
    command: str, # 例如: "幫我調亮一點，對比拉高，看起來像日系風"
    db: Session = Depends(get_db)
):
    # 1. 呼叫 Ollama 將 command 轉為 亮度、對比、色溫等參數
    # 這裡要接收回傳的字典：{"exposure": 0.5, "clarity": 1.2, ...}
    params = ai_service.get_edit_params(command)
    
    # 2. 根據 hash_id 找到原始檔案路徑
    # 解碼取得真實 ID
    real_id = decode_id(hash_id)
    if not real_id:
        raise HTTPException(status_code=400, detail="Invalid Photo ID")

    # 取得實體路徑
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
        # 3. 執行影像處理
        with Image.open(full_path) as img:
            # 為了效能，預覽圖可以先縮放 (例如最大 1600px)
            # img.thumbnail((1600, 1600)) # <--- 註解掉這行
            
            # 呼叫我們在 ai_service 定義的專業修圖函式
            edited_img = ai_service.apply_professional_edits(img, params)
            
            # 產生唯一的暫存檔名，避免瀏覽器快取
            temp_filename = f"preview_{hash_id}_{uuid.uuid4().hex[:8]}.jpg"
            save_path = os.path.join(TEMP_DIR, temp_filename)
            
            # 存檔
            edited_img.save(save_path, "JPEG", quality=100)

            return {
                "status": "success", 
                "preview_url": f"/static/adjust/{temp_filename}", # 確保 FastAPI 有掛載 static
                "temp_filename": temp_filename, # -- 補上這一行
                "params": params # 回傳參數給前端，方便顯示目前 AI 調整了什麼
            }

        raise HTTPException(status_code=500, detail=f"影像處理失敗")
    except Exception as e:
        print(f"Edit Error: {str(e)}")
        raise HTTPException(status_code=500, detail=f"影像處理失敗: {str(e)}")

@router.post("/remove-objects-by-mask")
async def remove_objects(
    hash_id: str, 
    x: int = None, # 點擊座標 X
    y: int = None, # 點擊座標 Y
    is_advanced: bool = False,  # 👈 新增：接收前端的「高級修復」勾選狀態
    mask: UploadFile = File(None), # 塗鴉模式上傳的 Mask
    db: Session = Depends(get_db)
):
    # 解碼取得真實 ID
    real_id = decode_id(hash_id)
    if not real_id:
        raise HTTPException(status_code=400, detail="Invalid Photo ID")

    # 取得實體路徑
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
        # 1. 讀取前端傳來的 Image 和 Mask
        with Image.open(full_path).convert("RGB") as img:
            # 關鍵：根據 EXIF 方向標籤自動旋轉圖片，確保「所見即所得」
            original_img = ImageOps.exif_transpose(img).convert("RGB")

            # 保存原始 EXIF 供稍後存檔使用
            original_exif = img.info.get("exif")

            # --- 模式判斷 ---
            if x is not None and y is not None:
                # A 模式：點擊模式 (使用 SAM)
                print(f"點擊模式：座標 ({x}, {y})")
                mask_img = sam_service.get_mask_from_point(original_img, x, y)
            elif mask is not None:
                # B 模式：塗鴉模式 (使用前端上傳的檔案)
                print("塗鴉模式：讀取上傳 Mask")
                mask_content = await mask.read()
                mask_img = Image.open(io.BytesIO(mask_content)).convert("L")

                # --- 關鍵修正 A：確保尺寸「絕對」一致 ---
                if mask_img.size != original_img.size:
                    print(f"尺寸不符！原圖: {original_img.size}, Mask: {mask_img.size}。正在強制縮放...")
                    mask_img = mask_img.resize(original_img.size, Image.NEAREST)
                
                # --- 💡 關鍵：如果是高級修復，不要做二值化和膨脹 💡 ---
                # if is_advanced:
                #     # 直接保留原始塗鴉的壓力感/邊緣，交給 SD 處理
                #     pass 
                # else:

                # 只有 LaMa 模式才需要強制的硬邊膨脹
                # ... 取得 mask_img 後 ...
                mask_np = np.array(mask_img)

                # 3. 強制二值化 (將所有非黑像素轉為純白)
                _, mask_binary = cv2.threshold(mask_np, 5, 255, cv2.THRESH_BINARY)

                # 4. 膨脹運算 (Iterations=1 就夠了，kernel 15x15 已經很強)
                kernel = np.ones((15, 15), np.uint8) 
                mask_dilated = cv2.dilate(mask_binary, kernel, iterations=1)

                # 5. 回傳給 PIL 格式供 LaMa 使用
                mask_img = Image.fromarray(mask_dilated)

                # 在後端暫時加入這行，看看前端傳了什麼過來
                # 取得 debug 路徑
                debug_mask_path = os.path.join(TEMP_DIR, "debug_mask.png")
                mask_img.save(debug_mask_path)
                print(f"遮罩偵錯存檔成功: {debug_mask_path}")

            else:
                raise HTTPException(status_code=400, detail="必須提供座標或遮罩檔案")

            # 讀取並強制對齊尺寸
            # 在 result_img = inpainter.inpaint(...) 之前加入
            if mask_img.size != original_img.size:
                # 使用 NEAREST 縮放 mask 以保持邊緣清晰（不產生模糊灰色地帶）
                mask_img = mask_img.resize(original_img.size, Image.NEAREST)
                
            # --- 核心邏輯切換：選擇引擎 ---
            if is_advanced:
                # 1. 既然要用 SD，就把已經沒用的 SAM 踢出顯存，幫 3080 騰出空間
                # 只有要用 SD 時，才去把「不同類型」的 SAM 踢掉
                if sam_service.is_model_loaded():
                    print("檢測到 SAM 在位，為了 SD 效能，主動釋放...")
                    sam_service.release_model()
                    
                # -- 執行 3080 生成式修復 (Stable Diffusion)
                print("執行高級修復 (Stable Diffusion)...")

                optimized_mask = sd_service.process_mask(mask_img)

                # 可以根據照片 EXIF 或標籤給予簡單 prompt
                result_img = sd_service.inpaint(original_img, optimized_mask)
            else:
                # LaMa 很輕，通常可以跟 SAM 共存，不一定要踢掉
                # ⚡ 執行 3080 快速填充 (LaMa)
                print("執行快速修復 (LaMa)...")
                result_img = inpainter.inpaint(original_img, mask_img)
               
            # 3. 儲存結果並回傳路徑 (沿用你之前的 temp 存檔邏輯)
            temp_filename = f"cleanup_{uuid.uuid4().hex[:8]}.jpg"
            save_path = os.path.join(TEMP_DIR, temp_filename)
            # result_img.save(save_path, "JPEG", quality=95)

            # 關鍵：save 時加入 exif=original_exif
            # 如果 original_exif 為 None，它會自動忽略
            # result_img.save(save_path, "JPEG", quality=100, subsampling=0, optimize=True)

            # --- ✨ 關鍵修正：修正 EXIF 中的方向標籤 ✨ ---
            if original_exif:
                # 將原始 bytes 轉回 PIL 的 Exif 物件以便操作
                # 注意：需要 from PIL import Image
                exif_dict = result_img.getexif() 
                
                # 0x0112 是 Orientation (方向) 的標籤 ID
                # 將其設為 1 (Normal)，因為我們已經物理轉正了，不需要檢視器再次旋轉
                exif_dict[0x0112] = 1 
                
                # 更新回 original_exif
                new_exif = exif_dict.tobytes()
            else:
                new_exif = None

            result_img.save(
                save_path, 
                "JPEG", 
                quality=95,             # 從 100 降到 95 (視覺上幾乎無損，但體積大減)
                subsampling=1,          # 使用 4:2:2 取樣 (比相機預設更好，但比 4:4:4 省空間)
                optimize=True,          # 保持開啟，這能無損壓縮 5-10%
                exif=new_exif  # 使用修正過的 EXIF，DPI 還在，但方向標籤被校正了
            )

            return {
                "status": "success",
                "engine": "sd" if is_advanced else "lama",
                "preview_url": f"/static/adjust/{temp_filename}",
                "temp_filename": temp_filename, # -- 補上這一行
            }
        
        raise HTTPException(status_code=500, detail=f"影像處理失敗")
    except Exception as e:
        print(f"Edit Error: {str(e)}")
        raise HTTPException(status_code=500, detail=f"影像處理失敗: {str(e)}")
    finally:
        # 1. 確保圖片物件被釋放 (如果 mask_img 存在)
        if 'mask_img' in locals():
            mask_img.close()

        # 這裡不再主動 release_model，讓模型駐留在顯存中等待下一次請求
        # 2. 呼叫 Service 的釋放邏輯 (含 del model 與 empty_cache)
        # 這會處理掉那 2.4GB 的 SAM 權重
        # sam_service.release_model()

        # 如果有用 SD，也執行釋放 (或根據你的顯存管理決定是否常駐)
        # if is_advanced:
        #     sd_service.release_model()

        # 3. 額外清空 LaMa 或其他殘留的顯存緩存
        # if torch.cuda.is_available():
        #     torch.cuda.empty_cache()
        #     print(" GPU 顯存已深度清理")

@router.post("/clear-gpu-cache")
async def clear_gpu_cache():
    try:
        # 釋放所有大戶
        sam_service.release_model()
        sd_service.release_model()

        # 2. 🚀 釋放 Ollama (Llama 3 體系)
        # 透過發送一個 keep_alive 為 0 的空請求，強制 Ollama 卸載目前模型
        try:
            async with httpx.AsyncClient() as client:
                await client.post(
                    "http://localhost:11434/api/generate",
                    json={"model": OLLAMA_MODEL, "keep_alive": 0},
                    timeout=5.0
                )
        except Exception as ollama_err:
            print(f"Ollama release notice: {ollama_err}")

        # 強制清理 PyTorch 的快取池
        if torch.cuda.is_available():
            torch.cuda.empty_cache()
            import gc
            gc.collect()
        return {"status": "success", "message": "GPU memory cleared"}
    except Exception as e:
        # 1. 把詳細的錯誤訊息印在伺服器後台（或寫入 log 檔）
        # 這樣你自己修 bug 的時候看得到
        print(f"檔案操作失敗: {str(e)}", exc_info=True) 

        # 2. 回傳給前端一個模糊但清楚的錯誤狀態
        # 絕對不要包含變數 e 的內容
        raise HTTPException(
            status_code=500, 
            detail="伺服器處理檔案時發生錯誤，請稍後再試"
        )     
    

@router.delete("/temp-file/{filename}")
async def delete_temp_file(filename: str):
    # 1. 強制淨化：不管傳什麼，只取最後面的檔名部分
    # 例如把 "../../../etc/passwd" 變成 "passwd"
    safe_filename = os.path.basename(filename)

    # 2. 額外的安全限制 (強烈建議)
    # 只允許刪除特定前綴且符合特定副檔名的檔案
    if not (safe_filename.startswith("cleanup_") and safe_filename.endswith(".jpg")):
        raise HTTPException(status_code=400, detail="不合法的檔案請求")

    file_path = os.path.join(TEMP_DIR, safe_filename)
    
    try:
        if os.path.exists(file_path):
            os.remove(file_path)
            return {"status": "success", "message": "檔案已刪除"}
        else:
            # 為了安全，檔案不存在也可以回傳成功，不給攻擊者探測檔案存在與否的機會
            return {"status": "success", "message": "檔案已處理"} 
    except Exception as e:
        # 不要把 str(e) 丟出去，避免洩漏實體路徑
        print(f"Delete failed: {str(e)}")
        raise HTTPException(status_code=500, detail="刪除失敗")

class ApplyAdjustmentRequest(BaseModel):
    hash_id: str
    temp_filename: str

@router.post("/apply-adjustment")
async def apply_adjustment(req: ApplyAdjustmentRequest, db: Session = Depends(get_db)):
    # 1. 取得照片資訊
    hash_id = req.hash_id
    # 強制過濾檔名，
    safe_temp_name = os.path.basename(req.temp_filename)

    real_id = decode_id(hash_id)
    photo = photo_service.get_photo(db, real_id)
    if not photo:
        raise HTTPException(status_code=404, detail="找不到照片紀錄")

    original_path = photo.file_path
    temp_path = os.path.join(TEMP_DIR, safe_temp_name)

    if not os.path.exists(temp_path):
        raise HTTPException(status_code=400, detail="暫存檔案已不存在")

    try:
        # 2. 產生備份檔名 (多次 rename 邏輯)
        # 例如: my_cat.jpg -> my_cat_backup_1.jpg, my_cat_backup_2.jpg
        base, ext = os.path.splitext(original_path)
        counter = 1
        backup_path = f"{base}{ext}._backup_{counter}"
        while os.path.exists(backup_path):
            counter += 1
            backup_path = f"{base}{ext}._backup_{counter}"

        # 3. 執行更名與搬移
        # A. 先把原圖重新命名為備份檔
        os.rename(original_path, backup_path)
        
        # B. 把 AI 處理好的暫存檔搬移到原圖路徑
        shutil.move(temp_path, original_path)

        print(f"成功套用修改。原圖已備份至: {backup_path}")

        # -- 關鍵修正：刪除該圖片對應的縮圖實體檔
        # 我們可以利用 image_service 裡面獲取縮圖路徑的邏輯
        try:
            # 取得縮圖路徑 (假設你的 image_service 有提供獲取路徑的 method)
            thumb_path = image_service.get_or_create_thumbnail(original_path, original_path)

            if os.path.exists(thumb_path):
                os.remove(thumb_path)
                print(f"已刪除舊縮圖，下次請求將自動重新產生: {thumb_path}")
        except Exception as thumb_err:
            print(f"刪除縮圖失敗 (不影響主流程): {thumb_err}")
        
        return {
            "status": "success", 
            "message": "已成功覆蓋原圖",
            "backup_name": os.path.basename(backup_path)
        }
    except Exception as e:
        # 紀錄原始錯誤，但不把實體路徑丟給前端
        print(f"Critical error in apply_adjustment: {str(e)}")
        raise HTTPException(status_code=500, detail="伺服器處理檔案失敗")

@router.get("/preview/{filename}")
async def get_preview_image(filename: str):
    safe_filename = os.path.basename(filename)
    
    base_path = Path(TEMP_DIR).resolve()
    file_path = (base_path / safe_filename).resolve()

    if not file_path.is_relative_to(base_path):
         raise HTTPException(status_code=400, detail="非法存取")

    if not file_path.exists():
        raise HTTPException(status_code=404, detail="預覽圖不存在")
        
    return FileResponse(str(file_path))

class GenerateRequest(BaseModel):
    prompt: str
    negative_prompt: Optional[str] = "low quality, blurry, distorted, text, watermark, logo"
    width: Optional[int] = 512  # SD 1.5 建議從 512 開始
    height: Optional[int] = 512
    num_inference_steps: Optional[int] = 30

@router.post("/generate")
async def ai_generate(request: GenerateRequest):
    # 1. 呼叫服務生圖
    image = sd_service.generate_image(request.prompt)
    
    # 2. 存成臨時檔案或回傳 Base64
    # 這裡建議存到一個臨時目錄，方便前端顯示與下載
    file_name = f"ai_{uuid.uuid4()}.png"
    save_path = os.path.join(TEMP_DIR, file_name)
    image.save(save_path)
    
    return {
        "status": "success",
        "preview_url": f"/static/adjust/{file_name}",
        "temp_filename": file_name, # -- 補上這一行
    }