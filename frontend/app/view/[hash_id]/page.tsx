"use client";

import { useEffect, useState, use, useMemo, useRef } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { api, getImageUrl, getThumbUrl } from "@/lib/api";
import {
  PARAM_LABELS,
  QUICK_TAGS,
  type PhotoDetail,
  type AIParams,
} from "@/types/photo";
import InpaintCanvas from "@/components/editor/InpaintCanvas";
import toast from "react-hot-toast";

// 必須有 export default
export default function PhotoViewPage({
  params,
}: {
  params: Promise<{ hash_id: string }>;
}) {
  // 在 Client Component 中，我們使用 use(params) 來取得解包後的 hash_id
  const { hash_id } = use(params);

  const API_BASE = process.env.NEXT_PUBLIC_API_BASE;

  // ... 在組件內部
  const router = useRouter();
  // const searchParams = useSearchParams();

  //const photo = await getPhotoDetail(hash_id);

  const [photo, setPhoto] = useState<PhotoDetail | null>(null);
  const [loading, setLoading] = useState(true); // 增加一個 Loading 狀態

  // 1. 新增狀態控管
  const [isEditing, setIsEditing] = useState(false);
  const [editedInfo, setEditedInfo] = useState({
    file_name: "",
    taken_at: "",
    // created_at: "",
    // is_public: photo.is_public, // 假設你的後端有這欄位
  });

  // 在組件內部的 useState 區塊新增
  const [aiCommand, setAiCommand] = useState("");
  const [isAiProcessing, setIsAiProcessing] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [showComparison, setShowComparison] = useState(false);
  const [appliedParams, setAppliedParams] = useState<AIParams | null>(null);

  // 在原本的 useState 區塊新增
  const [isInpaintMode, setIsInpaintMode] = useState(false);
  const [currentMaskBlob, setCurrentMaskBlob] = useState<Blob | null>(null);
  const [brushSize, setBrushSize] = useState(50);
  // 1. 增加一個控制重置的狀態
  const [canvasKey, setCanvasKey] = useState(0);
  const [isDirty, setIsDirty] = useState(false); // 標記畫布是否有被塗抹

  const [isadvanced, setIsAdvanced] = useState(true);

  // 在組件頂部
  const [imgTimestamp, setImgTimestamp] = useState(Date.now());

  const currentImageUrl = useMemo(() => {
    return getImageUrl(photo?.hash_id ?? "");
  }, [photo?.hash_id, imgTimestamp]);

  // 加上 t 參數確保這是一個全新的、帶有 CORS 的請求
  const corsImageUrl = currentImageUrl
    ? `${currentImageUrl}${currentImageUrl.includes("?") ? "&" : "?"}cors=true`
    : "";
  const imageRef = useRef<HTMLImageElement>(null);

  const [isClearingGPU, setIsClearingGPU] = useState(false);

  const [lastTempFilename, setLastTempFilename] = useState<string | null>(null);

  const [isPanning, setIsPanning] = useState(false); // 是否正在按住空白鍵平移

  // 1. 在元件頂部定義狀態
  const [scale, setScale] = useState(1);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const containerRef = useRef<HTMLDivElement>(null);

  const [isAltPressed, setIsAltPressed] = useState(false);

  // 從 URL Query 中獲取 prev 和 next
  const [prev, setPrev] = useState<string | null>(null);
  const [next, setNext] = useState<string | null>(null);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // 🛡️ 判斷是否為 Alt 鍵
      if (e.key.toLowerCase() === "alt") setIsAltPressed(true);
    };
    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() === "alt") setIsAltPressed(false);
    };

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
    };
  }, []);

  // 2. 處理滾輪事件 (攔截瀏覽器縮放)
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const handleNativeWheel = (e: WheelEvent) => {
      // 🚀 核心邏輯：只有在按下 Alt 鍵時才執行縮放
      if (isAltPressed) {
        e.preventDefault(); // 🛡️ 阻止頁面捲動

        const zoomSpeed = 0.001;
        const delta = -e.deltaY;

        setScale((prev) => {
          const newScale = Math.min(Math.max(prev + delta * zoomSpeed, 1), 5);
          return newScale;
        });
      }
    };

    container.addEventListener("wheel", handleNativeWheel, { passive: false });
    return () => container.removeEventListener("wheel", handleNativeWheel);
  }, [isAltPressed]); // 🚀 依賴 isZPressed

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.code === "Space") setIsPanning(true);
    };
    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.code === "Space") setIsPanning(false);
    };
    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
    };
  }, []);

  const handleApply = async () => {
    if (!lastTempFilename || !photo || !photo.hash_id) return;

    if (!confirm("確定要將此結果覆蓋原圖嗎？(原圖將會自動備份)")) return;

    try {
      // -- 關鍵修正：直接傳入物件，不要包在 body 裡，也不要 stringify
      const res = await api.post(`/api/v1/editor/apply-adjustment`, {
        hash_id: photo.hash_id,
        temp_filename: lastTempFilename,
      });

      if (res.data.status) {
        toast.success("🎉 已成功套用至原圖！");
        // -- 關鍵：套用後要重新整理頁面或更新圖片快取
        // window.location.reload();

        // -- 關鍵：更新 key 讓圖片強制重新渲染，而不一定要重新整頁
        setImgTimestamp(Date.now());
        setShowComparison(false);
        setPreviewUrl(null);
        setIsAltPressed(false);
      }
    } catch (error) {
      console.error("套用失敗:", error);
    }
  };

  const handleDiscard = async () => {
    if (!lastTempFilename) return;

    try {
      const res = await api.delete(
        `/api/v1/editor/temp-file/${lastTempFilename}`,
      );
      if (res.data.status) {
        setImgTimestamp(Date.now());
        setShowComparison(false);
        setPreviewUrl(null); // 清除畫面上的圖
        setLastTempFilename(null);
        setIsAltPressed(false);
        toast.success("-- 實體檔案已從伺服器移除");
      }
    } catch (error) {
      console.error("刪除檔案失敗:", error);
    }
  };

  const handleClearGPU = async () => {
    if (
      !confirm(
        "確定要釋放顯存嗎？這將會清空所有已載入的模型，下次使用需重新載入。",
      )
    )
      return;

    setIsClearingGPU(true);
    try {
      const res = await api.post(`/api/v1/editor/clear-gpu-cache`);
      if (res.data.status) {
        toast.success("🧹 顯存清理完成！");
      }
    } catch (error) {
      console.error("清理顯存失敗:", error);
    } finally {
      setIsClearingGPU(false);
    }
  };

  // 新增提交函數
  async function handleInpaintSubmit() {
    if (!currentMaskBlob) return;

    setIsAiProcessing(true);
    try {
      const formData = new FormData();
      formData.append("mask", currentMaskBlob, "mask.png");

      const res = await api.post(
        `/api/v1/editor/remove-objects-by-mask?hash_id=${hash_id}&is_advanced=${isadvanced}`,
        formData,
        {
          headers: { "Content-Type": "multipart/form-data" },
        },
      );

      if (res.data.status === "success") {
        // 如果使用方案二，前端 previewUrl 拼接方式
        // return `${API_BASE}/api/v1/photos/original/${hash_id}`;
        const fullPreviewUrl = `${API_BASE}/api/v1/editor/preview/${res.data.temp_filename}?t=${Date.now()}`;
        setPreviewUrl(fullPreviewUrl);
        setLastTempFilename(res.data.temp_filename);
        setShowComparison(true);
        // setIsInpaintMode(false); // 完成後關閉模式

        setCanvasKey((prev) => prev + 1); // 改變 key，Canvas 會被強制清空
        setCurrentMaskBlob(null); // 同時清空準備上傳的資料
        setIsDirty(false);
      }
    } catch (err) {
      alert("去雜物失敗");
    } finally {
      setIsAiProcessing(false);
    }
  }

  async function handleAiAdjust() {
    if (!aiCommand.trim()) return;

    if (isInpaintMode) setIsInpaintMode(false); // 關閉模式
    setIsAiProcessing(true);

    try {
      // 呼叫你的後端 editor API
      const res = await api.post(
        `/api/v1/editor/smart-adjust/${hash_id}?command=${encodeURIComponent(aiCommand)}`,
      );

      if (res.data.status === "success") {
        // 加上 timestamp 防止瀏覽器快取
        // 串接後端回傳的 /static/adjust/... 路徑，並加上 timestamp 避開快取

        const fullPreviewUrl = `${API_BASE}/api/v1/editor/preview/${res.data.temp_filename}?t=${Date.now()}`;
        setPreviewUrl(fullPreviewUrl);
        setLastTempFilename(res.data.temp_filename);
        setAppliedParams(res.data.params); // 儲存後端回傳的參數
        setShowComparison(true);
      }
    } catch (err) {
      console.error("AI 修圖失敗:", err);
      alert("AI 修圖失敗，請檢查後端日誌");
    } finally {
      setIsAiProcessing(false);
    }
  }

  async function getPhotoDetail(hashId: string) {
    try {
      // 使用你定義好的 axios 實例
      const res = await api.get(`/api/v1/photos/${hashId}`);
      setPhoto(res.data);
      // 初始化編輯表單
      setEditedInfo({
        file_name: res.data.file_name,
        taken_at: res.data.taken_at ? res.data.taken_at.split("T")[0] : "",
        // created_at: res.data.created_at
        //   ? res.data.created_at.split("T")[0]
        //   : "",
        // is_public: res.data.is_public ?? true,
      });

      setPrev(res.data.pagination.prev);
      setNext(res.data.pagination.next);
    } catch (error) {
      console.error("獲取照片失敗:", error);
      return null;
    } finally {
      setLoading(false);
    }
  }

  // 初次進入頁面自動載入第一批
  useEffect(() => {
    console.log("當前頁面的 Hash ID:", hash_id);
    getPhotoDetail(hash_id);
  }, [hash_id]);

  // 2. 提交編輯的函數
  async function handleUpdate() {
    try {
      const res = await api.patch(`/api/v1/photos/${hash_id}`, editedInfo);
      setPhoto(res.data); // 更新本地 UI
      setIsEditing(false);
    } catch (err) {
      alert("更新失敗");
    }
  }

  // 3. 刪除照片的函數
  async function handleDelete() {
    if (confirm("確定要刪除這張照片嗎？此操作無法復原。")) {
      const selectedIds = [hash_id];

      try {
        const response = await api.delete("/api/v1/photos/batch-delete", {
          data: { ids: selectedIds }, // DELETE 的 Body 需要放在 data 屬性中
        });

        // await api.delete(`/api/v1/photos/${hash_id}`);
        router.push("/"); // 假設回首頁
      } catch (err) {
        alert("刪除失敗");
      }
    }
  }

  // 監控 isInpaintMode 到底變了幾次
  useEffect(() => {
    console.log("🔄 [DEBUG] isInpaintMode 狀態變更為:", isInpaintMode);
  }, [isInpaintMode]);

  // 監控 canvasKey 是否被重置
  useEffect(() => {
    console.log("🔑 [DEBUG] canvasKey 變更為:", canvasKey);
  }, [canvasKey]);

  // 監控 photo 是否變動
  useEffect(() => {
    console.log("📸 [DEBUG] Photo 對象變更");
  }, [photo]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement) return;

      if (e.key === "ArrowLeft" && prev) router.push(`/view/${prev}`);
      if (e.key === "ArrowRight" && next) router.push(`/view/${next}`);
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [prev, next, router]); // <--- 這裡很重要，確保切換後鍵盤邏輯能拿到最新的 ID

  // 優化：Loading 狀態顯示
  if (loading) {
    return (
      <div className="min-h-screen bg-neutral-950 flex items-center justify-center text-zinc-500">
        Loading...
      </div>
    );
  }

  if (!photo) {
    return (
      <div className="min-h-screen bg-neutral-950 text-white p-8">
        找不到照片
      </div>
    );
  }

  return (
    <main className="min-h-screen w-full bg-neutral-950 text-zinc-100 flex flex-col mt-16">
      {/* 1. 上方：大圖檢視區 */}
      <section className="relative flex-1 flex items-center justify-center p-0 md:p-0 min-h-[60vh] bg-neutral-950">
        {/* 左側切換按鈕 */}
        {prev && (
          <button
            onClick={() => router.push(`/view/${prev}`)}
            className="absolute left-4 top-1/2 -translate-y-1/2 z-60 bg-black/20 hover:bg-black/50 p-3 rounded-full backdrop-blur-md border border-white/10 text-white transition-all"
          >
            <svg
              className="w-8 h-8"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2"
                d="M15 19l-7-7 7-7"
              />
            </svg>
          </button>
        )}

        {/* 右側切換按鈕 */}
        {next && (
          <button
            onClick={() => router.push(`/view/${next}`)}
            className="absolute right-4 top-1/2 -translate-y-1/2 z-60 bg-black/20 hover:bg-black/50 p-3 rounded-full backdrop-blur-md border border-white/10 text-white transition-all"
          >
            <svg
              className="w-8 h-8"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2"
                d="M9 5l7 7-7 7"
              />
            </svg>
          </button>
        )}
        <button
          onClick={() => router.back()} // 呼叫瀏覽器返回上一頁
          className="absolute top-4 left-8 z-50 bg-neutral-900/50 hover:bg-neutral-800 p-2 rounded-full transition-colors backdrop-blur-md border border-white/10 text-white cursor-pointer"
        >
          <svg
            className="w-6 h-6"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="2"
              d="M15 19l-7-7 7-7"
            />
          </svg>
        </button>
        <div className="flex flex-col md:flex-row items-center justify-center gap-6 w-full max-w-[95vw] h-full mt-15 transition-all duration-700">
          {/* 左側：原始圖片 + 塗鴉層 */}
          <div
            ref={containerRef}
            className={`relative transition-all duration-700 ease-in-out ${showComparison ? "w-full md:w-1/2" : "w-full max-w-[95vw]"}`}
            style={{
              height: "60vh", // 🚀 確保高度固定，這是 overflow-hidden 生效的前提
              cursor: isAltPressed
                ? "zoom-in"
                : isInpaintMode
                  ? "crosshair"
                  : "default",
              backgroundColor: isAltPressed
                ? "rgba(59, 130, 246, 0.05)"
                : "transparent", // 🚀 按下 Z 時給個淡淡的藍色底，增加手感
            }}
            // -- 核心修正 A：點擊容器時，如果是在塗鴉模式，絕對禁止它觸發任何父級行為
            onClick={(e) => {
              if (isInpaintMode) {
                console.log("🛡️ [DEBUG] 父層點擊已被封鎖，防止模式切換");
                e.stopPropagation();
                e.preventDefault();
              }
            }}
          >
            {/* 🚀 縮放與平移層 */}
            <div
              className="w-full h-full flex items-center justify-center"
              style={{
                transform: `scale(${scale}) translate(${position.x}px, ${position.y}px)`,
                transformOrigin: "center", // 建議先用中心縮放，最穩
                transition: "transform 0.1s ease-out",
              }}
            >
              <div className="relative inline-block">
                {" "}
                {/* 包裹內容的內層 */}
                <img
                  ref={imageRef} // -- 給它一個 ref
                  src={`${corsImageUrl}?v=${imgTimestamp}`}
                  alt="Original"
                  className="w-full h-full max-h-[60vh] object-contain shadow-2xl rounded-lg border border-white/5"
                  // -- 核心修正 B：防止圖片本身的預設拖拽行為干擾 Canvas
                  onDragStart={(e) => e.preventDefault()}
                  crossOrigin="anonymous" // -- 為了讓 Canvas 能讀取，這行還是得留著
                />
                {/* 加入畫布層 */}
                {/* 只有在開啟模式時，才掛載畫布 */}
                {isInpaintMode && (
                  <div
                    className="absolute inset-0 z-30"
                    // -- 核心修正 C：確保這一層完全接收所有事件，不讓它漏下去
                    onClick={(e) => e.stopPropagation()}
                    onMouseDown={(e) => e.stopPropagation()}
                  >
                    <InpaintCanvas
                      key={`inpaint-${photo.hash_id}-${canvasKey}`}
                      imageElement={imageRef.current} // -- 直接傳入 DOM 節點
                      brushSize={brushSize}
                      isActive={true}
                      onExportMask={(blob) => setCurrentMaskBlob(blob)}
                      onDrawStart={() => setIsDirty(true)}
                    />
                  </div>
                )}
              </div>
            </div>
            {/* CSS 的 z-index 只有在元素有 position: relative, absolute, 或 fixed 時才有效 */}
            <div className="flex justify-center flex-wrap items-center gap-x-3 gap-y-2 mt-4 relative z-50 bg-black/50 py-2 rounded-lg backdrop-blur-sm">
              <span
                className={`px-2 py-0.5 rounded text-xs font-bold transition-colors ${
                  isAltPressed
                    ? "bg-blue-500 text-white"
                    : "bg-gray-700 text-gray-300"
                }`}
              >
                Alt
              </span>
              <span className="text-gray-400 text-xs">+ 滾輪可以縮放圖檔</span>
              {scale !== 1 && (
                <button
                  onClick={() => setScale(1)}
                  className="ml-2 text-[10px] bg-white/10 hover:bg-white/20 px-2 py-0.5 rounded text-white transition-all"
                >
                  重設 (100%)
                </button>
              )}
            </div>
          </div>

          {/* 右側：AI 預覽圖片 (有資料且開啟對比時才顯示) */}
          {showComparison && previewUrl && (
            <div className="relative w-full md:w-1/2 transition-all duration-700 ease-in-out animate-in fade-in slide-in-from-right-10">
              <div className="absolute -top-8 left-10 z-10 bg-sky-500/80 backdrop-blur-md px-3 py-1 rounded-full border border-sky-400/30 text-[10px] text-white uppercase tracking-widest font-bold shadow-lg shadow-sky-500/20">
                AI Adjusted
              </div>
              {/* 按鈕組 */}
              <div className="absolute -top-8 right-8 z-20 flex gap-2">
                {/* -- 套用按鈕 (打勾) */}
                <button
                  onClick={handleApply}
                  title="滿意，套用至原圖"
                  className="bg-emerald-500/80 hover:bg-emerald-600 p-1.5 rounded-full text-white transition-all border border-emerald-400/30 cursor-pointer shadow-lg hover:scale-110"
                >
                  <svg
                    className="w-4 h-4"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth="2"
                      d="M5 13l4 4L19 7"
                    />
                  </svg>
                </button>
                {/* -- 刪除實體檔案按鈕 (垃圾桶) */}
                <button
                  onClick={handleDiscard}
                  title="不滿意，刪除此結果"
                  className="bg-red-500/80 hover:bg-red-600 p-1.5 rounded-full text-white transition-all border border-red-400/30 cursor-pointer shadow-lg hover:scale-110"
                >
                  <svg
                    className="w-4 h-4"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth="2"
                      d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-4v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                    />
                  </svg>
                </button>

                {/* 原本的關閉預覽按鈕 (X) */}
                <button
                  onClick={() => setShowComparison(false)}
                  title="關閉預覽 (保留結果)"
                  className="bg-sky-900/80 hover:bg-sky-800 p-1.5 rounded-full text-zinc-400 hover:text-white transition-colors border border-white/10 cursor-pointer"
                >
                  <svg
                    className="w-4 h-4"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth="2"
                      d="M6 18L18 6M6 6l12 12"
                    />
                  </svg>
                </button>
              </div>
              <img
                src={previewUrl}
                alt="AI Adjusted"
                className="w-full max-h-[60vh] object-contain shadow-2xl rounded-lg"
              />
            </div>
          )}
        </div>
      </section>
      {/* 在資訊區下方加入 AI 指令輸入 */}
      <section className="w-full max-w-7xl mx-auto px-6 py-2">
        <div className="mt-10 pt-8 border-t border-zinc-900">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-2 h-2 bg-sky-500 rounded-full animate-pulse" />
            <div className="space-y-1">
              <h3 className="text-sm font-bold text-sky-400 uppercase tracking-widest">
                AI 智慧去雜物
              </h3>
              <p className="text-xs text-zinc-400">
                💡{" "}
                <span className="text-zinc-300 font-medium">
                  建議每次塗抹單一區域
                </span>
                <br />
                分次處理能獲得更精緻的 AI 生成細節
              </p>
            </div>
          </div>
          <div className="flex gap-4 mb-6">
            <button
              onClick={() => setIsInpaintMode(!isInpaintMode)}
              className={`px-6 py-2 rounded-full text-sm font-bold transition-all ${
                isInpaintMode
                  ? "bg-amber-500 text-black"
                  : "bg-zinc-800 text-zinc-400"
              }`}
            >
              {isInpaintMode ? "🖌️ 塗鴉中 (請在圖上塗抹雜物)" : "🪄 去雜物模式"}
            </button>

            {/* -- 清理顯存小按鈕 */}
            <button
              onClick={handleClearGPU}
              disabled={isClearingGPU}
              title="釋放顯卡顯存 (GPU Memory)"
              className="p-2 rounded-full bg-zinc-900 border border-zinc-700 text-zinc-500 hover:text-amber-400 hover:border-amber-400/50 transition-colors disabled:opacity-50"
            >
              {isClearingGPU ? (
                <div className="animate-spin text-xs">🌀</div>
              ) : (
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="18"
                  height="18"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M3 6h18" />
                  <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" />
                  <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
                  <line x1="10" x2="10" y1="11" y2="17" />
                  <line x1="14" x2="14" y1="11" y2="17" />
                </svg>
              )}
            </button>

            {isInpaintMode && (
              <div className="flex items-center gap-4 animate-in fade-in slide-in-from-left-4">
                <input
                  type="range"
                  min="10"
                  max="100"
                  value={brushSize}
                  onChange={(e) => setBrushSize(Number(e.target.value))}
                  className="w-32 accent-amber-500"
                />
                {/* checkbox */}
                {/* <div
                  className="flex items-center gap-3 py-2 group cursor-pointer"
                  onClick={() => setIsAdvanced(!isadvanced)}
                >
                  <div className="relative flex items-center justify-center">
                    <input
                      type="checkbox"
                      className="peer h-5 w-5 cursor-pointer appearance-none rounded-md border border-zinc-700 bg-zinc-900 
                      transition-all checked:border-sky-500 checked:bg-sky-500 hover:border-zinc-500"
                      checked={isadvanced}
                      onChange={(e) => setIsAdvanced(e.target.checked)}
                    />
                    <svg
                      className="absolute w-3.5 h-3.5 text-white opacity-0 peer-checked:opacity-100 transition-opacity pointer-events-none"
                      xmlns="http://www.w3.org/2000/svg"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="4"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                  </div>
                  <div className="flex flex-col">
                    <span
                      className="text-sm font-bold text-zinc-300 group-hover:text-sky-400 transition-colors"
                      title=" (Stable Diffusion)"
                    >
                      ✨ 高級修復
                    </span>
                    <span className="text-[10px] text-zinc-600 uppercase tracking-tighter">
                      適合複雜背景，運算較慢
                    </span>
                  </div>
                </div> */}
                <button
                  // 改用 isDirty 來判斷，反應最快
                  disabled={!isDirty || isAiProcessing}
                  onClick={handleInpaintSubmit}
                  className="bg-white text-black px-6 py-2 rounded-full text-sm font-bold hover:bg-amber-400 transition-colors
                  /* 修正點如下 */
                hover:enabled:bg-amber-400       /* 只有在 enabled 時才允許 hover 變色 */
                  disabled:opacity-30             /* 禁用時變透明 */
                  disabled:cursor-not-allowed     /* 禁用時顯示禁止符號 */
                  "
                >
                  {isAiProcessing ? "處理中..." : "執行去除"}
                </button>

                <button
                  onClick={() => {
                    setCanvasKey((prev) => prev + 1); // 改變 key，Canvas 會被強制清空
                    setCurrentMaskBlob(null); // 同時清空準備上傳的資料
                  }}
                  className="bg-white text-black px-6 py-2 rounded-full text-sm font-bold hover:bg-amber-400 transition-colors"
                >
                  清除遮罩
                </button>
              </div>
            )}
          </div>
          <div className="flex items-center gap-3 mb-4">
            <div className="w-2 h-2 bg-sky-500 rounded-full animate-pulse" />
            <h3 className="text-sm font-bold text-zinc-300 uppercase tracking-widest">
              AI 智慧暗房
            </h3>
            {/* 快速標籤列 */}
            <div className="flex flex-wrap gap-2">
              {QUICK_TAGS.map((tag) => (
                <button
                  key={tag}
                  type="button"
                  // 點擊時更新輸入框內容 (假設你的 state 叫 command)
                  onClick={() => {
                    const tagToAdd = tag;

                    // 1. 如果輸入框是空的，直接設為標籤
                    if (!aiCommand.trim()) {
                      setAiCommand(tagToAdd);
                      return;
                    }

                    // 2. 如果標籤已經存在，就不重複加入 (防止點兩次變成 "人像, 人像")
                    if (aiCommand.includes(tagToAdd)) return;

                    // 3. 智慧組合：自動補上逗號
                    // 使用正則表達式或簡單判斷結尾是否有逗號
                    const separator = aiCommand.trim().endsWith(",")
                      ? " "
                      : ", ";
                    setAiCommand(`${aiCommand.trim()}${separator}${tagToAdd}`);
                  }}
                  className="px-3 py-1.5 text-xs font-medium bg-zinc-800/50 hover:bg-sky-500/20 text-zinc-400 hover:text-sky-400 border border-zinc-700 hover:border-sky-500/50 rounded-full transition-all cursor-pointer active:scale-95"
                >
                  + {tag}
                </button>
              ))}

              {/* 清除按鈕 (可選) */}
              {aiCommand && (
                <button
                  onClick={() => setAiCommand("")}
                  className="px-3 py-1.5 text-xs font-medium text-zinc-500 hover:text-red-400 transition-colors cursor-pointer"
                >
                  清除
                </button>
              )}
            </div>
          </div>
          {/* 新增：參數顯示面板 */}
          {appliedParams && typeof appliedParams === "object" && (
            <div className="relative mb-6 group">
              {/* 容器：設定 overflow-x-auto 允許橫向滾動，並隱藏滾動條 (scrollbar-hide) */}
              <div className="flex items-center gap-2 overflow-x-auto pb-2 scrollbar-hide no-scrollbar select-none">
                {Object.entries(appliedParams).map(([key, value]) => {
                  if (typeof value === "object" && value !== null) return null;

                  const numValue = Number(value);
                  const label =
                    PARAM_LABELS[key] ||
                    key.charAt(0).toUpperCase() + key.slice(1);
                  const isDefault =
                    key === "temp" || key === "tint" || key === "exposure"
                      ? numValue === 0
                      : numValue === 1;

                  return (
                    <div
                      key={key}
                      // 關鍵修改：使用 flex-shrink-0 確保物件不會被擠壓，min-w 保持寬度
                      className="shrink-0 min-w-17.5 bg-zinc-900/60 border border-zinc-800/50 p-2 rounded-xl flex flex-col items-center hover:bg-zinc-800 transition-colors"
                    >
                      <span className="text-[12px] text-zinc-400 uppercase tracking-tighter mb-0.5 whitespace-nowrap">
                        {label}
                      </span>
                      <span
                        className={`text-xs font-mono font-bold ${!isDefault ? "text-sky-400" : "text-zinc-600"}`}
                      >
                        {typeof value === "number"
                          ? value.toFixed(1)
                          : String(value)}
                      </span>
                    </div>
                  );
                })}
              </div>

              {/* 可選：增加左右漸層遮罩，提示使用者後面還有內容 */}
              <div className="absolute inset-y-0 right-0 w-8 bg-linear-to-l from-neutral-950 to-transparent pointer-events-none" />
            </div>
          )}
          <div className="grid grid-cols-1 gap-4">
            <div className="relative group">
              <textarea
                placeholder="輸入修圖指令，例如：'增加對比，強調機械細節'、'調成溫暖的日系色調'..."
                className="w-full bg-zinc-900/40 border border-zinc-800 rounded-2xl px-5 py-4 text-sm text-zinc-200 
                   focus:outline-none focus:ring-2 focus:ring-sky-500/20 focus:border-sky-500/40 
                   transition-all placeholder:text-zinc-700 min-h-30 resize-none"
                value={aiCommand}
                onChange={(e) => setAiCommand(e.target.value)}
                disabled={isAiProcessing}
              />
              {isAiProcessing && (
                <div className="absolute inset-0 bg-black/60 backdrop-blur-sm rounded-2xl flex items-center justify-center z-30">
                  <div className="flex flex-col items-center gap-3">
                    <div className="w-6 h-6 border-2 border-sky-500 border-t-transparent rounded-full animate-spin" />
                    <span className="text-xs text-sky-400 font-medium">
                      Ollama 運算中...
                    </span>
                  </div>
                </div>
              )}
            </div>

            <div className="flex flex-wrap gap-3">
              <button
                onClick={handleAiAdjust}
                disabled={isAiProcessing || !aiCommand.trim()}
                className="flex-1 min-w-50 py-3.5 bg-sky-600/20 hover:bg-sky-600/30 disabled:opacity-30 
                   text-sky-400 rounded-xl text-sm font-bold border border-sky-500/30 transition-all
                   active:scale-[0.98] cursor-pointer shadow-lg shadow-sky-950/20"
              >
                {appliedParams ? "重新生成預覽" : "生成 AI 預覽"}
              </button>
              {previewUrl && (
                <button
                  onClick={() => setShowComparison(!showComparison)}
                  className="px-8 py-3.5 bg-zinc-800/80 hover:bg-zinc-700 text-zinc-300 rounded-xl 
                     text-sm font-bold border border-zinc-700 transition-all cursor-pointer"
                >
                  {showComparison ? "隱藏對比" : "顯示對比"}
                </button>
              )}
            </div>
          </div>
        </div>
      </section>
      {/* 2. 下方：資訊與編輯區 */}
      <section className="w-full max-w-7xl mx-auto px-6 py-12">
        <div className="flex flex-col lg:flex-row gap-10 items-start">
          {/* 左側：標題與基本資訊 */}
          <div className="w-full lg:w-1/3 shrink-0">
            {isEditing ? (
              <div className="space-y-4">
                <div>
                  <label className="text-xs text-zinc-500 uppercase">
                    檔案名稱
                  </label>
                  <input
                    className="w-full bg-zinc-900/60 border border-zinc-800 rounded-xl px-4 py-2.5 text-zinc-100
                              focus:outline-none focus:ring-1 focus:ring-sky-500/40 focus:border-sky-500/40 
                              transition-all placeholder:text-zinc-700"
                    value={editedInfo.file_name}
                    onChange={(e) =>
                      setEditedInfo({
                        ...editedInfo,
                        file_name: e.target.value,
                      })
                    }
                  />
                </div>
                <div>
                  <label className="text-xs text-zinc-500 uppercase">
                    拍攝日期
                  </label>
                  <input
                    type="date"
                    className="w-full bg-zinc-900/60 border border-zinc-800 rounded-xl px-4 py-2.5 text-zinc-100
                              focus:outline-none focus:ring-1 focus:ring-sky-500/40 focus:border-sky-500/40 
                              transition-all
                              [&::-webkit-calendar-picker-indicator]:invert 
                              [&::-webkit-calendar-picker-indicator]:sepia-[1] 
                              [&::-webkit-calendar-picker-indicator]:hue-rotate-160 
                              [&::-webkit-calendar-picker-indicator]:brightness-[1]
                              [&::-webkit-calendar-picker-indicator]:cursor-pointer"
                    value={editedInfo.taken_at}
                    onChange={(e) =>
                      setEditedInfo({ ...editedInfo, taken_at: e.target.value })
                    }
                  />
                </div>

                <div className="flex gap-2 pt-2">
                  <button
                    onClick={handleUpdate}
                    className="flex-1 bg-sky-900/40 hover:bg-sky-800/60 text-sky-200 py-2 rounded-lg font-medium transition-colors border border-sky-500/30"
                  >
                    儲存
                  </button>
                  <button
                    onClick={() => setIsEditing(false)}
                    className="flex-1 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 py-2 rounded-lg font-medium transition-colors"
                  >
                    取消
                  </button>
                </div>
              </div>
            ) : (
              <>
                <h1 className="text-2xl font-bold mb-4 break-all leading-tight">
                  {photo.file_name}
                </h1>
                <div className="flex flex-col gap-2 text-zinc-500 mb-6">
                  <div className="flex items-center gap-5 text-zinc-500">
                    <div className="flex gap-2">
                      <span className="text-sm">儲存位置</span>
                      <span className="text-sm font-medium text-zinc-400">
                        {photo.file_path}
                      </span>
                    </div>
                  </div>
                </div>
                <div className="flex flex-col gap-2 text-zinc-500 mb-6">
                  <div className="flex items-center gap-5 text-zinc-500">
                    <div className="flex gap-2">
                      <span className="text-sm">拍攝於</span>
                      <span className="text-sm font-medium text-zinc-400">
                        {photo.taken_at
                          ? new Date(photo.taken_at).toLocaleDateString()
                          : "日期未知"}
                      </span>
                    </div>
                    <div className="flex gap-2">
                      <span className="text-sm">建立於</span>
                      <span className="text-sm font-medium text-zinc-400">
                        {photo.created_at
                          ? new Date(photo.created_at).toLocaleDateString()
                          : "日期未知"}
                      </span>
                    </div>
                  </div>
                </div>
                <div className="flex gap-3">
                  <button
                    onClick={() => setIsEditing(true)}
                    className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 rounded-full text-sm font-medium transition-colors border border-zinc-700"
                  >
                    編輯資訊
                  </button>
                  <button
                    onClick={handleDelete}
                    className="px-4 py-2 bg-red-900/20 hover:bg-red-900/40 text-red-400 rounded-full text-sm font-medium transition-colors border border-red-900/30"
                  >
                    刪除照片
                  </button>
                </div>
              </>
            )}
          </div>

          {/* 右側：EXIF (維持原樣) */}
          <div className="w-full lg:flex-1 bg-zinc-900/40 border border-zinc-800/50 rounded-3xl p-8 backdrop-blur-md shadow-xl">
            <h2 className="text-zinc-500 text-[10px] font-bold uppercase tracking-[0.2em] mb-8">
              Camera Info (EXIF)
            </h2>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-y-10 gap-x-6">
              <ExifItem label="相機品牌" value={photo.make} />
              <ExifItem label="機身型號" value={photo.model} />
              <ExifItem label="鏡頭型號" value={photo.lens} />
              <ExifItem
                label="光圈值"
                value={photo.f_number ? `f/${photo.f_number}` : "-"}
              />
              <ExifItem
                label="感光度"
                value={photo.iso ? `ISO ${photo.iso}` : "-"}
              />
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}

// 輔助組件：專門用來顯示單項 EXIF 資訊
function ExifItem({
  label,
  value,
}: {
  label: string;
  value: string | number | undefined | null;
}) {
  return (
    <div className="flex flex-col gap-1">
      {/* 標籤：使用較淡的灰色，縮小字體 */}
      <span className="text-zinc-500 text-xs font-medium uppercase tracking-wider">
        {label}
      </span>
      {/* 數值：亮白色，半粗體，若沒資料則顯示 "-" */}
      <span className="text-zinc-100 font-semibold truncate">
        {value || "-"}
      </span>
    </div>
  );
}
