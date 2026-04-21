from diffusers import StableDiffusionInpaintPipeline
import torch
import os
from PIL import Image
import numpy as np
import cv2

class SdService:    
    """
    [C# Developer Reference]
    1. Constructor: 使用 def __init__(self) 代替 public SdService()。
    2. Instance Reference: 使用 'self' 代替 'this'，且必須明確宣告在第一個參數。
    3. Access Modifiers: Python 預設皆為 public。
       - 使用 self._variable 代表 private (慣例)。
       - 使用 self.__variable 代表 hard-private (名稱混淆)。
    4. State Management: 透過 self.pipe 確保 AI 模型實例駐留在顯存中，避免重複載入。
    """
    def __init__(self):
        self.pipe = None
        # 建議存在你專案內的 models 目錄，方便管理
        self.model_path = os.path.join(os.getcwd(), "models", "sd-inpainting")

    def _load_model(self):
        """當使用者第一次勾選高級修復時才載入，節省 3080 顯存"""
        if self.pipe is None:
            print("-- 正在載入 Stable Diffusion 高級修復模型...")
            print("-- 正在初始化 Stable Diffusion Inpainting (可能需要一點時間)...")
            self.pipe = StableDiffusionInpaintPipeline.from_pretrained(
                "runwayml/stable-diffusion-inpainting",
                torch_dtype=torch.float16, # 3080 必備，速度快且省顯存
                variant="fp16",              # 下載體積更小的版本
                cache_dir=self.model_path
            ).to("cuda")

            # 優化技巧：減少顯存佔用但不影響品質
            self.pipe.enable_attention_slicing()
            print("-- SD 模型載入完成")

    # 用到 OpenCV 的 高斯模糊 (Gaussian Blur)
    # def process_mask(self, mask_pil_image):
    #     """
    #     [C# Note] 
    #     此方法註冊於類別執行個體下。
    #     'self' 參數是必須的(身分證)，因為 Python 在呼叫時會隱含傳遞實例本身。
    #     相當於 C# 中的：public void ProcessMask(Image maskPilImage) { ... }
    #     在內部存取 pipe 時，必須寫成 self.pipe (等同 this._pipe)。
    #     """
    #     """🚀 在修復前先優化 Mask 邊緣"""
        
    #     # 1. 將 PIL 轉成 OpenCV 格式
    #     mask_np = np.array(mask_pil_image.convert('L'))
        
    #     # 2. 自動擴張 (Dilation) Mask (非必須，但有時能幫助涵蓋更完整)
    #     kernel = np.ones((5,5), np.uint8)
    #     mask_np = cv2.dilate(mask_np, kernel, iterations=1)
        
    #     # 3. ✨ 核心步驟：執行高斯模糊 (羽化邊緣)
    #     # kernel size (例如 15,15) 越大，邊緣越柔和，過渡越自然。根據原圖大小調整。
    #     # (21, 21) 是模糊半徑，越大邊緣越柔和。
    #     # 建議根據圖片解析度調整，通常 15~31 之間效果最好
    #     blurred_mask = cv2.GaussianBlur(mask_np, (21, 21), 0)
        
    #     # 4. 轉回 PIL Image 傳給 SD 模型
    #     return Image.fromarray(blurred_mask)

    # def process_mask(self, mask_pil_image):
    #     mask_np = np.array(mask_pil_image.convert('L'))
        
    #     orig_w, orig_h = mask_pil_image.size
    #     max_dim = max(orig_w, orig_h)

    #     # 1. 針對大圖，膨脹核要夠大 (改用原圖長邊的 0.5% ~ 1%)
    #     # 9504 像素下，d_size 約為 47~95
    #     d_size = max(5, int(max_dim / 150)) 
    #     kernel = np.ones((d_size, d_size), np.uint8)
    #     mask_np = cv2.dilate(mask_np, kernel, iterations=2) # 跑兩次確保蓋過雜物

    #     # 2. ✨ 羽化半徑要大幅增加 ✨
    #     # 9504 像素下，blur_k 建議到 151 以上
    #     blur_k = int(max_dim / 60) 
    #     if blur_k % 2 == 0: blur_k += 1
        
    #     print(f"-- SD Mask 優化: 尺寸 {max_dim}, 膨脹 {d_size}, 模糊 {blur_k}")
        
    #     # 執行高斯模糊
    #     blurred_mask = cv2.GaussianBlur(mask_np, (blur_k, blur_k), 0)
        
    #     return Image.fromarray(blurred_mask)


    def process_mask(self, mask_pil_image):
        # 1. 轉成 OpenCV 格式 (L 模式)
        mask_np = np.array(mask_pil_image.convert('L'))
        
        # --- ✨ 新增邏輯：計算 Mask 白色區域的實體大小 ✨ ---
        # 尋找 Mask 中白色像素的 bounding box
        coords = cv2.findNonZero(mask_np)
        if coords is not None:
            x, y, w, h = cv2.boundingRect(coords)
            mask_physical_size = max(w, h) # 取得白色區域的最大邊長
            print(f"-- Mask 實體大小 (Bounding Box): {w}x{h}")
        else:
            # 如果是全黑的 Mask，不需要處理
            return mask_pil_image

        orig_w, orig_h = mask_pil_image.size
        max_img_dim = max(orig_w, orig_h)

        # 1. 膨脹 (Dilation) 力度依然參考原圖尺寸，確保蓋過雜物
        d_size = max(5, int(max_img_dim / 150)) 
        kernel = np.ones((d_size, d_size), np.uint8)
        # 為了大區域 Mask，膨脹次數可以增加
        mask_np = cv2.dilate(mask_np, kernel, iterations=2) 

        # 2. ✨ 核心修正：羽化半徑參考 Mask 的實體大小 ✨ ---
        # 我們讓 blur_k 約為 Mask 實體最大邊長的 1/3 ~ 1/2
        # 對於大區域 Mask，這會算出一個非常巨大的模糊核
        blur_k = int(mask_physical_size / 3) 
        
        # 設定一個基底最小值，防止小 Mask 模糊過頭
        min_blur = int(max_img_dim / 80) # 對大圖來說約 119
        blur_k = max(blur_k, min_blur)

        # 確保是奇數
        if blur_k % 2 == 0: blur_k += 1
        
        # 3080 雖然強，但過大的 kernel 會導致 OpenCL 錯誤，設個上限 (例如 501)
        blur_k = min(blur_k, 501) 
        
        print(f"-- SD Mask 強力優化: 原圖 {max_img_dim}, Mask實體 {mask_physical_size}, 模糊 {blur_k}")
        
        # 執行高斯模糊
        blurred_mask = cv2.GaussianBlur(mask_np, (blur_k, blur_k), 0)
        
        return Image.fromarray(blurred_mask)        

    def inpaint(self, original_img: Image.Image, mask_img: Image.Image):
        self._load_model()
        
        # 1. 取得 Mask Bounding Box (同前)
        mask_np = np.array(mask_img)
        coords = np.argwhere(mask_np > 0)
        if coords.size == 0: return original_img
        
        y0, x0 = coords.min(axis=0)
        y1, x1 = coords.max(axis=0)
        
        # 2. 擴張區域 (Margin)
        margin = 256
        orig_w, orig_h = original_img.size
        crop_x0, crop_y0 = max(0, x0 - margin), max(0, y0 - margin)
        crop_x1, crop_y1 = min(orig_w, x1 + margin), min(orig_h, y1 + margin)
        
        # 3. 切割局部
        crop_img = original_img.crop((crop_x0, crop_y0, crop_x1, crop_y1))
        crop_mask = mask_img.crop((crop_x0, crop_y0, crop_x1, crop_y1))
        
        # --- 關鍵修正：限制 SD 運算的最大解析度 ---
        # 1112x3040 太大了，我們限制長邊最大為 1024 (或 768)
        limit_size = 1024 
        cw, ch = crop_img.size
        
        if max(cw, ch) > limit_size:
            ratio = limit_size / max(cw, ch)
            target_w = int((cw * ratio) // 8) * 8
            target_h = int((ch * ratio) // 8) * 8
        else:
            target_w = (cw // 8) * 8
            target_h = (ch // 8) * 8

        print(f"-- 縮放切片進行 SD 運算: {cw}x{ch} -> {target_w}x{target_h}")

        input_img = crop_img.resize((target_w, target_h), Image.LANCZOS)
        # input_mask = crop_mask.resize((target_w, target_h), Image.NEAREST)
        # 修改這行，確保羽化不被吃掉
        input_mask = crop_mask.resize((target_w, target_h), Image.BILINEAR)
        
        # 4. 執行運算
        refined_patch = self.pipe(
            prompt="high quality, seamless background, matching texture",
            # 🚀 關鍵：加入嚴格的負面提示
            negative_prompt="text, word, letter, signature, watermark, logo, stamp, badge, emblem, branding, art, figure, pattern, artificial object, extra details",
            image=input_img,
            mask_image=input_mask,
            num_inference_steps=25
        ).images[0]
        
        # 5. 貼回原圖 (Resize 回到 crop 的大小再貼)
        final_patch = refined_patch.resize((cw, ch), Image.LANCZOS)
        # 同時，也要把當初那個「羽化後的 crop_mask」拿來當作貼圖的透明度參考
        # 確保它是 L 模式 (灰階)，才能當作 mask 參數
        # alpha_mask = crop_mask.convert("L")

        # --- 💡 改進重點：對 alpha_mask 進行額外羽化 💡 ---
        from PIL import ImageFilter
        
        # 將切片後的 mask 轉成 L (灰階)，並套用一次模糊
        # 這能確保 patch 的邊緣是「淡入淡出」的
        # radius 的大小可以根據 (cw, ch) 大小調整，通常 5~15 效果很好
        smooth_mask = crop_mask.convert("L").filter(ImageFilter.GaussianBlur(radius=10))
        
        result_img = original_img.copy()

        # 🚀 這裡最重要：paste 的第三個參數就是 Alpha Mask！
        # 這樣邊緣才會根據羽化的程度進行真正的「漸層融合」
        # result_img.paste(final_patch, (crop_x0, crop_y0), alpha_mask)
        
        # 使用這個更順滑的 smooth_mask 作為 alpha 通道
        result_img.paste(final_patch, (crop_x0, crop_y0), smooth_mask)

        return result_img

    def release_model(self):
        """如果 Ollama 需要空間，就呼叫這個"""
        if self.pipe is not None:
            print("-- 釋放 SD 顯存資源...")
            del self.pipe
            self.pipe = None
            if torch.cuda.is_available():
                torch.cuda.empty_cache()

sd_service = SdService()