"use client";
import { useEffect, useState, useRef } from "react";
import { api, getImageUrl, getThumbUrl } from "@/lib/api";
import type { Photo } from "@/types/photo";
import Link from "next/link";
import { Check } from "lucide-react";

export default function Home() {
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [skip, setSkip] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const [isLoading, setIsLoading] = useState(false);

  const [isManageMode, setIsManageMode] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  // 在組件頂部
  const [imgTimestamp, setImgTimestamp] = useState(Date.now());

  // 修改狀態定義
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // 用來偵測底部的隱形元素
  const loaderRef = useRef(null);

  // 修改切換函數
  const toggleSelect = (hashId: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(hashId)) next.delete(hashId);
      else next.add(hashId);
      return next;
    });
  };

  // 執行批次刪除
  const handleBatchDelete = async () => {
    if (selectedIds.size === 0) return;
    if (
      !confirm(
        `確定要刪除這 ${selectedIds.size} 張照片嗎？檔案將從硬碟永久移除。`,
      )
    )
      return;

    try {
      setIsDeleting(true);
      // 1. 等待 API 回傳結果
      const response = await api.delete("/api/v1/photos/batch-delete", {
        data: { ids: Array.from(selectedIds) },
      });
      // 2. 判斷 HTTP 狀態碼或後端自定義的 status
      // 這裡假設你的 api 封裝會在非 2xx 時丟出錯誤，
      // 或者你可以檢查 response.data.status === 'success'
      if (response.status === 200 || response.data.status === "success") {
        // -- 只有成功時才更新前端狀態
        setPhotos((prev) =>
          prev.filter((photo) => !selectedIds.has(photo.hash_id)),
        );
        setSkip((prev) => Math.max(0, prev - selectedIds.size));

        // 重置管理模式
        setIsManageMode(false);
        setSelectedIds(new Set());

        // 質感提示
        console.log(`成功移除 ${response.data.deleted_count} 張照片`);
      } else {
        // 處理後端回傳成功但內容有誤的情況
        alert("部分照片刪除失敗，請重新整理頁面檢查狀態。");
      }
    } catch (err) {
      // 3. 處理真正的網路錯誤或 400/500 報錯
      console.error("刪除請求失敗:", err);
      alert("連線伺服器失敗，請檢查網路連線。");
    } finally {
      setIsDeleting(false);
    }
  };

  const loadMorePhotos = async () => {
    if (isLoading || !hasMore) return;

    setIsLoading(true);
    try {
      const res = await api.get(`/api/v1/photos?skip=${skip}&limit=30`);
      const newPhotos = res.data;

      if (newPhotos.length < 30) {
        setHasMore(false); // 抓不到 30 張代表沒貨了
      }

      setPhotos((prev) => [...prev, ...newPhotos]);
      setSkip((prev) => prev + 30);
    } catch (error) {
      console.error("載入照片失敗", error);
    } finally {
      setIsLoading(false);
    }
  };

  // 監聽滾動到底部
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          loadMorePhotos();
        }
      },
      { threshold: 1.0 },
    );

    if (loaderRef.current) {
      observer.observe(loaderRef.current);
    }

    return () => observer.disconnect();
  }, [skip, hasMore, isLoading]);

  return (
    <main className="relative w-75% mx-auto p-4 md:p-8 bg-neutral-950 mt-16">
      <h1 className="text-3xl font-bold mb-8 text-white">所有相片</h1>
      {/* 右上角管理按鈕區塊 */}
      <div
        className="fixed top-20 right-10 flex items-center justify-end p-3 px-5 gap-5 z-50 
                bg-neutral-950/50 backdrop-blur-md rounded-2xl border border-white shadow-2xl"
      >
        <span className="text-sm font-medium text-white">
          已載入 {photos.length} 張照片
        </span>
        {isManageMode && (
          <button
            onClick={() => {
              if (selectedIds.size === photos.length) setSelectedIds(new Set());
              else setSelectedIds(new Set(photos.map((p) => p.hash_id)));
            }}
            className="text-s font-medium text-zinc-500 hover:text-zinc-200 transition-colors cursor-pointer"
          >
            {selectedIds.size === photos.length
              ? "取消全選"
              : "全選本頁已載入照片"}
          </button>
        )}
        <button
          onClick={() => {
            setIsManageMode(!isManageMode);
            setSelectedIds(new Set()); // 切換模式時清空選取
          }}
          className={`px-4 py-2 rounded-full text-sm font-medium transition-all cursor-pointer ${
            isManageMode
              ? "bg-red-500 text-white hover:bg-red-600"
              : "bg-zinc-800 text-zinc-200 hover:bg-zinc-700 border border-zinc-700"
          }`}
        >
          {isManageMode ? "取消管理" : "管理照片"}
        </button>
      </div>

      {/* 瀑布流/網格佈局 */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-2 md:gap-4">
        {photos &&
          photos.map((photo, index) => {
            // --- 核心邏輯：計算前後 ID ---
            // const prevId = index > 0 ? photos[index - 1].hash_id : null;
            // const nextId =
            //   index < photos.length - 1 ? photos[index + 1].hash_id : null;

            return (
              <div
                key={photo.hash_id}
                className={`group relative aspect-3/2 bg-zinc-900 rounded-sm overflow-hidden border transition-all ${
                  selectedIds.has(photo.hash_id)
                    ? "border-blue-500 ring-2 ring-blue-500/50"
                    : "border-zinc-800"
                }`}
                // 在管理模式下，點擊整個卡片容器就執行選取
                onClick={() => isManageMode && toggleSelect(photo.hash_id)}
              >
                {/* 1. 連結層
                // --- 修改 href，把 prev 和 next 傳過去 ---
                */}

                <Link
                  href={{
                    pathname: `/view/${photo.hash_id}`,
                    // query: {
                    //   prev: prevId,
                    //   next: nextId,
                    // },
                  }}
                  // href={`/view/${photo.hash_id}`}
                  // 質感細節：管理模式下使用 e.preventDefault() 防止跳轉
                  onClick={(e) => isManageMode && e.preventDefault()}
                  className={`flex items-center justify-center w-full h-full ${
                    isManageMode ? "cursor-default" : "cursor-pointer"
                  } overflow-hidden`}
                >
                  <img
                    src={`${getThumbUrl(photo.hash_id)}?v=${imgTimestamp}`}
                    alt={photo.file_name}
                    loading="lazy"
                    className={`w-full h-full object-contain transition-transform duration-500 ${
                      !isManageMode && "group-hover:scale-110"
                    }`}
                  />
                </Link>

                {/* 4. 頂部資訊條 (左上: 檔名, 右上: ID) */}
                <div className="absolute top-0 left-0 right-0 p-2 z-10 pointer-events-none">
                  {/* 半透明遮罩底層：由上往下的漸層黑 */}
                  <div className="absolute inset-0 bg-linear-to-b from-black/70 to-transparent h-12" />

                  {/* 文字內容層 */}
                  <div className="relative flex justify-between items-start text-[12px] text-white/90 font-mono tracking-tighter px-1">
                    {/* 左上角: 檔名 (加上 truncate 防止檔名過長爆開) */}
                    <span className="truncate max-w-[60%] drop-shadow-md">
                      {photo.file_name}
                    </span>

                    {/* 右上角: Hash ID (管理模式下若有勾選框，可能需要微調 padding-right) */}
                    <span
                      className={`opacity-60 drop-shadow-md text-[12px] ${isManageMode ? "mr-7" : ""}`}
                    >
                      #{photo.hash_id.substring(0, 6)}
                    </span>
                  </div>
                </div>

                {/* 2. 勾選框層 (移到 Link 外面，並加上 z-index) */}
                {isManageMode && (
                  <div
                    className={`absolute top-2 right-2 w-6 h-6 rounded-full border-2 z-20 flex items-center justify-center transition-colors shadow-lg ${
                      selectedIds.has(photo.hash_id)
                        ? "bg-blue-500 border-blue-500"
                        : "bg-black/40 border-white/80"
                    }`}
                  >
                    {selectedIds.has(photo.hash_id) && (
                      <Check className="text-white w-4" strokeWidth={3} />
                    )}
                  </div>
                )}

                {/* 3. 管理模式下的半透明遮罩 (讓選中感更強) */}
                {isManageMode && selectedIds.has(photo.hash_id) && (
                  <div className="absolute inset-0 bg-blue-500/10 pointer-events-none z-10" />
                )}
              </div>
            );
          })}
      </div>

      {/* 底部偵測器與 Loading 動畫 */}
      <div ref={loaderRef} className="py-10 text-center text-zinc-500">
        {isLoading
          ? "載入中..."
          : hasMore
            ? "向下滾動載入更多"
            : "已經到底囉！"}
      </div>

      {/* 底部懸浮操作列 */}
      {isManageMode && selectedIds.size > 0 && (
        <div className="fixed bottom-10 left-1/2 -translate-x-1/2 z-50 animate-in fade-in slide-in-from-bottom-5 duration-300">
          <div className="flex items-center gap-6 px-6 py-3 rounded-2xl bg-zinc-900/80 backdrop-blur-xl border border-white/10 shadow-[0_20px_50px_rgba(0,0,0,0.5)] ring-1 ring-white/5">
            {/* 選取狀態資訊 */}
            <div className="flex flex-col border-r border-white/10 pr-6">
              <span className="text-[10px] uppercase tracking-wider text-zinc-500 font-bold">
                Selected
              </span>
              <span className="text-sm font-semibold text-white tabular-nums">
                {selectedIds.size}{" "}
                <span className="text-zinc-400 font-normal ml-1">Items</span>
              </span>
            </div>

            {/* 動作按鈕區 */}
            <div className="flex items-center gap-3">
              {/* 取消選取 (質感補償) */}
              <button
                onClick={() => setSelectedIds(new Set())}
                className="px-3 py-1.5 text-xs font-medium text-zinc-400 hover:text-white transition-colors"
              >
                取消
              </button>

              {/* 刪除按鈕 - 醒目但不俗氣的紅色 */}
              <button
                onClick={handleBatchDelete}
                disabled={isDeleting}
                className="relative overflow-hidden group px-5 py-2 rounded-xl bg-red-500/10 hover:bg-red-500 text-red-500 hover:text-white border border-red-500/20 hover:border-red-500 transition-all duration-300 active:scale-95 disabled:opacity-50 disabled:pointer-events-none"
              >
                <span className="relative z-10 text-xs font-bold tracking-tight">
                  {isDeleting ? "處理中..." : "確認刪除"}
                </span>
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
