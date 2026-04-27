# app/services/ai_service.py
import os
from dotenv import load_dotenv
import ollama
import json
import re
import numpy as np
from PIL import Image, ImageEnhance
import cv2

# 載入 .env 檔案內容
load_dotenv()

# 讀取環境變數，若沒設定則預設為 llama3
OLLAMA_MODEL = os.getenv("OLLAMA_MODEL", "llama3")


def _clamp(x: float, lo: float, hi: float) -> float:
    return max(lo, min(hi, x))


def _lr_to_editor_params(lr_meta: dict) -> dict:
    """
    將 Lightroom preset 的 settings metadata（ingest_presets.py 存進 ChromaDB 的 metadatas）
    粗略映射成前端/後端目前 `apply_professional_edits()` 使用的參數尺度。

    - Lightroom 多數 slider 是 [-100, 100]，本專案多用 [0.5, 1.5] 或 [0, 2] 以 1.0 為基準。
    - 這裡做的是「可用」的近似映射，主要用途是給 LLM 當參考範例。
    """
    m = lr_meta or {}

    # Lightroom 可能同時存在 Exposure 與 Exposure2012；以 2012 優先
    exposure = float(m.get("exposure2012", m.get("exposure", 0.0)) or 0.0)

    # Basic sliders (LR: -100..100 -> editor: 0.5..1.5 around 1.0)
    highlights_lr = float(m.get("highlights2012", 0.0) or 0.0)
    shadows_lr = float(m.get("shadows2012", m.get("shadows", 0.0)) or 0.0)
    highlights = _clamp(1.0 + highlights_lr / 200.0, 0.5, 1.5)
    shadows = _clamp(1.0 + shadows_lr / 200.0, 0.5, 1.5)

    clarity_lr = float(m.get("clarity2012", m.get("clarity", 0.0)) or 0.0)
    clarity = _clamp(1.0 + clarity_lr / 100.0, 0.0, 2.0)

    vibrance_lr = float(m.get("vibrance", 0.0) or 0.0)
    vibrance = _clamp(1.0 + vibrance_lr / 100.0, 0.0, 2.0)

    # Contrast and saturation
    contrast_lr = float(m.get("contrast2012", m.get("contrast", 0.0)) or 0.0)
    contrast = _clamp(1.0 + contrast_lr / 100.0, 0.5, 1.5)

    saturation_lr = float(m.get("saturation", 0.0) or 0.0)
    saturation = _clamp(1.0 + saturation_lr / 100.0, 0.0, 2.0)

    # Temperature (LR: kelvin around ~5000) -> editor temp: -100..100
    temp_k = m.get("temperature", None)
    if isinstance(temp_k, (int, float)):
        temp = int(_clamp((float(temp_k) - 5000.0) / 50.0, -100.0, 100.0))
    else:
        temp = int(m.get("incrementaltemperature", 0) or 0)
        temp = int(_clamp(float(temp), -100.0, 100.0))

    tint_lr = float(m.get("tint", m.get("incrementaltint", 0.0)) or 0.0)
    tint = int(_clamp(tint_lr, -100.0, 100.0))

    # Vignette (LR PostCropVignetteAmount: negative => dark corners)
    vig_lr = float(m.get("postcropvignetteamount", 0.0) or 0.0)
    vignette = _clamp(max(0.0, -vig_lr) / 100.0, 0.0, 1.0)

    # Sharpness (LR Sharpness: 0..150-ish) -> editor sharpness: 0..3 around 1.0
    sharp_lr = float(m.get("sharpness", 0.0) or 0.0)
    sharpness = _clamp(1.0 + sharp_lr / 100.0, 0.0, 3.0)

    # Parametric Tone Curve (LR: -100..100 -> editor: 0.5..1.5)
    # 與 shadows/highlights 保持相同換算邏輯，讓 LLM 可以類比理解
    param_shadows_lr = float(m.get("parametricshadows", 0.0) or 0.0)
    param_highlights_lr = float(m.get("parametrichighlights", 0.0) or 0.0)
    param_midtones_lr = float(m.get("parametricmidtones", 0.0) or 0.0)

    param_shadows = _clamp(1.0 + param_shadows_lr / 200.0, 0.5, 1.5)
    param_highlights = _clamp(1.0 + param_highlights_lr / 200.0, 0.5, 1.5)
    # midtones 用 /100 讓效果更明顯（與 apply_midtones 的 power 曲線對應）
    param_midtones = _clamp(1.0 + param_midtones_lr / 100.0, 0.5, 1.5)

    # Blacks / Whites clip point (LR: -100..100 -> editor: 0.5..1.5)
    blacks_lr = float(m.get("blacks2012", m.get("blacks", 0.0)) or 0.0)
    whites_lr = float(m.get("whites2012", m.get("whites", 0.0)) or 0.0)
    blacks = _clamp(1.0 + blacks_lr / 200.0, 0.5, 1.5)
    whites = _clamp(1.0 + whites_lr / 200.0, 0.5, 1.5)

    return {
        "exposure": float(_clamp(exposure, -2.0, 2.0)),
        "highlights": float(highlights),
        "shadows": float(shadows),
        "clarity": float(clarity),
        "dehaze": 1.0,  # preset 集合裡不一定有 Dehaze，先當作基準值
        "sharpness": float(sharpness),
        "midtones": float(param_midtones),  # 取代寫死的 1.0，使用 parametric midtones
        "vibrance": float(vibrance),
        "saturation": float(saturation),
        "contrast": float(contrast),
        "temp": int(temp),
        "tint": int(tint),
        "vignette": float(vignette),
        "param_shadows": float(param_shadows),
        "param_highlights": float(param_highlights),
        "blacks": float(blacks),
        "whites": float(whites),
    }


