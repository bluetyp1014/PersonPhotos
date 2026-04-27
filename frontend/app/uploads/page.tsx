"use client";

import React, { useState, useRef, useEffect } from "react";
import {
  Upload,
  X,
  CheckCircle,
  Loader2,
  Image as ImageIcon,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { uploadPhotoXHR } from "@/lib/api";
import { useSearchParams } from "next/navigation";

export default function BeautifulUploader() {
  const searchParams = useSearchParams();
  const pass = searchParams.get("p"); // 獲取網址中 p 的值

  const [files, setFiles] = useState<any[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  // 處理檔案選取與預覽生成
  const addFiles = (newFileList: FileList) => {
    if (pass !== process.env.NEXT_PUBLIC_CTRL) {
      // alert("您沒有權限上傳照片。"); // 選擇性加上提示
      return;
    }

    const newFiles = Array.from(newFileList).map((file) => ({
      id: Math.random().toString(36).substr(2, 9),
      file,
      name: file.name,
      size: (file.size / (1024 * 1024)).toFixed(2),
      preview: URL.createObjectURL(file), // 生成預覽網址
      progress: 0,
      status: "pending",
    }));
    setFiles((prev) => [...prev, ...newFiles]); // 新檔案放在之後
  };

  // 清除預覽記憶體防止洩漏
  useEffect(() => {
    return () => files.forEach((file) => URL.revokeObjectURL(file.preview));
  }, [files]);

  // 更新檔案狀態的輔助函式
  const updateFileStatus = (id: string, updates: any) => {
    setFiles((prev) =>
      prev.map((f) => (f.id === id ? { ...f, ...updates } : f)),
    );
  };

  // 單個檔案上傳 (質感的核心：平滑的進度反饋)
  const uploadSingleFile = async (fileItem: any) => {
    try {
      const result = await uploadPhotoXHR(fileItem.file, (percent) => {
        updateFileStatus(fileItem.id, {
          progress: percent,
          status: "uploading",
        });
      });

      // 成功：滿條 + 完成
      updateFileStatus(fileItem.id, {
        status: "completed",
        progress: 100,
      });
    } catch (error) {
      // ❌ 修正處：發生錯誤時，將進度歸零並更新狀態
      updateFileStatus(fileItem.id, {
        status: "error",
        progress: 0, // 或者保持原樣，但在 UI 上根據 status="error" 變色
      });
      console.error("上傳爆了：", error);
    }
  };

  // 佇列上傳：這是為了應付 10GB 流量最穩定的方式
  const startQueueUpload = async () => {
    if (uploading) return;
    setUploading(true);

    const pendingFiles = files.filter((f) => f.status === "pending");

    for (const fileItem of pendingFiles) {
      try {
        await uploadSingleFile(fileItem);
      } catch (error) {
        console.error("上傳失敗", fileItem.name);
      }
    }

    setUploading(false);
    setFiles([]);
  };

  // 即使在不安全的 IP 連線下也不會崩潰
  const getUUID = () => {
    if (typeof window !== "undefined" && window.crypto?.randomUUID) {
      return window.crypto.randomUUID();
    }
    return `fallback-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  };

  // 模擬從網路抓取圖片並加入上傳列表
  const simulateUpload = async () => {
    try {
      // 1. 從 Picsum 獲取隨機圖片 (加上隨機參數避免瀏覽器快取)
      const randomId = Math.floor(Math.random() * 1000);

      // 1. 隨機決定比例
      const isPortrait = Math.random() > 0.5;
      // 橫式通常 1920x1080，直式則反過來 1080x1920
      const width = isPortrait ? 1080 : 1920;
      const height = isPortrait ? 1920 : 1080;

      console.log(
        `-- 模擬抓取: ${isPortrait ? "📷 直式" : "🌅 橫式"} (${width}x${height})`,
      );

      const response = await fetch(
        `https://picsum.photos/${width}/${height}?random=${randomId}`,
      );
      const blob = await response.blob();

      // 2. 將 Blob 轉換為 File 物件
      // 檔名加上 timestamp 確保唯一性，這也能測試你後端的檔名重複處理邏輯
      const fileName = `picsum_${Date.now()}.jpg`;
      const simulatedFile = new File([blob], fileName, { type: "image/jpeg" });

      // 3. 封裝成你組件使用的 fileItem 格式
      const newFileItem = {
        id: getUUID(),
        file: simulatedFile,
        name: fileName,
        size: blob.size,
        type: "image/jpeg",
        status: "pending", // 初始狀態為待上傳
        progress: 0,
        preview: URL.createObjectURL(blob), // 產生預覽圖
      };

      // 4. 更新狀態，讓 UI 出現這張圖
      setFiles((prev) => [...prev, newFileItem]);
    } catch (error) {
      console.error("模擬抓取圖片失敗:", error);
    }
  };

  return (
    <div className="w-full p-8 bg-neutral-950 min-h-screen mt-16">
      <h1 className="text-3xl font-bold mb-8 text-white flex items-center gap-3">
        <ImageIcon className="text-neutral-300" /> 上傳照片
      </h1>

      {/* 新增的模擬測試按鈕 */}
      <div className="flex justify-center m-2">
        <button
          type="button"
          onClick={simulateUpload}
          className="pointer-events-auto relative group overflow-hidden
                flex items-center justify-center px-8 py-3 rounded-lg font-medium text-sm
                transition-all duration-200 bg-neutral-700/90 hover:bg-neutral-600/90 text-neutral-100 hover:text-white border 
                border-neutral-600/60 hover:border-neutral-500/80 shadow-lg shadow-black/20 cursor-pointer"
          // className="bg-neutral-700/90 hover:bg-neutral-600/90 text-neutral-100 hover:text-white border border-neutral-600/60 hover:border-neutral-500/80 shadow-lg shadow-black/20 cursor-pointer"
        >
          ✨ Picsum 圖檔模擬上傳
        </button>
      </div>

      {/* 檔案列表 (移至上方) */}
      <div className="mb-8">
        <AnimatePresence>
          {files.length > 0 && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4"
            >
              {files.map((item) => (
                <motion.div
                  layout
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{
                    opacity: 0,
                    scale: 0.5,
                    transition: { duration: 0.2 },
                  }}
                  key={item.id}
                  className="group relative bg-neutral-900 border border-neutral-800 rounded-xl overflow-hidden aspect-square shadow-lg"
                >
                  {/* 照片預覽圖 */}
                  <img
                    src={item.preview}
                    alt="preview"
                    className="w-full h-full object-contain"
                    // className="w-full h-full object-cover transition-transform group-hover:scale-110 duration-500"
                  />

                  {/* 下方資訊條 (實色背景) */}
                  <div className="absolute bottom-0 left-0 right-0 bg-neutral-900/90 p-2 border-t border-neutral-800">
                    <div className="flex justify-between items-center text-[10px] mb-1.5">
                      <span className="truncate w-24 text-neutral-300">
                        {item.name}
                      </span>
                      <span className="text-neutral-500">{item.size}MB</span>
                    </div>
                    {/* 進度條 */}
                    <div className="w-full bg-neutral-800 rounded-full h-1">
                      <motion.div
                        className={`h-full rounded-full ${item.status === "error" ? "bg-red-500" : "bg-blue-500"}`}
                        initial={{ width: 0 }}
                        animate={{ width: `${item.progress}%` }}
                        transition={{ duration: 0.3 }}
                      />
                    </div>
                  </div>

                  {/* 右上角操作按鈕 */}
                  <div className="absolute top-2 right-2">
                    {item.status === "completed" ? (
                      <CheckCircle className="text-green-400 bg-black/50 rounded-full" />
                    ) : item.status === "uploading" ? (
                      <Loader2 className="animate-spin text-white bg-black/20 p-1 rounded-full" />
                    ) : (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setFiles(files.filter((f) => f.id !== item.id));
                        }}
                        className="p-1.5 bg-black/50 hover:bg-red-500 text-white rounded-full transition-colors"
                      >
                        <X size={14} />
                      </button>
                    )}
                  </div>
                </motion.div>
              ))}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* 拖放區 (移至下方) */}
      <motion.div
        whileHover={{ scale: 1.01 }}
        whileTap={{ scale: 0.99 }}
        onDragOver={(e) => {
          e.preventDefault();
          setIsDragging(true);
        }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setIsDragging(false);
          addFiles(e.dataTransfer.files);
        }}
        onClick={() => fileInputRef.current?.click()}
        className={`relative border-2 border-dashed rounded-3xl p-16 transition-all text-center cursor-pointer ${
          isDragging
            ? "border-blue-500 bg-blue-500/10 shadow-[0_0_20px_rgba(59,130,246,0.3)]"
            : "border-white/20 hover:border-white/40 bg-white/5"
        }`}
      >
        <input
          type="file"
          multiple
          hidden
          ref={fileInputRef}
          onChange={(e) => e.target.files && addFiles(e.target.files)}
          accept="image/*"
        />
        <div className="bg-blue-500/20 w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-4">
          <Upload className="h-8 w-8 text-blue-500" />
        </div>
        <p className="text-xl font-semibold text-white">將照片拖放到這裡</p>
        <p className="text-gray-400 mt-2">或點擊瀏覽資料夾</p>
        <div className="mt-4 flex justify-center gap-4 text-[11px] font-medium text-gray-500">
          <span className="px-2 py-1 bg-white/5 rounded">Max 10GB</span>
          <span className="px-2 py-1 bg-white/5 rounded">High Quality</span>
        </div>
      </motion.div>

      {/* 上傳按鈕 */}
      <AnimatePresence>
        {files.some((f) => f.status === "pending") && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            className="fixed bottom-8 left-0 right-0 px-8 flex justify-center pointer-events-none"
          >
            <motion.button
              whileHover={{
                scale: 1.01,
                y: -1,
              }}
              whileTap={{ scale: 0.99 }}
              onClick={startQueueUpload}
              disabled={uploading}
              className={`
                pointer-events-auto relative group overflow-hidden
                flex items-center justify-center gap-2.5 px-8 py-3 rounded-lg font-medium text-sm
                transition-all duration-200
                ${
                  uploading
                    ? "bg-neutral-800/40 text-neutral-500 border border-neutral-800 cursor-not-allowed"
                    : "bg-neutral-700/90 hover:bg-neutral-600/90 text-neutral-100 hover:text-white border border-neutral-600/60 hover:border-neutral-500/80 shadow-lg shadow-black/20"
                }
            `}
            >
              {uploading ? (
                <>
                  <Loader2 size={16} className="animate-spin" />
                  <span>處理中...</span>
                </>
              ) : (
                <>
                  <Upload
                    size={16}
                    className="group-hover:-translate-y-0.5 transition-transform duration-200"
                  />
                  <span>
                    開始上傳{" "}
                    {files.filter((f) => f.status === "pending").length} 張照片
                  </span>
                </>
              )}

              {/* 微妙的光澤 */}
              {!uploading && (
                <div className="absolute inset-0 bg-linear-to-t from-transparent via-white/0 to-white/5 opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none rounded-lg" />
              )}
            </motion.button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
