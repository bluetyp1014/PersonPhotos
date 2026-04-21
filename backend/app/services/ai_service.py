# app/services/ai_service.py
import os
from dotenv import load_dotenv
import ollama
import json
# 用來匯入內建的 「正規表達式 (Regular Expression)」 模組
# re 模組是專門用來處理 「複雜文字搜尋、比對與替換」 的工具
import re
import numpy as np
from PIL import Image, ImageEnhance
import cv2  # 記得引入

# model='llama3', 

# 載入 .env 檔案內容
load_dotenv()

# 讀取環境變數，若沒設定則預設為 gemma3:4b
OLLAMA_MODEL = os.getenv("OLLAMA_MODEL", "llama3")


def get_edit_params(command: str):
    system_prompt = """
    你是一位資深數位暗房大師。請根據指令回傳 JSON 參數。

    [核心行為準則 - 極為重要]
    1. **拒絕平庸**：除非使用者明確要求「微調」，否則所有調整數值必須具有「戲劇性的視覺差異」。
    2. **數值幅度**：關鍵參數的變動幅度應至少偏離基準值 0.3 以上。
    3. **方向性定義**：
    - shadows: < 1.0 (如 0.4-0.7) 代表壓深陰影、增加對比；> 1.0 (如 1.3-1.8) 代表拉亮暗部細節。
    - highlights: < 1.0 (如 0.5-0.8) 代表壓低過曝、找回亮部細節；> 1.0 代表增強光感。
    4. **風格聯動**：增加陰影(壓深)時，必須同時增加 clarity (1.3-1.6) 以避免畫面變悶，這能創造硬朗的立體感。

    基準值定義如下：

    [質感增強]
    - clarity: 0.0-2.0 (增強中階對比，讓物體更立體, 預設 1.0)
    - dehaze: 0.0-2.0 (消除霧氣或反光，讓畫面通透, 預設 1.0)
    - sharpness: 0.0-3.0 (銳利度, 預設 1.0)
    - midtones: 0.5-1.5 (中間調/膚色亮度，預設 1.0。人像提亮關鍵！)

    [光影控制]
    - highlights: 0.5-1.5 (縮減或增強亮部)
    - shadows: 0.5-1.5 (拉高或壓低暗部)
    - exposure: -2.0 to 2.0 (曝光補償)

    [色彩與氛圍]
    - vibrance: 0.0-2.0 (自然飽和度)
    - temp: -100 to 100 (色溫)
    - vignette: 0.0-1.0 (暗角)

    策略提示：
    - 若提到「膚色、人像、臉部提亮」，請增加 midtones (1.3-1.6)，並務必降低 highlights (0.6-0.8) 以防止背景過曝。
    - 若提到「金屬、機械、細節、硬朗」，請增加 clarity。
    - 若提到「天氣不好、灰濛濛、風景、遠景」，請增加 dehaze。
    - 若提到「復古、電影感」，請增加 shadows 與 vignette。
    請僅回傳 JSON 格式的參數物件。
    """
    
    response = ollama.chat(
    model=OLLAMA_MODEL, # 切換模型
    format='json', # 強制輸出 JSON 格式
    messages=[
        {'role': 'system', 'content': system_prompt},
        {'role': 'user', 'content': command}
        ]
    )
    
    try:
        content = response['message']['content']
        # 使用正規表達式提取第一個 { 到 最後一個 } 之間的內容
        match = re.search(r'\{.*\}', content, re.DOTALL)
        if match:
            json_str = match.group()
            return json.loads(json_str)
        return json.loads(content) # 如果沒匹配到，嘗試直接解析

        # 處理可能的 Markdown 標籤
        # if "```json" in content:
        #     content = content.split("```json")[1].split("```")[0]
        # return json.loads(content)
    except:
        # 解析失敗的回退機制
        return {"exposure": 0, "clarity": 1.0, "temp": 0}
    
