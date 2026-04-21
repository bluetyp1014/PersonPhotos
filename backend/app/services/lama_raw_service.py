import torch
import numpy as np
import cv2
from PIL import Image

class LaMaInpainter:
    def __init__(self, model_path: str):
        # 1. 載入模型 (JIT 格式) 到 3080 GPU
        self.device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
        self.model = torch.jit.load(model_path, map_location=self.device)
        self.model.eval()

    def _pad_image(self, img):
        # LaMa 需要圖片長寬是 8 的倍數
        h, w = img.shape[:2]
        pad_h = (8 - h % 8) % 8
        pad_w = (8 - w % 8) % 8
        return np.pad(img, ((0, pad_h), (0, pad_w), (0, 0)), mode='edge'), (pad_h, pad_w)

    def inpaint(self, image_pil: Image.Image, mask_pil: Image.Image):
        # 2. 影像預處理
        img = np.array(image_pil.convert("RGB")).astype(np.float32) / 255.0
        mask = np.array(mask_pil.convert("L")).astype(np.float32) / 255.0
        mask = (mask > 0.5).astype(np.float32) # 二值化

        # 補邊
        img_padded, (ph, pw) = self._pad_image(img)
        mask_padded, _ = self._pad_image(mask[:, :, None])

        # 轉為 Tensor (Batch, Channel, H, W)
        img_tensor = torch.from_numpy(img_padded).permute(2, 0, 1).unsqueeze(0).to(self.device)
        mask_tensor = torch.from_numpy(mask_padded).permute(2, 0, 1).unsqueeze(0).to(self.device)

        # 3. 推理 (3080 運算)
        with torch.no_grad():
            output = self.model(img_tensor, mask_tensor)

        # 4. 後處理
        output = output[0].permute(1, 2, 0).cpu().numpy()
        output = np.clip(output * 255, 0, 255).astype(np.uint8)

        # 裁切回原本大小
        h, w = img.shape[:2]
        output = output[:h, :w, :]
        
        return Image.fromarray(output)

# 使用方式
# inpainter = LaMaInpainter("D:/.../big-lama.pt")
# result = inpainter.inpaint(original_img, mask_img)