def _retrieve_style_examples(command: str, n_results: int = 5) -> list[dict]:
    print(f"_retrieve_style_examples: 進入 RAG 檢索，command='{command}', n_results={n_results}")

    """
    從 ChromaDB 的 `photo_style_library` 檢索與 command 最接近的風格描述與 metadata。
    回傳：[{id, description, lr_meta, editor_params, distance}, ...]
    """
    try:
        try:
            import posthog as _posthog  # type: ignore
            _orig_posthog_capture = getattr(_posthog, "capture", None)
            if _orig_posthog_capture is not None:
                def _compat_capture(*args, **kwargs):
                    try:
                        if len(args) == 1:
                            return _orig_posthog_capture(*args, **kwargs)
                        if len(args) >= 3:
                            distinct_id = args[0]
                            event_name = args[1]
                            properties = args[2] or {}
                            return _orig_posthog_capture(event_name, distinct_id=distinct_id, properties=properties, **kwargs)
                        if len(args) == 2:
                            return _orig_posthog_capture(args[1], distinct_id=args[0], **kwargs)
                    except Exception as e:
                        if os.getenv("RAG_DEBUG") == "1":
                            import traceback
                            print("[RAG] posthog.capture wrapper error:", e)
                            traceback.print_exc()
                        return None

                _posthog.capture = _compat_capture
        except Exception:
            pass

        import chromadb
        chromadb.configure(anonymized_telemetry=False)
    except Exception:
        if os.getenv("RAG_DEBUG") == "1":
            print("[RAG] chromadb not installed; returning empty examples")
        return []

    db_path = os.getenv("DB_PATH")
    print(f"[RAG] db_path={db_path}")

    if not db_path:
        db_path = os.path.join(os.getcwd(), "chroma_db")

    try:
        client = chromadb.PersistentClient(path=db_path)
        print(f"[RAG] created chromadb client: {type(client)} persist_path={db_path}")
        try:
            collection = client.get_or_create_collection(name="photo_style_library")
            print(f"[RAG] got collection: {collection}")
        except Exception as e:
            import traceback
            try:
                import chromadb as _chromadb
                print(f"[RAG] chromadb settings: {_chromadb.get_settings().__dict__}")
            except Exception:
                pass
            print(f"[RAG] get_or_create_collection failed: {e!r}")
            traceback.print_exc()
            raise

        res = collection.query(
            query_texts=[command],
            n_results=n_results,
            include=["documents", "metadatas", "distances"],
        )

        print(f"[RAG] query raw result keys: {list(res.keys())}")
        print(f"[RAG] ids/documents/metadatas lengths:",
            len((res.get('ids') or [[]])[0]),
            len((res.get('documents') or [[]])[0]),
            len((res.get('metadatas') or [[]])[0]))
    except Exception:
        import traceback
        print(f"[RAG] query failed (db_path={db_path}):", repr(Exception))
        traceback.print_exc()
        return []

    ids = (res.get("ids") or [[]])[0]
    docs = (res.get("documents") or [[]])[0]
    metas = (res.get("metadatas") or [[]])[0]
    dists = (res.get("distances") or [[]])[0]

    examples = []
    for i in range(min(len(ids), len(docs), len(metas))):
        lr_meta = metas[i] or {}
        examples.append(
            {
                "id": ids[i],
                "description": docs[i],
                "lr_meta": lr_meta,
                "editor_params": _lr_to_editor_params(lr_meta),
                "distance": float(dists[i]) if i < len(dists) and dists[i] is not None else None,
            }
        )
    return examples


