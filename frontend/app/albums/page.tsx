"use client";
import { useState, useEffect } from "react";
import Link from "next/link";
import { api, getImageUrl, getThumbUrl } from "@/lib/api";
import type { Album } from "@/types/photo";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { MoreVertical, Pen, Trash2, Trash2Icon } from "lucide-react";

// 定義封面的結構

export default function AlbumsPage() {
  const [albums, setAlbums] = useState<Album[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchAlbums = async () => {
      try {
        const res = await api.get("/api/v1/albums");
        setAlbums(res.data);
      } catch (error) {
        console.error("載入相簿失敗", error);
      } finally {
        setIsLoading(false);
      }
    };
    fetchAlbums();
  }, []);

  const handleCreateAlbum = () => {
    console.log("觸發新增相簿彈窗");
    // 這裡之後可以串接你的 POST /api/v1/albums/
  };

  return (
    <main className="w-full mx-auto p-4 md:p-8 flex flex-col bg-neutral-950 min-h-screen mt-16">
      {/* 標題與按鈕 */}
      <div className="flex justify-between items-center mb-8">
        <h1 className="text-3xl font-bold text-white">我的相簿</h1>
        <Link href={`/albums/create`}>
          <button
            className="pointer-events-auto relative group overflow-hidden
                flex items-center justify-center px-8 py-3 rounded-lg font-medium text-sm
                transition-all duration-200 bg-neutral-700/90 hover:bg-neutral-600/90 text-neutral-100 hover:text-white border 
                border-neutral-600/60 hover:border-neutral-500/80 shadow-lg shadow-black/20 cursor-pointer"
          >
            ＋ 新增相簿
          </button>
        </Link>
        {/* <button
          onClick={handleCreateAlbum}
          className="bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded-md text-sm font-medium transition-colors"
        >
          ＋ 新增相簿
        </button> */}
      </div>

      {isLoading ? (
        <div className="flex-1 flex items-center justify-center">
          <p className="text-zinc-500 animate-pulse">載入中...</p>
        </div>
      ) : albums.length === 0 ? (
        <div className="flex-1 flex items-center justify-center">
          <p className="text-zinc-500 text-xl font-light tracking-widest italic">
            目前無相簿
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 xl:grid-cols-6 gap-4">
          {albums?.map(
            (
              album: Album, // 加上問號防止 albums 為空時報錯
            ) => (
              <Link
                key={album.hash_id}
                href={`/albums/view/${album.hash_id}`}
                className={`flex items-center justify-center w-full h-full cursor-pointer overflow-hidden`}
              >
                <div
                  className="group cursor-pointer relative bg-zinc-900 rounded-lg transition-all duration-300
                 /* 1. 核心立體感：深層陰影 + 微位移 */
                 hover:-translate-y-1 hover:shadow-[0_20px_25px_-5px_rgba(0,0,0,0.5),0_10px_10px_-5px_rgba(0,0,0,0.4)]
                 shadow-[0_4px_6px_-1px_rgba(0,0,0,0.3)]
                 /* 2. 邊緣光：讓邊框看起來有厚度 */
                 border border-zinc-800/50 border-t-zinc-700/50"
                >
                  <div className="flex flex-col bg-zinc-900/40 rounded-xl overflow-hidden border border-white/5 group shadow-lg w-full">
                    {/* 1. 上方資訊區：解決標題歪掉與選單衝突問題 */}
                    <div className="p-3 border-b border-white/5 bg-zinc-900/20">
                      <div className="grid grid-cols-[1fr_auto] items-center w-full gap-2">
                        {/* 標題與張數：min-w-0 確保 truncate 正常工作 */}
                        <div className="min-w-0">
                          <h3
                            className="text-zinc-100 text-sm font-bold truncate text-left w-full block"
                            title={album.title}
                          >
                            {album.title}
                          </h3>
                        </div>

                        {/* 右側選單按鈕 */}
                        <div className="shrink-0">
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-8 w-8 p-0 text-zinc-500 hover:text-white hover:bg-white/10 rounded-full transition-colors cursor-pointer"
                              >
                                <MoreVertical className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>

                            <DropdownMenuContent
                              align="end"
                              className="w-40 bg-zinc-900 border-zinc-800 text-zinc-300 shadow-2xl z-50"
                            >
                              <DropdownMenuItem
                                asChild
                                className="text-zinc-300 focus:bg-zinc-800 focus:text-white cursor-pointer px-3 py-2"
                              >
                                <Link
                                  href={`/albums/edit/${album.hash_id}`}
                                  className="flex items-center w-full"
                                >
                                  <Pen className="h-4 w-4 mr-2" />
                                  <span>編輯相簿</span>
                                </Link>
                              </DropdownMenuItem>

                              <DropdownMenuItem className="text-red-400 focus:text-red-50 focus:bg-red-600 cursor-pointer px-3 py-2">
                                <Trash2Icon className="h-4 w-4 mr-2" />
                                <span>刪除相簿</span>
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                      </div>
                    </div>

                    {/* 2. 下方九宮格：使用 object-cover 填滿格子 */}
                    <div className="aspect-square grid grid-cols-3 gap-0.5 bg-zinc-950 p-0.5">
                      {[...Array(9)].map((_, index) => {
                        // 尋找對應位置的封面圖
                        const cover = album.covers?.find(
                          (c) => c.position === index + 1,
                        );

                        return (
                          <div
                            key={index}
                            className="bg-zinc-800/50 overflow-hidden relative aspect-square"
                          >
                            {cover?.photo_id ? (
                              <img
                                src={getThumbUrl(cover.photo_id)}
                                alt=""
                                className="w-full h-full object-cover transition-all duration-700 group-hover:scale-110 group-hover:brightness-110"
                              />
                            ) : (
                              <div className="w-full h-full bg-zinc-800/20" />
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              </Link>
            ),
          )}
        </div>
      )}
    </main>
  );
}
