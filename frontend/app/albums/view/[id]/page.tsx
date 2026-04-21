"use client";

import { useEffect, useState, use } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { api, getThumbUrl } from "@/lib/api";
import { ChevronLeft, ImageIcon } from "lucide-react"; // 推薦使用 lucide-react 增加圖示質感
import type { AlbumDetail } from "@/types/photo";

export default function AlbumViewPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const router = useRouter();
  const [album, setAlbum] = useState<AlbumDetail | null>(null);
  const [loading, setLoading] = useState(true);

  async function getAlbumDetail(hashId: string) {
    try {
      const res = await api.get(`/api/v1/albums/${hashId}`);
      setAlbum(res.data);
    } catch (error) {
      console.error("獲取失敗:", error);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    getAlbumDetail(id);
  }, [id]);

  if (loading) {
    return (
      <div className="min-h-screen bg-neutral-950 flex flex-col items-center justify-center gap-4">
        <div className="w-12 h-12 border-4 border-white/10 border-t-white rounded-full animate-spin" />
        <span className="text-zinc-500 font-medium animate-pulse">
          正在開啟相簿...
        </span>
      </div>
    );
  }

  if (!album)
    return (
      <div className="min-h-screen bg-neutral-950 text-white p-8">
        相簿消失了
      </div>
    );

  /* 重新設計後的結構 */
  return (
    <main className="w-full mx-auto p-8 text-white bg-neutral-950 mt-16">
      {/* 1. 整合後的頂部區域 - 這裡不再是 fixed 全螢幕，而是 relative 確保它跟隨 Header */}
      {/* 修正後的 Sticky 區域 */}
      {/* sticky top-(--header-height,64px) z-40  */}
      <div className="w-full bg-neutral-950/80 backdrop-blur-md border-b border-white/5">
        <div className="max-w-10/12 mx-auto px-6 py-3 md:py-4 flex flex-col md:flex-row md:items-center justify-between gap-4">
          {/* 左側：返回 + 標題區 (縮減間距) */}
          <div className="flex items-center gap-4 min-w-0">
            <button
              onClick={() => router.back()}
              className="shrink-0 group flex items-center justify-center w-8 h-8 rounded-full bg-zinc-900 hover:bg-zinc-800 text-zinc-400 hover:text-white transition-all cursor-pointer"
            >
              <ChevronLeft className="w-5 h-5 group-hover:-translate-x-0.5 transition-transform" />
            </button>

            <div className="flex flex-col min-w-0">
              <div className="flex items-baseline gap-3">
                <h1 className="text-xl md:text-2xl font-black text-white tracking-tight truncate">
                  {album.title}
                </h1>
                <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest shrink-0">
                  {album.photos.length} Photos
                </span>
              </div>
              {/* 描述文字在 Sticky 狀態下建議縮小或隱藏，或是限制在單行 */}
              {album.description && (
                <p className="text-xs text-zinc-500 truncate max-w-md hidden md:block">
                  {album.description}
                </p>
              )}
            </div>
          </div>

          {/* 右側：按鈕組 (變得更緊湊) */}
          <div className="flex items-center gap-3 shrink-0">
            <Link href={`/albums/edit/${album.hash_id}`}>
              <button className="px-4 py-1.5 rounded-full bg-zinc-100 hover:bg-white text-zinc-950 text-xs font-bold transition-all active:scale-95 cursor-pointer">
                管理相簿
              </button>
            </Link>

            {/* 分隔線 */}
            <div className="h-4 w-px bg-zinc-800" />

            <div className="flex items-center gap-1.5 text-zinc-500">
              <ImageIcon className="w-3.5 h-3.5" />
              <span className="text-xs font-bold tabular-nums text-zinc-300">
                {album.photos.length}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* 2. 照片網格區 */}
      <div className="max-w-10/12 mx-auto px-6 py-12">
        {" "}
        {/* 建議將 max-w-350 改為 max-w-7xl 較符合常規 */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4 md:gap-6">
          {album.photos?.map((photo, index) => (
            <Link
              key={`${photo.hash_id}-${index}`}
              href={`/view/${photo.hash_id}`}
              /* 關鍵修正：確保 Link 是 relative 且 overflow-hidden */
              className="group relative aspect-3/2 overflow-hidden rounded-xl bg-zinc-900 block"
            >
              {/* 圖片疊加層：確保 inset-0 完美貼合 Link */}
              <div className="absolute inset-0 z-10 bg-black/0 group-hover:bg-black/40 transition-colors duration-500" />

              <img
                src={getThumbUrl(photo.hash_id)}
                alt={photo.file_name}
                loading="lazy"
                className="w-full h-full object-cover transition-transform duration-700 ease-out group-hover:scale-110"
              />

              {/* 懸停標籤 */}
              <div className="absolute bottom-4 left-4 z-20 opacity-0 translate-y-2 group-hover:opacity-100 group-hover:translate-y-0 transition-all duration-300">
                <span className="px-3 py-1 rounded-lg bg-black/60 backdrop-blur-md border border-white/10 text-[10px] font-bold tracking-widest text-white uppercase">
                  View Detail
                </span>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </main>
  );
}
