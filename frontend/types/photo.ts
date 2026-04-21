// 定義基礎照片類型，與後端的 PhotoBase 對應
export interface Photo {
  hash_id: string; // 後端 computed_field 產生的
  file_name: string;
  taken_at: string | null; // API 傳過來的是 ISO 字串
  created_at: string | null;
  id: number; // 雖然我們前端主要用 hash_id，但後端資料庫原始 id 也要定義
}

// 1. 定義單筆資料的型別 (對應後端 Schema)
export interface TimelineIndexItem {
  hash_id: string;
  taken_at: string | null;
  created_at: string | null;
}

// 2. 定義累加器的型別結構
// 結構為: { [年份: number]: { [月份: number]: 數量: number } }
export interface TimelineMenu {
  [year: number]: {
    [month: number]: number;
  };
}

export interface PhotoDetail {
  hash_id: string;
  file_name: string;
  file_path: string;
  make: string; // 相機品牌
  model: string; // 型號
  lens: string; // 鏡頭
  f_number: number | null; // 光圈
  iso: number | null;
  taken_at: string | null;
  created_at: string | null;
  url: string; // 圖片位址
}

// 建立相簿時，封面物件的類型
export interface AlbumCoverSimple {
  photo_id: string;
  position: number;
}

// 定義相簿的結構
export interface Album {
  hash_id: string;
  title: string;
  description: string | null;
  created_at: string;
  covers: AlbumCoverSimple[];
}

export interface AlbumCoveretail {
  photo: Photo;
  position: number;
}

export interface AlbumDetail {
  hash_id: string;
  title: string;
  description: string | null;
  created_at: string;
  covers: AlbumCoveretail[];
  photos: Photo[];
}

export interface AIParams {
  clarity: number;
  dehaze: number;
  sharpness: number;
  highlights: number;
  shadows: number;
  exposure: number;
  vibrance: number;
  temp: number;
  vignette: number;
  [key: string]: number | string; // 容許額外擴充
}

// 1. 定義中文對應表 (放在組件外或內部皆可)
export const PARAM_LABELS: Record<string, string> = {
  clarity: "清晰度",
  dehaze: "去朦朧",
  sharpness: "銳利度",
  highlights: "高光",
  shadows: "陰影",
  exposure: "曝光",
  vibrance: "自然飽和度",
  temp: "色溫",
  tint: "色調",
  vignette: "暗角",
  midtones: "中間調",
};

export const QUICK_TAGS = [
  "人像",
  "風景",
  "電影風格",
  "Drama",
  "強烈對比",
  "風景通透",
  "復古底片",
  "金屬質感",
];

/*
{
  "title": "string",
  "description": "string",
  "created_at": "2026-02-03T05:55:05.441Z",
  "covers": [
    {
      "position": 0,
      "photo": {
        "file_name": "string",
        "taken_at": "2026-02-03T05:55:05.441Z",
        "hash_id": "string"
      }
    }
  ],
  "photos": [
    {
      "file_name": "string",
      "taken_at": "2026-02-03T05:55:05.441Z",
      "hash_id": "string"
    }
  ],
  "hash_id": "string"
}
*/