def apply_professional_edits(img: Image.Image, params: dict):
    # 1. 使用 Pillow 處理基本曝光與銳利度 (這部分 Pillow 效能很好)
    if params.get('exposure', 0) != 0:
        # 將 -2.0~2.0 映射到 Pillow 的 0.0~2.0 (1.0 為基準)
        factor = 1.0 + (params['exposure'] / 2.0)
        img = ImageEnhance.Brightness(img).enhance(max(0, factor))
    
    if params.get('sharpness', 1.0) != 1.0:
        img = ImageEnhance.Sharpness(img).enhance(params['sharpness'])

    if params.get('vibrance', 1.0) != 1.0:
        img = ImageEnhance.Color(img).enhance(params['vibrance'])

    # 2. 轉換為 Numpy / OpenCV 處理複雜濾鏡
    # 注意：PIL (RGB) -> OpenCV (BGR)
    img_array = np.array(img)
    img_bgr = cv2.cvtColor(img_array, cv2.COLOR_RGB2BGR)

    # --- 處理 Clarity ---
    clarity_amount = params.get('clarity', 1.0)
    if clarity_amount != 1.0:
        img_bgr = apply_clarity(img_bgr, clarity_amount)

    # --- 處理 Dehaze ---
    dehaze_amount = params.get('dehaze', 1.0)
    if dehaze_amount != 1.0:
        img_bgr = apply_dehaze(img_bgr, dehaze_amount)

    # --- 處理色溫 (Temp) 與 陰影/高光 (Shadows/Highlights) ---
    # 轉回 float 進行曲線運算
    data = img_bgr.astype(np.float32) / 255.0
    
    # Shadows/Highlights
    if params.get('shadows', 1.0) != 1.0:
        data = np.power(data, 1.0 / params['shadows'])
    if params.get('highlights', 1.0) != 1.0:
        data = 1.0 - np.power(1.0 - data, 1.0 / params['highlights'])

    # 處理中間調 (提亮膚色的關鍵)
    if params.get('midtones', 1.0) != 1.0:
        data = np.power(data, 1.0 / params['midtones'])

    # Temp (簡單色溫模擬)
    temp = params.get('temp', 0)
    if temp != 0:
        # temp > 0 增加紅/黃 (暖), temp < 0 增加藍 (冷)
        data[:, :, 2] *= (1.0 + temp / 200.0) # Red
        data[:, :, 0] *= (1.0 - temp / 200.0) # Blue

    # 在 Temp 處理邏輯附近加入 Tint (綠/洋紅補償)
    tint = params.get('tint', 0)
    if tint != 0:
        # tint > 0 增加洋紅 (M), tint < 0 增加綠 (G)
        data[:, :, 1] *= (1.0 - tint / 500.0) # 調整 Green 通道

    # 關鍵：在進行下一步（如 Vignette）前，先做一次初步的數值約束，避免後續權限累加爆掉
    data = np.clip(data, 0, 1.0)

    # 邊緣失光 (Vignette)
    vignette = params.get('vignette', 0)
    if vignette > 0:
        data = apply_vignette(data, vignette)

    # 轉回 8-bit BGR
    res_bgr = np.clip(data * 255, 0, 255).astype(np.uint8)
    # 轉回 RGB 並返回 PIL Image
    res_rgb = cv2.cvtColor(res_bgr, cv2.COLOR_BGR2RGB)
    return Image.fromarray(res_rgb)

# 在 ai_service.py 加入中間調邏輯
def apply_midtones(data, amount):
    # amount > 1.0 提亮中間調 (類似膚色區段)
    return np.power(data, 1.0 / amount)

def apply_clarity(img_bgr, amount):
    low_res = cv2.GaussianBlur(img_bgr, (0, 0), 10)
    details = cv2.addWeighted(img_bgr, 1.5, low_res, -0.5, 0)
    return cv2.addWeighted(img_bgr, 1.0 - (amount-1), details, amount-1, 0)

def apply_dehaze(img_bgr, amount):
    offset = int((amount - 1.0) * 30)
    return cv2.convertScaleAbs(img_bgr, alpha=1.0 + (amount-1.0)*0.2, beta=-offset)

def apply_vignette(data, amount):
    rows, cols = data.shape[:2]
    kernel_x = cv2.getGaussianKernel(cols, cols/2)
    kernel_y = cv2.getGaussianKernel(rows, rows/2)
    kernel = kernel_y * kernel_x.T
    mask = kernel / kernel.max()
    # 根據 amount 調整暗角強度
    mask = 1.0 - (1.0 - mask) * amount
    for i in range(3):
        data[:, :, i] *= mask
    return data