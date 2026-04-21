import os
from PIL import Image, ImageOps  # 👈 1. 引入 ImageOps
from fastapi.responses import FileResponse

# 假設這是你的全域設定
CACHE_DIR = os.path.join(os.getcwd(), "thumb_cache")
os.makedirs(CACHE_DIR, exist_ok=True)

def get_or_create_thumbnail(full_path: str, relative_path: str):
    # 建立快取檔名 (將路徑符號轉義)
    cache_filename = relative_path.replace("/", "_").replace("\\", "_")
    cache_path = os.path.join(CACHE_DIR, cache_filename)

    # 1. 檢查快取是否存在 (對應 C# 的 Cache Layer)
    if os.path.exists(cache_path):
        return cache_path

    # 2. 如果沒有快取，現場製作 (對應 C# 的 Image Processing Logic)
    with Image.open(full_path) as img:
        # ✨ 核心修正：物理轉正圖片 ✨
        # 這樣 thumbnail 算出來的寬高比才會是對的（直式就是直的）
        img = ImageOps.exif_transpose(img)

        # 轉換為 RGB 確保能存成 JPEG (預防有透明度的圖片)
        if img.mode in ("RGBA", "P"):
            img = img.convert("RGB")

        # 製作縮圖 (400x400 會按比例縮放)
        img.thumbnail((400, 400))

        # 儲存 (縮圖不需要保留原始 EXIF，節省空間)
        img.save(cache_path, "JPEG", quality=85, optimize=True)
        
    return cache_path