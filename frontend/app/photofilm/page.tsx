"use client";
import { useEffect, useState, useMemo, useRef } from "react";
import { useRouter } from "next/navigation";
import { api, getThumbUrl, getImageUrl } from "@/lib/api";
import type { Photo, TimelineIndexItem, TimelineMenu } from "@/types/photo";
import Link from "next/link";

export default function TimeLinePage() {
  const router = useRouter();
  const [timelineIndex, setTimelineIndex] = useState<TimelineIndexItem[]>([]);
  const [timelineMenu, setTimelineMenu] = useState<TimelineMenu>({});
  const [detailsCache, setDetailsCache] = useState<Record<string, Photo>>({});

  const [isManageMode, setIsManageMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [expandedYears, setExpandedYears] = useState<Set<number>>(new Set());
  const [currentActive, setCurrentActive] = useState<{
    year: number;
    month?: number;
  }>({ year: 0 });
  const [isDeleting, setIsDeleting] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  // 1. 在 Page 組件上方新增狀態
  const [isObserverReady, setIsObserverReady] = useState(false);

  const [selectedPhoto, setSelectedPhoto] = useState<Photo | null>(null);

  // 在組件頂部
  const [imgTimestamp, setImgTimestamp] = useState(Date.now());

  // 🔧 定義 section 的型別
  type TimelineSection = {
    year: number;
    month: number;
    photos: TimelineIndexItem[];
  };

  const timelineSectionsRef = useRef<TimelineSection[]>([]);

  useEffect(() => {
    const loadTimeline = async () => {
      setIsLoading(true);
      try {
        const res = await api.get(`/api/v1/photos/timeline-index`);
        const data = res.data;

        setTimelineIndex(data);
        const menu = generateTimelineMenu(data);
        setTimelineMenu(menu);

        if (Object.keys(menu).length > 0) {
          const latestYear = Math.max(...Object.keys(menu).map(Number));
          setExpandedYears(new Set([latestYear]));
        }
      } catch (error) {
        console.error("載入時間軸失敗", error);
      } finally {
        setIsLoading(false);
      }
    };

    loadTimeline();
  }, []);

  const generateTimelineMenu = (data: TimelineIndexItem[]): TimelineMenu => {
    return data.reduce((acc: TimelineMenu, photo) => {
      const dateStr = photo.taken_at || photo.created_at;
      if (!dateStr) return acc;

      const date = new Date(dateStr);
      const year = date.getFullYear();
      const month = date.getMonth() + 1;

      if (!acc[year]) acc[year] = {};
      if (!acc[year][month]) acc[year][month] = 0;
      acc[year][month]++;

      return acc;
    }, {});
  };

  const timelineSections = useMemo(() => {
    if (!timelineIndex.length) return [];

    // 🔧 修復型別定義
    const grouped = timelineIndex.reduce<Record<string, TimelineSection>>(
      (acc, photo) => {
        const dateStr = photo.taken_at || photo.created_at;
        const date = new Date(dateStr || "");
        const year = date.getFullYear();
        const month = date.getMonth() + 1;
        const key = `${year}-${month}`;

        if (!acc[key]) {
          acc[key] = { year, month, photos: [] };
        }
        acc[key].photos.push(photo);
        return acc;
      },
      {},
    );

    const sections = Object.values(grouped).sort((a, b) => {
      if (b.year !== a.year) return b.year - a.year;
      return b.month - a.month;
    });

    timelineSectionsRef.current = sections;

    return sections;
  }, [timelineIndex]);

  const fetchMonthDetails = async (
    year: number,
    month: number,
    ids: string[],
  ) => {
    const uncachedIds = ids.filter((id) => !detailsCache[id]);
    if (uncachedIds.length === 0) return;

    console.log(`📦 載入 ${year}/${month} 的 ${uncachedIds.length} 張照片`);

    try {
      const res = await api.post("/api/v1/photos/batch-details", {
        photo_ids: uncachedIds,
      });
      const fetchedPhotos: Photo[] = res.data;

      setDetailsCache((prev) => {
        const next = { ...prev };
        fetchedPhotos.forEach((p) => {
          next[p.hash_id] = p;
        });
        return next;
      });

      console.log(`-- 成功載入 ${fetchedPhotos.length} 張照片`);
    } catch (err) {
      console.error(`❌ 載入 ${year}/${month} 失敗:`, err);
    }
  };

  // 1. 專門負責監聽與載入的 useEffect
  useEffect(() => {
    if (timelineSections.length === 0) return;

    const observer = new IntersectionObserver(
      (entries) => {
        // --- 1. 廣域預載邏輯 (只要進入 100% 區域就 Fetch) ---
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            const y = Number(entry.target.getAttribute("data-year"));
            const m = Number(entry.target.getAttribute("data-month"));
            const section = timelineSectionsRef.current.find(
              (s) => s.year === y && s.month === m,
            );
            if (section) {
              fetchMonthDetails(
                y,
                m,
                section.photos.map((p) => p.hash_id),
              );
            }
          }
        });

        // --- 2. 精確高亮邏輯 (只計算真正出現在視窗內的區塊) ---
        // 我們手動檢查所有被 observe 的 section，找出最靠近頂部的一個
        const allSections = document.querySelectorAll("section[data-timeline]");
        let bestMatch = { el: null as Element | null, dist: Infinity };

        allSections.forEach((el) => {
          const rect = el.getBoundingClientRect();
          // 判斷標準：標題距離頂部約 120px (扣除 Header) 的絕對距離
          // const distance = Math.abs(rect.top - 120);
          const distance = Math.abs(rect.top - 140); // 與 scrollToSection 的 offset 保持一致

          // 只有當區塊確實有部分在視窗內時才列入考慮
          if (rect.top < window.innerHeight && rect.bottom > 100) {
            if (distance < bestMatch.dist) {
              bestMatch = { el, dist: distance };
            }
          }
        });

        if (bestMatch.el) {
          const year = Number(bestMatch.el.getAttribute("data-year"));
          const month = Number(bestMatch.el.getAttribute("data-month"));

          // 更新側邊欄與展開狀態
          setCurrentActive((prev) =>
            prev.year === year && prev.month === month ? prev : { year, month },
          );
          setExpandedYears((prev) => {
            if (prev.has(year)) return prev;
            return new Set(prev).add(year);
          });
        }
      },
      {
        rootMargin: "0px 0px 100% 0px", // 為了預載，維持廣域
        threshold: [0, 0.1, 0.25, 0.5, 0.75, 1.0],
      },
    );

    const sections = document.querySelectorAll("section[data-timeline]");
    sections.forEach((el) => {
      observer.observe(el);

      // 初始檢查：確保一進來就載入 2025 年 1 月 (即便沒滾動)
      const rect = el.getBoundingClientRect();
      if (rect.top < window.innerHeight * 2) {
        const y = Number(el.getAttribute("data-year"));
        const m = Number(el.getAttribute("data-month"));
        const section = timelineSectionsRef.current.find(
          (s) => s.year === y && s.month === m,
        );
        if (section)
          fetchMonthDetails(
            y,
            m,
            section.photos.map((p) => p.hash_id),
          );
      }
    });

    setIsObserverReady(true);
    return () => {
      observer.disconnect();
      setIsObserverReady(false);
    };
  }, [timelineSections]);

  const handleBatchDelete = async () => {
    if (selectedIds.size === 0) return;
    if (!confirm(`確定要刪除這 ${selectedIds.size} 張照片嗎？`)) return;

    try {
      setIsDeleting(true);
      const response = await api.delete("/api/v1/photos/batch-delete", {
        data: { ids: Array.from(selectedIds) },
      });

      if (response.status === 200) {
        setTimelineIndex((prev) =>
          prev.filter((p) => !selectedIds.has(p.hash_id)),
        );
        setDetailsCache((prev) => {
          const next = { ...prev };
          selectedIds.forEach((id) => delete next[id]);
          return next;
        });

        setIsManageMode(false);
        setSelectedIds(new Set());
      }
    } catch (err) {
      console.error("刪除失敗:", err);
      alert("刪除失敗，請重試");
    } finally {
      setIsDeleting(false);
    }
  };

  const toggleSelect = (hashId: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(hashId)) next.delete(hashId);
      else next.add(hashId);
      return next;
    });
  };

  const toggleYear = (year: number) => {
    setExpandedYears(new Set<number>().add(year));
  };

  const scrollToSection = (id: string) => {
    const element = document.getElementById(id);
    if (element) {
      // 💡 調整重點：將原本的 80 加大。
      // pt-26 約為 104px，加上頂部工具欄與間距，建議設為 140 ~ 160
      const offset = 140;

      const elementPosition = element.getBoundingClientRect().top;
      const offsetPosition = elementPosition + window.pageYOffset - offset;

      window.scrollTo({
        top: offsetPosition,
        behavior: "smooth",
      });
    }
  };

  if (isLoading && timelineIndex.length === 0 && !isObserverReady) {
    return (
      <div className="flex h-screen items-center justify-center bg-neutral-950">
        <div className="flex flex-col items-center gap-4">
          {/* 加入一個簡單的動畫感 */}
          <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
          <div className="text-zinc-400 text-sm tracking-widest">載入中...</div>
        </div>
      </div>
    );
  }

  return (
    // 這裡移除 min-h-screen 上的特定類名，專注於內容佈局
    <div className="w-full bg-neutral-950">
      {/* 1. 頁面頂部工具欄 (不再是 fixed，而是隨著頁面滾動或保持在 Header 下方) */}
      <div className="fixed top-16 left-0 w-full z-100 bg-neutral-900 border-b border-white/5 mb-8">
        <div className="max-w-full mx-auto px-4 md:px-8 h-16 flex items-center justify-between">
          <h1 className="text-2xl font-bold text-white">相片膠卷</h1>
          <div className="flex items-center gap-4 bg-zinc-900/50 px-4 py-2 rounded-xl border border-white/10">
            <span className="text-xs text-zinc-400">
              共 {timelineIndex.length} 張
            </span>
            <button
              onClick={() => {
                setIsManageMode(!isManageMode);
                setSelectedIds(new Set());
              }}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                isManageMode
                  ? "bg-red-500 text-white"
                  : "bg-zinc-800 text-zinc-200 hover:bg-zinc-700"
              }`}
            >
              {isManageMode ? "取消管理" : "管理照片"}
            </button>
          </div>
        </div>
      </div>

      {/* 2. 主內容區域 */}
      <div className="flex mx-auto pt-26">
        {/* 這裡的 top-32 是因為全域 Header(16) + 膠卷工具欄(16) */}
        {/* 側邊欄 Aside */}
        <aside className="hidden md:block w-64 fixed left-0 top-32 bottom-0 border-r border-white/5 bg-neutral-950">
          <div className="h-full overflow-y-auto scrollbar-hide">
            <div className="p-6 pb-2">
              <h2 className="text-lg font-semibold text-zinc-400">時間軸</h2>
            </div>

            <nav className="px-6 pb-6">
              {Object.entries(timelineMenu)
                .sort(([a], [b]) => Number(b) - Number(a))
                .map(([yearStr, months]) => {
                  const year = Number(yearStr);
                  const isExpanded = expandedYears.has(year);
                  const isYearActive = currentActive.year === year;

                  return (
                    <div key={year} className="mb-3">
                      <button
                        onClick={() => {
                          toggleYear(year);
                          scrollToSection(`year-${year}`);
                        }}
                        className={`w-full text-left py-2 px-2 rounded-lg font-bold transition-all ${
                          isYearActive
                            ? "text-blue-400 bg-blue-500/10"
                            : "text-zinc-400 hover:text-zinc-200 hover:bg-white/5"
                        }`}
                      >
                        {year}
                      </button>

                      <div
                        className={`overflow-hidden transition-all duration-300 ${
                          isExpanded
                            ? "max-h-96 opacity-100 mt-1"
                            : "max-h-0 opacity-0"
                        }`}
                      >
                        <ul className="ml-3 border-l border-zinc-800">
                          {Object.entries(months)
                            .sort(([a], [b]) => Number(b) - Number(a))
                            .map(([monthStr, count]) => {
                              const month = Number(monthStr);
                              const isMonthActive =
                                isYearActive && currentActive.month === month;
                              return (
                                <li key={month}>
                                  <button
                                    onClick={() =>
                                      scrollToSection(`month-${year}-${month}`)
                                    }
                                    className={`pl-4 pr-2 py-1.5 text-sm transition-all w-full text-left flex justify-between items-center rounded-r ${
                                      isMonthActive
                                        ? "text-blue-400 font-medium bg-blue-500/5"
                                        : "text-zinc-500 hover:text-zinc-300 hover:bg-white/5"
                                    }`}
                                  >
                                    <span>{month} 月</span>
                                    <span className="text-[10px] text-zinc-600 tabular-nums">
                                      {String(count)}
                                    </span>
                                  </button>
                                </li>
                              );
                            })}
                        </ul>
                      </div>
                    </div>
                  );
                })}
            </nav>
          </div>
        </aside>

        <main className="flex-1 md:ml-64 p-4 md:p-8 pb-24">
          <div className="space-y-16">
            {timelineSections.map((section) => (
              <section
                key={`${section.year}-${section.month}`}
                id={`month-${section.year}-${section.month}`}
                data-timeline="true"
                data-year={section.year}
                data-month={section.month}
              >
                <div id={`year-${section.year}`} className="absolute -mt-20" />

                <h2 className="text-xl font-bold text-zinc-300 mb-6 flex items-center gap-3">
                  <span className="bg-linear-to-r from-blue-500 to-blue-500 bg-clip-text text-transparent">
                    {section.year} 年 {section.month} 月
                  </span>
                  <span className="text-xs text-zinc-600 font-normal">
                    {section.photos.length} 張
                  </span>
                </h2>

                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 2xl:grid-cols-8 gap-2">
                  {/* 🔧 修復型別 */}
                  {section.photos.map((pIndex: TimelineIndexItem) => {
                    const photoDetail = detailsCache[pIndex.hash_id];
                    const isSelected = selectedIds.has(pIndex.hash_id);

                    return (
                      <div
                        key={pIndex.hash_id}
                        className={`group relative aspect-square bg-zinc-900 rounded-lg overflow-hidden transition-all ${
                          isSelected
                            ? "ring-2 ring-blue-500 ring-offset-2 ring-offset-neutral-950"
                            : "hover:ring-1 hover:ring-zinc-700"
                        }`}
                        onClick={() =>
                          isManageMode && toggleSelect(pIndex.hash_id)
                        }
                      >
                        {photoDetail ? (
                          <>
                            {/* <Link
                              href={`/view/${pIndex.hash_id}`}
                              onClick={(e) =>
                                isManageMode && e.preventDefault()
                              }
                              className="block w-full h-full"
                            >
                              <img
                                src={getThumbUrl(pIndex.hash_id)}
                                alt={photoDetail.file_name || ""}
                                className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-110"
                                loading="lazy"
                              />
                            </Link> */}

                            <div
                              onClick={() =>
                                !isManageMode && setSelectedPhoto(photoDetail)
                              }
                              className="block w-full h-full cursor-pointer overflow-hidden"
                            >
                              <img
                                src={`${getThumbUrl(pIndex.hash_id)}?v=${imgTimestamp}`}
                                // src={getThumbUrl(pIndex.hash_id)}
                                alt={photoDetail.file_name || ""}
                                className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-110"
                                loading="lazy"
                              />
                            </div>

                            {isManageMode && (
                              <div
                                className={`absolute top-2 right-2 w-6 h-6 rounded-full flex items-center justify-center transition-all shadow-lg ${
                                  isSelected
                                    ? "bg-blue-500 scale-110"
                                    : "bg-black/40 border-2 border-white/50 backdrop-blur-sm"
                                }`}
                              >
                                {isSelected && (
                                  <svg
                                    className="w-4 h-4 text-white"
                                    fill="none"
                                    viewBox="0 0 24 24"
                                    stroke="currentColor"
                                  >
                                    <path
                                      strokeLinecap="round"
                                      strokeLinejoin="round"
                                      strokeWidth={3}
                                      d="M5 13l4 4L19 7"
                                    />
                                  </svg>
                                )}
                              </div>
                            )}
                          </>
                        ) : (
                          <div className="w-full h-full animate-pulse bg-zinc-800/50">
                            <div className="flex items-center justify-center h-full text-[10px] text-zinc-700">
                              載入中
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </section>
            ))}
          </div>

          {timelineIndex.length === 0 && !isLoading && (
            <div className="text-center py-32 text-zinc-500">
              <div className="text-6xl mb-4">📷</div>
              <p className="text-lg">尚無照片</p>
            </div>
          )}
        </main>
      </div>

      {isManageMode && selectedIds.size > 0 && (
        <div className="fixed bottom-8 left-1/2 -translate-x-1/2 z-50 animate-in fade-in slide-in-from-bottom-4 duration-200">
          <div className="flex items-center gap-6 px-8 py-4 rounded-2xl bg-zinc-900/95 backdrop-blur-xl border border-white/10 shadow-[0_20px_60px_rgba(0,0,0,0.6)]">
            <div className="flex flex-col border-r border-white/10 pr-6">
              <span className="text-[10px] uppercase tracking-wider text-zinc-500 font-bold">
                已選取
              </span>
              <span className="text-lg font-bold text-white tabular-nums">
                {selectedIds.size}
              </span>
            </div>

            <div className="flex items-center gap-3">
              <button
                onClick={() => setSelectedIds(new Set())}
                className="px-4 py-2 text-sm font-medium text-zinc-400 hover:text-white transition-colors"
              >
                取消
              </button>

              <button
                onClick={handleBatchDelete}
                disabled={isDeleting}
                className="px-6 py-2.5 rounded-xl bg-linear-to-r from-red-500 to-red-600 hover:from-red-600 hover:to-red-700 text-white font-bold text-sm transition-all duration-200 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-red-500/20"
              >
                {isDeleting ? "刪除中..." : "確認刪除"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 彈出視窗實作 */}
      {selectedPhoto && (
        <div
          className="fixed inset-0 z-100 flex items-center justify-center bg-black/90 p-4 animate-in fade-in duration-300"
          onClick={() => setSelectedPhoto(null)} // 點擊遮罩關閉
        >
          <div
            className="relative max-w-[70vw] max-h-[70vh] flex items-center justify-center"
            onClick={(e) => e.stopPropagation()} // 防止點擊圖片本身也關閉
          >
            {/* 🚀 關鍵修正：包一層 div 並設為 w-fit，讓它跟著圖片寬度走 */}
            <div className="relative w-fit h-fit flex items-center justify-center">
              {/* 微黑漸層遮罩 */}
              <div className="absolute top-0 left-0 w-full h-24 bg-linear-to-b from-black/70 to-transparent pointer-events-none"></div>

              {/* 右上角按鈕區 */}
              <div className="absolute top-1 right-0 flex items-center gap-4 w-full justify-end">
                <button
                  className="flex items-center gap-2 px-3 py-1.5 bg-white/10 hover:bg-white/20 text-white rounded-md transition-all text-sm backdrop-blur-md cursor-pointer"
                  onClick={() => router.push(`/view/${selectedPhoto.hash_id}`)}
                >
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    width="16"
                    height="16"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path>
                    <polyline points="15 3 21 3 21 9"></polyline>
                    <line x1="10" y1="14" x2="21" y2="3"></line>
                  </svg>
                  進入詳情
                </button>

                <button
                  className="text-white text-3xl hover:text-gray-400 p-1 cursor-pointer"
                  onClick={() => setSelectedPhoto(null)}
                >
                  &times;
                </button>
              </div>

              <img
                src={`${getImageUrl(selectedPhoto.hash_id)}?v=${imgTimestamp}`}
                // src={getImageUrl(selectedPhoto.hash_id)} // 這裡假設你有取得原圖的 function
                alt={selectedPhoto.file_name}
                className="max-w-full max-h-[85vh] object-contain rounded-lg shadow-2xl"
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
