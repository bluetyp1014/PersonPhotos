import axios from "axios";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE;

export const api = axios.create({
  baseURL: API_BASE,
});

export const getImageUrl = (hash_id: string) => {
  return `${API_BASE}/api/v1/photos/original/${hash_id}`;
};

export const getThumbUrl = (hash_id: string) => {
  if (!hash_id) return "";
  return `${API_BASE}/api/v1/photos/thumbnail/${hash_id}`;
};

export const uploadPhotoXHR = (
  file: File,
  onProgress: (percent: number) => void,
): Promise<any> => {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    const formData = new FormData();

    formData.append("file", file);

    // 監控上傳進度
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) {
        const percent = Math.round((event.loaded * 100) / event.total);
        onProgress(percent);
      }
    };

    // 請求完成處理
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        // 嘗試解析 JSON 回傳值
        try {
          const response = JSON.parse(xhr.responseText);
          resolve(response);
        } catch (e) {
          resolve(xhr.responseText);
        }
      } else {
        reject(new Error(`上傳失敗: ${xhr.status}`));
      }
    };

    // 錯誤處理
    xhr.onerror = () => reject(new Error("網路連線錯誤"));
    xhr.onabort = () => reject(new Error("上傳已取消"));

    // 開啟連線 (使用相對路徑，讓 Nginx 處理轉發)
    xhr.open("POST", `${API_BASE}/api/v1/photos/upload`);
    xhr.send(formData);
  });
};
