import numpy as np
from PIL import Image
import os

class SamService:
    """
    [C# Developer Reference]
    1. Constructor: 使用 def __init__(self) 代替 public SdService()。
    2. Instance Reference: 使用 'self' 代替 'this'，且必須明確宣告在第一個參數。
    3. Access Modifiers: Python 預設皆為 public。
       - 使用 self._variable 代表 private (慣例)。
       - 使用 self.__variable 代表 hard-private (名稱混淆)。
    4. State Management: 透過 self.pipe 確保 AI 模型實例駐留在顯存中，避免重複載入。
    """
    def __init__(self, model_type="vit_h", checkpoint_path=None):
        self.model_type = model_type
        self.checkpoint_path = checkpoint_path or os.path.join(os.getcwd(), "models", "sam_vit_h_4b8939.pth")
        self.predictor = None
        self.model = None

    def _load_model(self):
        """私有方法：當真正需要時才載入模型"""
        if self.model is None:
            import torch  # type: ignore
            from segment_anything import sam_model_registry, SamPredictor

            print(f"-- 正在加載 SAM 模型 ({self.model_type})...")
            self.model = sam_model_registry[self.model_type](checkpoint=self.checkpoint_path)
            self.model.to(device="cuda")
            self.predictor = SamPredictor(self.model)
            print("-- SAM 模型載入完成")

    def get_mask_from_point(self, image_pil: Image.Image, x: int, y: int):
        """根據點擊座標生成 Mask"""
        try:
            self._load_model()
            
            # 轉換影像格式給 SAM
            image_np = np.array(image_pil.convert("RGB"))
            self.predictor.set_image(image_np)

            # 執行推理 (point_labels 1 代表正向點擊)
            masks, scores, logits = self.predictor.predict(
                point_coords=np.array([[x, y]]),
                point_labels=np.array([1]),
                multimask_output=False,
            )
            
            # 將結果轉為黑白 PIL Image
            mask_image = Image.fromarray((masks[0] * 255).astype(np.uint8))
            return mask_image
        finally:
            # 這裡不立即釋放，建議由外部決定何時釋放，或執行完立即釋放
            pass

    def is_model_loaded(self) -> bool:
            """檢查 SAM 模型是否還在顯存中"""
            # 如果你的變數是 self.predictor 或 self.model，就檢查它是否不為 None
            return self.model is not None

    def release_model(self):
        """強制釋放顯存"""
        if self.model is not None:
            try:
                import torch  # type: ignore
            except Exception:
                torch = None

            print("-- 正在釋放 SAM 模型顯存...")
            del self.model
            del self.predictor
            self.model = None
            self.predictor = None
            if torch is not None and torch.cuda.is_available():
                torch.cuda.empty_cache()
            print("-- 顯存已清理")

# 單例模式供全域使用
sam_service = SamService()