def get_edit_params_with_rag(command: str) -> tuple[dict, list[dict]]:
    """
    與 `get_edit_params()` 相同，但同時回傳 RAG 檢索到的範例，方便前端顯示「參考了哪些風格」。

    回傳：
    - params: LLM 產生的參數（你現有 schema）
    - rag_examples: [{id, style_description, suggested_params, distance}, ...]
    """
    examples = _retrieve_style_examples(command, n_results=int(os.getenv("RAG_TOP_K", "5")))
    rag_examples = [
        {
            "id": ex.get("id"),
            "style_description": ex.get("description"),
            "suggested_params": ex.get("editor_params"),
            "distance": ex.get("distance"),
        }
        for ex in examples
    ]

    params = get_edit_params(command)
    return params, rag_examples


def get_edit_params(command: str):
    # RAG：先用 command 去風格庫找相近 preset，當作 prompt 的參考範例
    examples = _retrieve_style_examples(command, n_results=int(os.getenv("RAG_TOP_K", "5")))
    examples_text = ""
    if examples:
        lines = []
        for ex in examples:
            lines.append(
                json.dumps(
                    {
                        "id": ex["id"],
                        "style_description": ex["description"],
                        "suggested_params": ex["editor_params"],
                    },
                    ensure_ascii=False,
                )
            )
        examples_text = "\n".join(lines)

    system_prompt = """
    你是一位資深數位暗房大師。請根據指令回傳 JSON 參數。

    [核心行為準則 - 極為重要]
    1. **數值幅度**：關鍵參數的變動幅度應至少偏離基準值 0.3 以上。
    2. **方向性定義**：
    - shadows: 0.7-1.3 為常用範圍，極端風格才超出此範圍。
    - highlights: < 1.0 (如 0.5-0.8) 代表壓低過曝、找回亮部細節；> 1.0 代表增強光感。
    - param_shadows: tone curve 暗部段微調，與 shadows 聯動使用。
    - param_highlights: tone curve 亮部段微調，與 highlights 聯動使用。
    - blacks: 截點壓深 (< 1.0) 或拉亮 (> 1.0)，影響最暗部。
    - whites: 截點壓低 (< 1.0) 或拉亮 (> 1.0)，影響最亮部。
    3. **風格聯動**：增加陰影(壓深)時，必須同時增加 clarity (1.3-1.6) 以避免畫面變悶，這能創造硬朗的立體感。

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
    - param_shadows: 0.5-1.5 (tone curve 暗部段，預設 1.0)
    - param_highlights: 0.5-1.5 (tone curve 亮部段，預設 1.0)
    - blacks: 0.5-1.5 (最暗部截點，預設 1.0)
    - whites: 0.5-1.5 (最亮部截點，預設 1.0)

    [色彩與氛圍]
    - vibrance: 0.0-1.5 (自然飽和度)
    - saturation: 0.0-1.5 (全域飽和度)
    - contrast: 0.5-1.5 (對比度)
    - temp: -60 to 60 (色溫)
    - tint: -60 to 60 (色調)
    - vignette: 0.0-1.0 (暗角)

    策略提示：
    - 若提到「膚色、人像、臉部提亮」，請增加 midtones (1.3-1.6)，並務必降低 highlights (0.6-0.8) 以防止背景過曝。
    - 若提到「金屬、機械、細節、硬朗」，請增加 clarity。
    - 若提到「天氣不好、灰濛濛、風景、遠景」，請增加 dehaze。
    - 若提到「復古、電影感」，請增加 shadows 與 vignette，並配合 blacks (0.6-0.8) 壓深暗部。
    - 若提到「高對比、衝擊感」，同時調整 blacks (< 1.0) 與 whites (> 1.0) 拉開動態範圍。
    請僅回傳 JSON 格式的參數物件。
    """

    if examples_text:
        system_prompt += f"""

    [RAG 風格庫參考]
    以下是從風格資料庫檢索到、與使用者指令相近的 preset 範例（每筆都有風格描述與建議參數）。
    你必須參考它們的風格趨勢，但最終仍要以使用者指令為準，輸出一份新的 JSON 參數。

    範例（JSON Lines）：
    {examples_text}
    """

    # 計算 RAG 範例的加權平均參數（距離越小權重越大），作為 LLM 的起始參考
    rag_weighted_params = {}
    if examples:
        vals = []
        dists = []
        for ex in examples:
            vals.append(ex.get("editor_params") or {})
            dists.append(ex.get("distance"))

        eps = 1e-6
        weights = []
        for d in dists:
            if d is None:
                weights.append(1.0)
            else:
                weights.append(1.0 / (d + eps))
        total_w = sum(weights) if sum(weights) > 0 else 1.0
        norm_w = [w / total_w for w in weights]

        all_keys = set()
        for v in vals:
            all_keys.update(v.keys())

        for k in all_keys:
            num_sum = 0.0
            wsum = 0.0
            for i, v in enumerate(vals):
                val = v.get(k)
                if isinstance(val, (int, float)):
                    num_sum += norm_w[i] * float(val)
                    wsum += norm_w[i]
            if wsum > 0:
                rag_weighted_params[k] = num_sum / wsum

    if rag_weighted_params:
        system_prompt += f"""

    [RAG Weighted Params]
    以下為基於檢索到的範例，依距離加權後的建議參數（數值）。請以此作為產生最終參數的起始點，必要時做視覺化強化，但不要完全複製。
    {json.dumps(rag_weighted_params, ensure_ascii=False)}
    """
        
    # 永遠附加，放最後讓 LLM 最後讀到
    system_prompt += """

    [數值安全範圍 - 必須遵守]
    - shadows / highlights / midtones：建議 0.7~1.4，極端風格上限 1.6
    - temp：建議 -60~60，避免色偏過強
    - vibrance × saturation 乘積不超過 1.8
    - blacks / whites：建議 0.85~1.15，微調即可
    - contrast：建議 0.8~1.3
    """    

    response = ollama.chat(
        model=OLLAMA_MODEL,
        format='json',
        messages=[
            {'role': 'system', 'content': system_prompt},
            {'role': 'user', 'content': command}
        ]
    )

    try:
        content = response['message']['content']
        match = re.search(r'\{.*\}', content, re.DOTALL)
        if match:
            json_str = match.group()
            return json.loads(json_str)
        return json.loads(content)
    except:
        return {"exposure": 0, "clarity": 1.0, "temp": 0}


