// components/editor/InpaintCanvas.tsx
import React, { useRef, useCallback, useState } from "react";

interface InpaintCanvasProps {
  imageElement: HTMLImageElement | null; // -- 改接節點
  brushSize: number;
  onExportMask: (blob: Blob) => void;
  isActive: boolean;
  onDrawStart?: () => void; // 👈 補上這個型別定義
}

export default function InpaintCanvas({
  imageElement,
  brushSize,
  onExportMask,
  isActive,
  onDrawStart, // 👈 解構出來
}: InpaintCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [imgSize, setImgSize] = useState({ w: 0, h: 0 });
  const [displaySize, setDisplaySize] = useState({ width: 0, height: 0 }); // 畫面上顯示的大小
  // 1. 在組件內新增一個 ref 來記錄是否已經初始化過
  const isInitialized = useRef(false);

  // -- 關鍵：使用 Callback Ref 代替 useEffect 監聽
  // 2. 使用 useCallback 包裹 setCanvasRef，避免每次渲染都重新定義
  const setCanvasRef = useCallback(
    (node: HTMLCanvasElement | null) => {
      if (node) {
        canvasRef.current = node;
        console.log("-- Canvas 節點已掛載，啟動初始化流程...");
        initCanvas(node);
      } else {
        canvasRef.current = null;
        console.log("👋 Canvas 節點已卸載");
      }
    },
    [imageElement],
  );

  const initCanvas = (canvas: HTMLCanvasElement) => {
    if (!imageElement || !imageElement.complete) {
      console.error("❌ 圖片尚未加載完成");
      return;
    }

    const ctx = canvas.getContext("2d");

    // 1. 直接拿圖片的原始尺寸
    const naturalWidth = imageElement.naturalWidth;
    const naturalHeight = imageElement.naturalHeight;

    canvas.width = naturalWidth;
    canvas.height = naturalHeight;

    const tryDisplay = () => {
      const parent = canvas.parentElement;
      if (!parent || parent.offsetWidth === 0) {
        setTimeout(tryDisplay, 50);
        return;
      }

      // 2. 計算比例
      const scale = Math.min(
        parent.offsetWidth / naturalWidth,
        parent.offsetHeight / naturalHeight,
      );
      setDisplaySize({
        width: naturalWidth * scale,
        height: naturalHeight * scale,
      });

      // 3. 繪製到畫布（這步非常重要，確保畫布有底，或是全清空）
      if (ctx) {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        // 如果你想在畫布裡也畫出一張底圖，可以 ctx.drawImage(imageElement, 0, 0);
        // 但通常去雜物只需要一張透明的 Mask 層

        // -- 加上極淡的藍色，確認畫布有精準疊在圖片上
        // ctx.fillStyle = "rgba(0, 255, 0, 0.5)";
        // ctx.fillRect(0, 0, canvas.width, canvas.height);

        // console.log("-- 畫布已現身");

        console.log("-- 畫布已根據現有 Image 節點對齊成功");
      }
    };

    tryDisplay();
  };

  // 初始化畫布大小與圖片對齊
  // 修改 useEffect 內的邏輯，確保穩定性
  /* useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) {
      console.log("❌ Canvas Ref 尚未就緒");
      return;
    }

    const updateCanvas = () => {
      const img = new Image();
      img.src = imageUrl;

      const processImage = () => {
        console.log(
          `🖼️ 圖片載入成功: ${img.naturalWidth}x${img.naturalHeight}`,
        );

        canvas.width = img.naturalWidth;
        canvas.height = img.naturalHeight;

        // 向上尋找有高度的容器
        let parent = canvas.parentElement;
        while (parent && parent.offsetHeight === 0) {
          parent = parent.parentElement;
        }

        if (parent) {
          const pW = parent.offsetWidth;
          const pH = parent.offsetHeight;
          console.log(`📐 找到父容器: ${pW}x${pH}`);

          const scale = Math.min(pW / img.naturalWidth, pH / img.naturalHeight);
          setDisplaySize({
            width: img.naturalWidth * scale,
            height: img.naturalHeight * scale,
          });
        } else {
          console.log("❌ 找不到有效的父容器寬高");
        }

        const ctx = canvas.getContext("2d");
        if (ctx) {
          ctx.fillStyle = "rgba(0, 255, 0, 0.5)"; // 綠色測試
          ctx.fillRect(0, 0, canvas.width, canvas.height);
        }
      };

      // 如果圖片已經載入完成（快取），直接執行
      if (img.complete) {
        processImage();
      } else {
        img.onload = processImage;
      }
    };

    updateCanvas();
  }, [imageUrl]); */

  const startDrawing = (e: React.MouseEvent | React.TouchEvent) => {
    // -- 封鎖冒泡：防止觸發任何父層級的 onClick
    if (e.nativeEvent instanceof Event) {
      e.stopPropagation();
    } else if ("stopPropagation" in e) {
      e.stopPropagation();
    }

    if (!isActive) return;
    setIsDrawing(true);
    // 👈 修正：直接呼叫傳進來的 props
    if (onDrawStart) onDrawStart();
    // draw(e);

    // --- 關鍵修正：取得座標並將畫筆移動到起點，不產生連線 ---
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (canvas && ctx) {
      // 清除整個畫布區域，確保只有當前這一筆會存在
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      // 重設路徑，避免之前的 path 殘留導致連線
      ctx.beginPath();

      // ... 接下來是你原本的座標計算邏輯 ...
      const rect = canvas.getBoundingClientRect();
      const scaleX = canvas.width / rect.width;
      const scaleY = canvas.height / rect.height;
      const x =
        ((e.nativeEvent instanceof MouseEvent
          ? e.nativeEvent.clientX
          : (e as React.TouchEvent).touches[0].clientX) -
          rect.left) *
        scaleX;
      const y =
        ((e.nativeEvent instanceof MouseEvent
          ? e.nativeEvent.clientY
          : (e as React.TouchEvent).touches[0].clientY) -
          rect.top) *
        scaleY;

      // ctx.beginPath(); // 開始新路徑
      ctx.moveTo(x, y); // 移到新起點
    }
  };

  // 用 Ref 確保點不會因為 Re-render 消失
  const pointsRef = useRef<{ x: number; y: number }[]>([]);

  // --- startDrawing：開始畫新的一筆 ---
  const stopDrawing = () => {
    setIsDrawing(false);
    const canvas = canvasRef.current;
    if (!canvas) return;

    // 🔥 關鍵修正 1：開始新的一筆前，確保清空點紀錄
    pointsRef.current = [];

    // -- 建立一個臨時的離屏畫布 (Offscreen Canvas)
    const tempCanvas = document.createElement("canvas");
    tempCanvas.width = canvas.width;
    tempCanvas.height = canvas.height;
    const tempCtx = tempCanvas.getContext("2d");

    if (tempCtx) {
      // 1. 填滿純黑色背景 (AI 要求的背景)
      tempCtx.fillStyle = "black";
      tempCtx.fillRect(0, 0, tempCanvas.width, tempCanvas.height);

      // 2. 將原本的彩色畫布「轉化」為白色
      // 我們利用 globalCompositeOperation 或是簡單的濾鏡處理
      tempCtx.globalCompositeOperation = "destination-atop";
      tempCtx.drawImage(canvas, 0, 0);

      // 如果你原本畫的是紅色，我們強制把它覆蓋成白色
      tempCtx.globalCompositeOperation = "source-in";
      tempCtx.fillStyle = "white";
      tempCtx.fillRect(0, 0, tempCanvas.width, tempCanvas.height);

      // 3. 匯出成 PNG (最保險) 或 JPEG
      tempCanvas.toBlob((blob) => {
        if (blob) {
          console.log("📤 遮罩已轉換為黑底白線格式，準備上傳");
          onExportMask(blob);
        }
      }, "image/png"); // -- 建議用 png，確保不會有 JPEG 壓縮雜訊
    }
  };

  const draw = (e: any) => {
    if (!isDrawing || !isActive) return;
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;

    // ... 座標換算 x, y (你的代碼這部分是對的) ...
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    const clientX = e.clientX || (e.touches && e.touches[0].clientX);
    const clientY = e.clientY || (e.touches && e.touches[0].clientY);
    const x = (clientX - rect.left) * scaleX;
    const y = (clientY - rect.top) * scaleY;

    // 1. 記錄新點到 Ref
    pointsRef.current.push({ x, y });

    // 2. 清空畫布 (這裡假設這一層 Canvas 只有筆刷)
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // 3. 開始繪製
    ctx.beginPath(); // 🔥 務必加上這行！

    const scale = (scaleX + scaleY) / 2;
    ctx.lineWidth = brushSize * scale;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = "rgba(255, 0, 0, 0.3)";

    // 4. 一次性畫出目前的這整條線
    const pts = pointsRef.current;
    if (pts.length > 0) {
      ctx.moveTo(pts[0].x, pts[0].y);
      for (let i = 1; i < pts.length; i++) {
        ctx.lineTo(pts[i].x, pts[i].y);
      }
      ctx.stroke();
    }
  };

  // 確保 InpaintCanvas 的傳回結構如下
  // 確保 InpaintCanvas 的傳回結構如下
  // InpaintCanvas.tsx 內部
  return (
    <div className="absolute inset-0 flex items-center justify-center z-30">
      <canvas
        ref={setCanvasRef}
        onMouseDown={startDrawing}
        onMouseMove={draw}
        onMouseUp={stopDrawing}
        style={{
          width: `${displaySize.width}px`,
          height: `${displaySize.height}px`,
          // -- 暫時把 mixBlendMode 拿掉，用 normal，看得到綠色最重要
          mixBlendMode: "normal",
          // -- 強制開啟事件
          pointerEvents: "auto",
          backgroundColor: "rgba(0,0,0,0)", // 加上淡淡的藍色背景作為雙重保險
        }}
        className="cursor-crosshair block"
      />
    </div>
  );
}
