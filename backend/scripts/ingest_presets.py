import os
import re
import json
from dotenv import load_dotenv

# 載入 .env 檔案內容
load_dotenv()

# 設定路徑
BASE_PATH = os.getenv("BASE_PATH")
DB_PATH = os.getenv("DB_PATH")

# 讀取環境變數，若沒設定則預設為 gemma3:4b
OLLAMA_MODEL = os.getenv("OLLAMA_MODEL", "llama3:4b")

collection = None

def parse_lrtemplate(file_path):
    """解析檔案提取關鍵參數"""
    with open(file_path, 'r', encoding='utf-8', errors='ignore') as f:
        content = f.read()

    # Lightroom Develop presets (.lrtemplate) 常見是：
    # value = { settings = { Exposure2012 = 0.25, Temperature = 5200, ... }, uuid = "..." }
    #
    # 這裡的 keys 是從 `Lightroom-Presets-master` 內的 Develop presets 統計整理出的常見參數集合。
    keys = [
        "AutoBrightness",
        "AutoContrast",
        "AutoExposure",
        "AutoGrayscaleMix",
        "AutoLateralCA",
        "AutoShadows",
        "AutoTone",
        "Blacks2012",
        "BlueHue",
        "BlueSaturation",
        "Brightness",
        "CameraProfile",
        "CameraProfileDigest",
        "ChromaticAberrationB",
        "ChromaticAberrationR",
        "Clarity",
        "Clarity2012",
        "ColorNoiseReduction",
        "ColorNoiseReductionDetail",
        "Contrast",
        "Contrast2012",
        "ConvertToGrayscale",
        "CorrectionActive",
        "CorrectionAmount",
        "CorrectionID",
        "CorrectionReferenceX",
        "CorrectionReferenceY",
        "CropAngle",
        "CropBottom",
        "CropConstrainToWarp",
        "CropLeft",
        "CropRight",
        "CropTop",
        "Defringe",
        "EnableCalibration",
        "EnableColorAdjustments",
        "EnableDetail",
        "EnableEffects",
        "EnableGradientBasedCorrections",
        "EnableGrayscaleMix",
        "EnableLensCorrections",
        "EnableSplitToning",
        "EnableVignettes",
        "ExperimentalLocalContrast",
        "ExperimentalSharpenAmount",
        "ExperimentalSharpenDetail",
        "ExperimentalSharpenEdgeDensity",
        "ExperimentalSharpenEdgeWidth",
        "ExperimentalSharpenRadius",
        "ExperimentalSoftenAmount",
        "ExperimentalSoftenRadius",
        "Exposure",
        "Exposure2012",
        "FillLight",
        "FullX",
        "FullY",
        "GrainAmount",
        "GrainFrequency",
        "GrainSize",
        "GrayMixerAqua",
        "GrayMixerBlue",
        "GrayMixerGreen",
        "GrayMixerMagenta",
        "GrayMixerOrange",
        "GrayMixerPurple",
        "GrayMixerRed",
        "GrayMixerYellow",
        "GreenHue",
        "GreenSaturation",
        "HighlightRecovery",
        "Highlights2012",
        "HueAdjustmentAqua",
        "HueAdjustmentBlue",
        "HueAdjustmentGreen",
        "HueAdjustmentMagenta",
        "HueAdjustmentOrange",
        "HueAdjustmentPurple",
        "HueAdjustmentRed",
        "HueAdjustmentYellow",
        "IncrementalTemperature",
        "IncrementalTint",
        "LensManualDistortionAmount",
        "LensProfileEnable",
        "LensProfileSetup",
        "LocalBrightness",
        "LocalClarity",
        "LocalContrast",
        "LocalExposure",
        "LocalSaturation",
        "LocalSharpness",
        "LocalToningHue",
        "LocalToningSaturation",
        "LuminanceAdjustmentAqua",
        "LuminanceAdjustmentBlue",
        "LuminanceAdjustmentGreen",
        "LuminanceAdjustmentMagenta",
        "LuminanceAdjustmentOrange",
        "LuminanceAdjustmentPurple",
        "LuminanceAdjustmentRed",
        "LuminanceAdjustmentYellow",
        "LuminanceNoiseReductionContrast",
        "LuminanceNoiseReductionDetail",
        "LuminanceSmoothing",
        "MaskID",
        "MaskValue",
        "orientation",
        "ParametricDarks",
        "ParametricHighlights",
        "ParametricHighlightSplit",
        "ParametricLights",
        "ParametricMidtoneSplit",
        "ParametricShadows",
        "ParametricShadowSplit",
        "PerspectiveHorizontal",
        "PerspectiveRotate",
        "PerspectiveScale",
        "PerspectiveVertical",
        "PostCropVignetteAmount",
        "PostCropVignetteFeather",
        "PostCropVignetteHighlightContrast",
        "PostCropVignetteMidpoint",
        "PostCropVignetteRoundness",
        "PostCropVignetteStyle",
        "ProcessVersion",
        "RedHue",
        "RedSaturation",
        "Saturation",
        "SaturationAdjustmentAqua",
        "SaturationAdjustmentBlue",
        "SaturationAdjustmentGreen",
        "SaturationAdjustmentMagenta",
        "SaturationAdjustmentOrange",
        "SaturationAdjustmentPurple",
        "SaturationAdjustmentRed",
        "SaturationAdjustmentYellow",
        "Shadows",
        "Shadows2012",
        "ShadowTint",
        "SharpenDetail",
        "SharpenEdgeMasking",
        "SharpenRadius",
        "Sharpness",
        "SplitToningBalance",
        "SplitToningHighlightHue",
        "SplitToningHighlightSaturation",
        "SplitToningShadowHue",
        "SplitToningShadowSaturation",
        "Temperature",
        "Tint",
        "ToneCurveName",
        "ToneCurveName2012",
        "Vibrance",
        "VignetteAmount",
        "VignetteMidpoint",
        "What",
        "WhiteBalance",
        "Whites2012",
        "ZeroX",
        "ZeroY",
    ]

    # 只解析 settings block，避免抓到其他 template 設定（例如 web gallery）
    settings_match = re.search(r"\bsettings\s*=\s*\{(?P<body>[\s\S]*?)\n\s*\}\s*,\s*\n\s*uuid\b", content)
    settings_body = settings_match.group("body") if settings_match else content

    # 支援數值/布林/字串
    kv_re = re.compile(
        r"(?m)^\s*(?P<key>[A-Za-z0-9_]+)\s*=\s*(?P<val>-?\d+(?:\.\d+)?|true|false|\"[^\"]*\")\s*,?\s*$"
    )
    found = {m.group("key"): m.group("val") for m in kv_re.finditer(settings_body)}

    params = {}
    for key in keys:
        raw = found.get(key)
        out_key = key.lower()
        if raw is None:
            params[out_key] = 0.0
            continue

        if raw == "true":
            params[out_key] = 1.0
        elif raw == "false":
            params[out_key] = 0.0
        elif raw.startswith('"') and raw.endswith('"'):
            # 類別型參數（例如 WhiteBalance/ProcessVersion）保留文字
            params[out_key] = raw.strip('"')
        else:
            try:
                params[out_key] = float(raw)
            except Exception:
                params[out_key] = 0.0

    return params