def apply_professional_edits(img: Image.Image, params: dict):
    # 1. 曝光與銳利度用 Pillow 處理
    if params.get('exposure', 0) != 0:
        factor = 1.0 + (params['exposure'] / 2.0)
        img = ImageEnhance.Brightness(img).enhance(max(0, factor))

    if params.get('sharpness', 1.0) != 1.0:
        img = ImageEnhance.Sharpness(img).enhance(params['sharpness'])

    # NOTE: contrast 只在 numpy pipeline 處理，避免 Pillow + numpy 雙重套用

    # 2. 轉換為 Numpy / OpenCV 處理複雜濾鏡
    img_array = np.array(img)
    img_bgr = cv2.cvtColor(img_array, cv2.COLOR_RGB2BGR)

    # --- Clarity ---
    clarity_amount = params.get('clarity', 1.0)
    if clarity_amount != 1.0:
        img_bgr = apply_clarity(img_bgr, clarity_amount)

    # --- Dehaze ---
    dehaze_amount = params.get('dehaze', 1.0)
    if dehaze_amount != 1.0:
        img_bgr = apply_dehaze(img_bgr, dehaze_amount)

    # --- 轉 float 進行曲線運算 ---
    data = img_bgr.astype(np.float32) / 255.0

    # Blacks / Whites clip point
    # blacks < 1.0 壓深最暗部（截點下移），blacks > 1.0 拉亮暗部
    # whites < 1.0 壓低最亮部（截點下移），whites > 1.0 拉亮亮部
    # ── Blacks / Whites：改用更穩定的線性縮放 ──────────────────────
    blacks = float(params.get('blacks', 1.0) or 1.0)
    whites = float(params.get('whites', 1.0) or 1.0)
    if blacks != 1.0 or whites != 1.0:
        # blacks < 1.0 -> 壓深暗部截點（往上移），blacks > 1.0 -> 拉亮
        # whites < 1.0 -> 壓低亮部截點，whites > 1.0 -> 拉亮
        lo = _clamp((1.0 - blacks) * 0.08, -0.08, 0.08)
        hi = _clamp(1.0 + (whites - 1.0) * 0.08, 0.92, 1.08)
        data = (data - lo) / max(hi - lo, 1e-6)

    # Shadows / Highlights（全域 power curve）
    shadows = float(params.get('shadows', 1.0) or 1.0)
    highlights = float(params.get('highlights', 1.0) or 1.0)
    if shadows != 1.0:
        data = np.power(np.clip(data, 0, 1), 1.0 / shadows)
    if highlights != 1.0:
        data = 1.0 - np.power(np.clip(1.0 - data, 0, 1), 1.0 / highlights)

    # Parametric Tone Curve — 只作用在對應亮度區段
    # param_shadows: 影響 0.0~0.4 的暗部區段
    # param_highlights: 影響 0.6~1.0 的亮部區段
    param_shadows = float(params.get('param_shadows', 1.0) or 1.0)
    param_highlights = float(params.get('param_highlights', 1.0) or 1.0)
    if param_shadows != 1.0:
        data = apply_parametric_curve(data, param_shadows, zone='shadows')
    if param_highlights != 1.0:
        data = apply_parametric_curve(data, param_highlights, zone='highlights')

    # Midtones（提亮膚色的關鍵）
    midtones = float(params.get('midtones', 1.0) or 1.0)
    if midtones != 1.0:
        data = apply_midtones(data, midtones)

    # ── Vibrance / Saturation：clamp combined_sat 避免負權重 ────────
    vib = float(params.get('vibrance', 1.0) or 1.0)
    sat = float(params.get('saturation', 1.0) or 1.0)
    combined_sat = _clamp(vib * sat, 0.0, 2.0)  # ← 加這行
    if combined_sat != 1.0:
        gray_uint8 = cv2.cvtColor(
            (np.clip(data, 0, 1) * 255).astype(np.uint8), cv2.COLOR_BGR2GRAY
        ).astype(np.float32) / 255.0
        gray3 = np.stack([gray_uint8] * 3, axis=2)
        alpha = _clamp(combined_sat, 0.0, 1.0)   # 混合比例限制在 0~1
        data = gray3 * (1.0 - alpha) + data * alpha

    # Contrast（只在 numpy 做，Pillow 那段已移除）
    contrast = float(params.get('contrast', 1.0) or 1.0)
    if contrast != 1.0:
        data = (data - 0.5) * contrast + 0.5

    # Temp（色溫）
    # ── Temp：各通道獨立 clip，防止單通道爆掉 ──────────────────────
    temp = params.get('temp', 0)
    if temp != 0:
        data[:, :, 2] = np.clip(data[:, :, 2] * (1.0 + temp / 300.0), 0, 1)  # 分母改 300
        data[:, :, 0] = np.clip(data[:, :, 0] * (1.0 - temp / 300.0), 0, 1)

    # Tint（綠/洋紅補償）
    tint = params.get('tint', 0)
    if tint != 0:
        data[:, :, 1] *= (1.0 - tint / 500.0)  # Green channel

    # clip 一次避免後續累加爆掉
    data = np.clip(data, 0, 1.0)

    # Vignette（暗角）
    vignette = params.get('vignette', 0)
    if vignette > 0:
        data = apply_vignette(data, vignette)

    # 轉回 8-bit BGR -> RGB -> PIL
    res_bgr = np.clip(data * 255, 0, 255).astype(np.uint8)
    res_rgb = cv2.cvtColor(res_bgr, cv2.COLOR_BGR2RGB)
    return Image.fromarray(res_rgb)


