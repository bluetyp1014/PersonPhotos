"use client";

import { useEffect, useState, use } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { api, getThumbUrl } from "@/lib/api";
import { ChevronLeft, ImageIcon } from "lucide-react"; // 推薦使用 lucide-react 增加圖示質感
import type { AlbumDetail } from "@/types/photo";
import { AlbumForm } from "@/components/albums/AlbumForm";

export default function AlbumEditPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
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

  if (!album) return <div></div>;

  return <AlbumForm album={album} isEditMode={true} />;
}