def get_style_description(params):
    """叫 Ollama 根據參數產生風格描述 (語義化)"""
    import ollama
    prompt = f"""
    你是一位專業攝影評論員。請根據以下 Lightroom 修圖參數，用一段 50 字以內的中文描述這種風格的視覺感受與適用場景。
    不要輸出任何解釋，只給我描述文字。
    
    參數：{json.dumps(params)}
    """
    response = ollama.chat(model=OLLAMA_MODEL, messages=[{'role': 'user', 'content': prompt}])
    return response['message']['content'].strip()

def run_ingestion():
    print(f"BASE_PATH={BASE_PATH}")
    print(f"DB_PATH={DB_PATH}")
    print(f"OLLAMA_MODEL={OLLAMA_MODEL}")
    print("開始掃描並存入風格庫...")

    # 延後初始化，讓 `parse_lrtemplate()` 可以在沒裝 chromadb/ollama 的環境下做離線測試
    global collection
    if collection is None:
        import chromadb

        client = chromadb.PersistentClient(path=DB_PATH)
        collection = client.get_or_create_collection(name="photo_style_library")
    
    # 遍歷資料夾
    for root_dir, dirs, files in os.walk(BASE_PATH):
        for file in files:
            if file.endswith(".lrtemplate"):
                file_path = os.path.join(root_dir, file)
                preset_name = os.path.splitext(file)[0]
                
                try:
                    # 1. 提取
                    params = parse_lrtemplate(file_path)
                    
                    # 2. 語義化 (叫 Ollama 寫描述)
                    description = get_style_description(params)
                    print(f"處理中: {preset_name} -> {description[:20]}...")
                    
                    # 3. 儲存至 ChromaDB
                    collection.add(
                        documents=[description], # 供未來搜尋的文字
                        metadatas=[params],       # 原始數值
                        ids=[preset_name]         # 使用檔名作為 ID
                    )
                except Exception as e:
                    print(f"處理檔案 {file} 時發生錯誤: {e}")

if __name__ == "__main__":
    run_ingestion()
    print("風格庫建立完成！")