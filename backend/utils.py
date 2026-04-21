import os
from datetime import datetime
from exif import Image

def dms_to_decimal(coords, ref):
    if not coords or not ref: return None
    decimal = coords[0] + coords[1] / 60 + coords[2] / 3600
    if ref in ['S', 'W']: decimal = -decimal
    return decimal

def get_best_date(img_obj, file_path):
    # 優先權 1: 嘗試從 EXIF 讀取
    if img_obj:
        # 嘗試不同的 EXIF 日期欄位
        for field in ["datetime_original", "datetime", "datetime_digitized"]:
            dt_str = img_obj.get(field)
            if dt_str:
                try:
                    # EXIF 標準格式通常是 "YYYY:MM:DD HH:MM:SS"
                    return datetime.strptime(str(dt_str)[:19], '%Y:%m:%d %H:%M:%S')
                except (ValueError, TypeError):
                    continue # 格式不對就找下一個欄位

    # 優先權 2: 檔案修改時間 (當沒有 EXIF 或解析失敗時的終極備案)
    # 這對於截圖或通訊軟體傳來的照片非常有用
    try:
        mtime = os.path.getmtime(file_path)
        return datetime.fromtimestamp(mtime)
    except Exception:
        # 萬一連檔案時間都讀不到（極罕見），回傳現在時間
        return datetime.now()