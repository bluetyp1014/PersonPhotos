// AlbumForm.tsx 核心邏輯
"use client";

import { useState, useEffect, useRef } from "react";
import { api, getThumbUrl } from "@/lib/api";
import { useRouter } from "next/navigation";
import type { Photo, AlbumDetail } from "@/types/photo";
import { ChevronLeft, ImageIcon } from "lucide-react"; // 推薦使用 lucide-react 增加圖示質感

interface AlbumFormProps {
  album?: AlbumDetail;
  isEditMode?: boolean;
}

export const AlbumForm = ({ album, isEditMode = false }: AlbumFormProps) => {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [allPhotos, setAllPhotos] = useState<Photo[]>([]);
  const [skip, setSkip] = useState(0);
  const size = 60; // 1. 設定每次載入 30 張，畫面負擔較輕

  const [selectedPhotoIds, setSelectedPhotoIds] = useState<Set<string>>(
    new Set(),
  );
  const [coverGrid, setCoverGrid] = useState<(Photo | null)[]>(
    Array(9).fill(null),
  );

  const [hasMore, setHasMore] = useState(true);
  const [isLoading, setIsLoading] = useState(false);

  const handleSave = async () => {
    if (!title) return alert("請輸入相簿名稱");
    const photoIdsArray = Array.from(selectedPhotoIds);
    if (selectedPhotoIds.size === 0) return alert("請至少選擇一張照片加入相簿");

    try {
      // 1. 準備一個長度為 9 的陣列來代表封面
      const finalCovers = [];

      // 2. 遍歷 9 個位置
      for (let i = 0; i < 9; i++) {
        let targetHashId: string;

        const manualPhoto = coverGrid[i]; // 這裏 TypeScript 知道它是 Photo | null

        if (manualPhoto && manualPhoto.hash_id) {
          // A. 如果手動拖拽了照片，使用該照片的 HashID
          targetHashId = manualPhoto.hash_id;
        } else {
          // B. 如果是空格，從已選名單中隨機挑選一個 HashID
          const randomIndex = Math.floor(Math.random() * photoIdsArray.length);
          targetHashId = photoIdsArray[randomIndex];
        }

        finalCovers.push({
          photo_id: targetHashId, // 確保這裏一定是 string
          position: i + 1,
        });
      }

      try {
        if (isEditMode && album?.hash_id) {
          // -- 編輯模式：呼叫更新 API
          const albumRes = await api.put(`/api/v1/albums/${album.hash_id}`, {
            title,
            description, // 確保這裡有傳出去
            photo_ids: Array.from(selectedPhotoIds),
            covers: finalCovers, // 現在包含在同一個 Body 裡
          });
        } else {
          // -- 新增模式：呼叫建立 API

          // 1. 建立相簿並關聯照片 (假設後端接收 photo_ids)
          const albumRes = await api.post("/api/v1/albums", {
            title,
            description, // 確保這裡有傳出去
            photo_ids: Array.from(selectedPhotoIds),
            covers: finalCovers, // 現在包含在同一個 Body 裡
          });
        }
        router.push("/albums");
      } catch (err) {
        console.error(err);
        alert("儲存失敗，請稍後再試。");
      }
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    if (isEditMode && album) {
      setTitle(album.title);
      setDescription(album.description || "");

      // 1. 初始化選取的照片 ID Set
      const existingIds = new Set(album.photos.map((p) => p.hash_id));
      setSelectedPhotoIds(existingIds);

      // 2. 初始化九宮格封面 (根據 position 填入對應格子)
      const newGrid = Array(9).fill(null);
      album.covers.forEach((c) => {
        // 假設 AlbumCoverRead Schema 有帶入 photo 物件
        if (c.photo && c.position >= 1 && c.position <= 9) {
          newGrid[c.position - 1] = c.photo;
        }
      });
      setCoverGrid(newGrid);
    }
  }, [album, isEditMode]);

  // 載入照片的函數
  const loadPhotos = async () => {
    if (isLoading || !hasMore) return;

    setIsLoading(true);
    try {
      const res = await api.get(`/api/v1/photos?skip=${skip}&limit=${size}`);
      const newPhotos = res.data;

      if (newPhotos.length < size) {
        setHasMore(false);
      }

      setAllPhotos((prev) => [...prev, ...newPhotos]);
      setSkip((prev) => prev + size);
    } catch (error) {
      console.error("載入照片失敗", error);
    } finally {
      setIsLoading(false);
    }
  };

  //建議加上一個標記（Ref）來確保 useEffect 只在掛載時真正執行一次 API 請求
  const isInitialMount = useRef(true);

  // 初次進入頁面自動載入第一批
  useEffect(() => {
    if (isInitialMount.current) {
      loadPhotos();
      isInitialMount.current = false;
    }
  }, []);

  // 切換選取狀態
  const togglePhotoSelection = (photoId: string) => {
    const newSelection = new Set(selectedPhotoIds);

    // 1. 處理選取狀態
    if (newSelection.has(photoId)) {
      newSelection.delete(photoId);

      // 2. 如果取消選擇，檢查九宮格是否含有此照片
      // 我們使用 .map 來檢查每一格，如果 id 相符就清空
      const updatedCoverGrid = coverGrid.map((item) => {
        if (item && item.hash_id === photoId) {
          return null; // 找到該照片，從九宮格移除
        }
        return item; // 其他格子保持不變
      });

      setCoverGrid(updatedCoverGrid);
    } else {
      newSelection.add(photoId);

      // 找到這張照片的完整物件 (從 allPhotos 裡找)
      const photoObj = allPhotos.find((p) => p.hash_id === photoId);

      if (photoObj) {
        // 尋找九宮格裡第一個空格 (null)
        const firstEmptyIndex = coverGrid.findIndex((item) => item === null);

        // 如果還有空格 (index 不是 -1)，就填入
        if (firstEmptyIndex !== -1) {
          const updatedCoverGrid = [...coverGrid];
          updatedCoverGrid[firstEmptyIndex] = photoObj;
          setCoverGrid(updatedCoverGrid);
        }
      }
    }

    setSelectedPhotoIds(newSelection);
  };

  const onDragStart = (e: React.DragEvent, photo: any) => {
    e.dataTransfer.setData("photoData", JSON.stringify(photo));
    // 2. 這是關鍵！設定為 "all" 或 "copyMove"
    // 這樣無論接收端要求 "copy" 還是 "move"，瀏覽器都會允許
    e.dataTransfer.effectAllowed = "all";
  };

  const onDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "copy";
  };

  const onDrop = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    const data = e.dataTransfer.getData("photoData");
    const sourceIndexStr = e.dataTransfer.getData("sourceIndex");

    if (data) {
      const incomingPhoto = JSON.parse(data);
      const newGrid = [...coverGrid];

      // 判斷是否為內部對換 (sourceIndex 有值)
      if (sourceIndexStr !== "") {
        const sourceIndex = parseInt(sourceIndexStr);

        // 執行互換邏輯
        const temp = newGrid[index];
        newGrid[index] = newGrid[sourceIndex];
        newGrid[sourceIndex] = temp;
      } else {
        // 外部拖進來的邏輯：直接覆蓋目標位置
        newGrid[index] = incomingPhoto;

        // 原有的自動選取功能
        if (!selectedPhotoIds.has(incomingPhoto.hash_id)) {
          togglePhotoSelection(incomingPhoto.hash_id);
        }
      }
      setCoverGrid(newGrid);

      // 貼心功能：拖進封面的照片，自動視為「已選擇加入相簿」
      if (!selectedPhotoIds.has(incomingPhoto.hash_id)) {
        togglePhotoSelection(incomingPhoto.hash_id);
      }
    }
  };

  const clearCover = (index: number) => {
    const newGrid = [...coverGrid];
    newGrid[index] = null;
    setCoverGrid(newGrid);
  };

  return (
    <main className="w-full mx-auto p-8 text-white bg-neutral-950 mt-16">
      <div className="flex justify-between mb-8">
        <div className="flex items-center gap-3">
          <button
            onClick={() => router.back()}
            className="group flex items-center gap-2 text-zinc-500 hover:text-white transition-colors cursor-pointer"
          >
            <ChevronLeft className="w-5 h-5 group-hover:-translate-x-1 transition-transform" />
            <span className="text-xs font-bold tracking-widest uppercase hidden md:inline">
              Back
            </span>
          </button>
          <h1 className="text-2xl font-bold">
            {isEditMode ? "管理" : "建立"}新相簿
          </h1>
        </div>

        <button
          onClick={handleSave}
          className="pointer-events-auto relative group overflow-hidden
                flex items-center justify-center px-8 py-3 rounded-lg font-medium text-sm
                transition-all duration-200 bg-neutral-700/90 hover:bg-neutral-600/90 text-neutral-100 hover:text-white border 
                border-neutral-600/60 hover:border-neutral-500/80 shadow-lg shadow-black/20 cursor-pointer"
        >
          儲存
        </button>
      </div>

      <div className="grid grid-cols-12 gap-8 items-start h-fit overflow-visible">
        {/* 左側：封面預覽 (Sticky 定位，確保拖拽時看得到目標) */}
        <div className="col-span-4 sticky top-20">
          <div className="space-y-6 bg-zinc-900 p-1 rounded-xl border border-zinc-800 shadow-2xl">
            <section>
              <label className="block mb-1 text-zinc-400 text-sm">
                相簿名稱
              </label>
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="w-full bg-zinc-950 border border-zinc-800 p-2.5 rounded focus:border-blue-500 outline-none transition-all"
                placeholder="例如：2024 日本之旅"
              />
            </section>

            {/* 新增：相簿描述 */}
            <section>
              <label className="block mb-1 text-zinc-400 text-sm">
                相簿描述 (選填)
              </label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={3}
                className="w-full bg-zinc-950 border border-zinc-800 p-2.5 rounded focus:border-blue-500 outline-none transition-all text-white text-sm resize-none"
                placeholder="分享這本相簿的故事..."
              />
            </section>

            <section>
              <label className="block mb-1 text-zinc-400 text-sm">
                封面九宮格 (拖拽照片至此)
              </label>
              <div className="grid grid-cols-3 gap-1.5 w-full aspect-4/3 bg-black p-2 rounded-lg border border-zinc-800">
                {coverGrid.map((p, i) => (
                  <div
                    key={i}
                    // 關鍵 1: draggable 建議給字串 "true"
                    draggable={p ? "true" : "false"}
                    onDragStart={(e) => {
                      if (p) {
                        // 設定拖動資料
                        e.dataTransfer.setData("photoData", JSON.stringify(p));
                        e.dataTransfer.setData("sourceIndex", i.toString());
                        e.dataTransfer.effectAllowed = "move";
                      }
                    }}
                    onDragOver={(e) => {
                      e.preventDefault(); // 必須：解除禁止符號
                      e.dataTransfer.dropEffect = "move";
                    }}
                    onDrop={(e) => onDrop(e, i)}
                    className="relative bg-zinc-800/50 aspect-3/2 flex items-center justify-center overflow-hidden border border-dashed border-zinc-700 hover:border-blue-500 transition-all rounded-md cursor-move"
                  >
                    {p ? (
                      <>
                        <img
                          src={getThumbUrl(p.hash_id)}
                          alt=""
                          className="object-contain w-full h-full pointer-events-none select-none"
                        />
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation(); // 防止觸發父層事件
                            const newGrid = [...coverGrid];
                            newGrid[i] = null;
                            setCoverGrid(newGrid);
                          }}
                          className="absolute top-0 right-0 z-10 bg-black/70 text-white w-6 h-6 flex items-center justify-center hover:bg-red-500 transition-colors"
                        >
                          ✕
                        </button>
                      </>
                    ) : (
                      <span className="text-zinc-600 text-xs pointer-events-none">
                        {i + 1}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </section>
          </div>
          <div className="flex justify-center mt-3">
            <button
              onClick={handleSave}
              className="pointer-events-auto relative group overflow-hidden
                flex items-center justify-center px-8 py-3 rounded-lg font-medium text-sm
                transition-all duration-200 bg-neutral-700/90 hover:bg-neutral-600/90 text-neutral-100 hover:text-white border 
                border-neutral-600/60 hover:border-neutral-500/80 shadow-lg shadow-black/20 cursor-pointer"
            >
              儲存
            </button>
          </div>
        </div>

        {/* 右側：照片池 */}
        <div className="col-span-8">
          <div className="flex justify-between items-center mb-4 px-2">
            <h2 className="text-zinc-400 font-medium">照片選擇池</h2>
            <div className="text-xs bg-zinc-800 px-3 py-1 rounded-full text-zinc-300">
              已選{" "}
              <span className="text-blue-400 font-bold">
                {selectedPhotoIds.size}
              </span>{" "}
              張
            </div>
          </div>

          <div className="grid grid-cols-4 md:grid-cols-5 gap-3 p-4 rounded-xl bg-zinc-900 border border-zinc-800 shadow-inner min-h-150">
            {allPhotos.map((p) => {
              const isSelected = selectedPhotoIds.has(p.hash_id);
              // 1. 新增判斷：這張圖是否在九宮格封面內
              const isInCover = coverGrid.some(
                (item) => item?.hash_id === p.hash_id,
              );

              return (
                <div
                  key={p.hash_id}
                  draggable
                  onDragStart={(e) => onDragStart(e, p)}
                  onClick={() => togglePhotoSelection(p.hash_id)}
                  className={`group relative aspect-3/2 cursor-pointer transition-all rounded-lg overflow-hidden border-2 ${
                    isSelected
                      ? "border-blue-500 scale-[0.98]"
                      : "border-transparent hover:border-zinc-600"
                  }`}
                >
                  <img
                    src={getThumbUrl(p.hash_id)}
                    className="w-full h-full object-contain"
                  />
                  {/* 2. 顯示封面的星星標記 */}
                  {isInCover && (
                    <div className="absolute top-0 left-0 bg-amber-500 text-black px-1.5 py-0.5 rounded-br-lg flex items-center gap-1 shadow-md z-10">
                      <span className="text-[10px] font-bold uppercase">
                        Cover
                      </span>
                    </div>
                  )}
                  {isSelected && (
                    <div className="absolute top-1.5 right-1.5 bg-blue-500 rounded-full w-5 h-5 flex items-center justify-center shadow-lg">
                      <svg
                        className="w-3 h-3 text-white"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth="4"
                          d="M5 13l4 4L19 7"
                        />
                      </svg>
                    </div>
                  )}
                </div>
              );
            })}

            {/* 2. 手動載入按鈕區區 */}
            <div className="col-span-full py-8 flex flex-col items-center gap-4">
              {hasMore ? (
                <button
                  onClick={loadPhotos}
                  disabled={isLoading}
                  className="bg-zinc-800 hover:bg-zinc-700 text-zinc-300 px-8 py-2.5 rounded-full border border-zinc-700 transition-all active:scale-95 disabled:opacity-50"
                >
                  {isLoading ? "載入中..." : "載入更多照片"}
                </button>
              ) : (
                <div className="text-zinc-600 text-sm">
                  已經顯示所有照片囉 ✨
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </main>
  );
};
