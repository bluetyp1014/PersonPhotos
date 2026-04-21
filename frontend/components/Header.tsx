// components/Header.tsx
"use client"; // <--- 加上這一行就解決了

import Link from "next/link";
import { usePathname } from "next/navigation";

export default function Header() {
  const pathname = usePathname();

  const navItems = [
    { name: "圖片牆", href: "/" },
    { name: "圖片上傳", href: "/uploads" },
    { name: "相簿", href: "/albums" },
    { name: "膠卷", href: "/photofilm" },
  ];

  return (
    // components/Header.tsx
    <header className="fixed top-0 z-50 w-full bg-black backdrop-blur-xl border-b border-zinc-800">
      <div className="w-full mx-auto px-4 md:px-8 h-16 flex items-center justify-between">
        {/* Logo 或 站點名稱 (建議加上去，增加辨識度) */}
        <div className="flex items-center gap-8">
          <Link
            href="/"
            className="text-xl font-bold tracking-tighter text-white hover:opacity-80 transition-opacity"
          >
            Photos
          </Link>

          <nav className="flex space-x-6">
            {navItems.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={`relative text-sm font-medium transition-all duration-300 py-2 group ${
                  pathname === item.href
                    ? "text-white"
                    : "text-zinc-500 hover:text-zinc-300"
                }`}
              >
                {item.name}
                {/* 增加一個底部的亮條動畫，讓選中感更明顯 */}
                {pathname === item.href && (
                  <span className="absolute bottom-0 left-0 w-full h-0.5 bg-blue-500 rounded-full" />
                )}
                {/* 非選中狀態的 hover 線條 */}
                {pathname !== item.href && (
                  <span className="absolute bottom-0 left-0 w-0 h-0.5 bg-zinc-600 transition-all duration-300 group-hover:w-full rounded-full" />
                )}
              </Link>
            ))}
          </nav>
        </div>

        {/* 右側操作區 */}
        <div id="header-action" className="flex items-center gap-4">
          {/* 這裡可以放頭像或主題切換 */}
        </div>
      </div>
    </header>
  );
}