# ── 輔助函式 ──────────────────────────────────────────────────────────────────

def apply_midtones(data: np.ndarray, amount: float) -> np.ndarray:
    """power curve 提亮/壓暗中間調（amount > 1.0 提亮）"""
    return np.power(np.clip(data, 0, 1), 1.0 / amount)


def apply_parametric_curve(data: np.ndarray, amount: float, zone: str) -> np.ndarray:
    """
    只對指定亮度區段（shadows / highlights）套用 power curve，
    其餘區段以線性內插平滑過渡，避免產生明顯的色調斷層。

    zone='shadows'    : 主要作用在 0.0~0.4，過渡到 0.6
    zone='highlights' : 主要作用在 0.6~1.0，過渡到 0.4
    """
    data = np.clip(data, 0, 1)
    adjusted = np.power(data, 1.0 / amount)

    if zone == 'shadows':
        # luma 越低，weight 越高；超過 0.6 則完全不作用
        weight = np.clip(1.0 - data / 0.6, 0, 1)
    else:  # highlights
        # luma 越高，weight 越高；低於 0.4 則完全不作用
        weight = np.clip((data - 0.4) / 0.6, 0, 1)

    return data * (1.0 - weight) + adjusted * weight


def apply_clarity(img_bgr: np.ndarray, amount: float) -> np.ndarray:
    low_res = cv2.GaussianBlur(img_bgr, (0, 0), 10)
    details = cv2.addWeighted(img_bgr, 1.5, low_res, -0.5, 0)
    return cv2.addWeighted(img_bgr, 1.0 - (amount - 1), details, amount - 1, 0)


def apply_dehaze(img_bgr: np.ndarray, amount: float) -> np.ndarray:
    offset = int((amount - 1.0) * 30)
    return cv2.convertScaleAbs(img_bgr, alpha=1.0 + (amount - 1.0) * 0.2, beta=-offset)


def apply_vignette(data: np.ndarray, amount: float) -> np.ndarray:
    rows, cols = data.shape[:2]
    kernel_x = cv2.getGaussianKernel(cols, cols / 2)
    kernel_y = cv2.getGaussianKernel(rows, rows / 2)
    kernel = kernel_y * kernel_x.T
    mask = kernel / kernel.max()
    mask = 1.0 - (1.0 - mask) * amount
    for i in range(3):
        data[:, :, i] *= mask
    return data