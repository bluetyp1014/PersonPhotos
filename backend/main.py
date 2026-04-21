import os
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv
from fastapi.staticfiles import StaticFiles

# 1. 載入環境變數
load_dotenv()

# 2. 導入資料庫與模型配置
from app.database import engine, Base
from app.api.v1 import photos, albums, editor

# 確保靜態檔案目錄存在
# 包含原本的 static 以及我們存放修圖結果的 adjust
STATIC_PATH = os.path.join(os.getcwd(), "static")
ADJUST_PATH = os.path.join(STATIC_PATH, "adjust")
os.makedirs(ADJUST_PATH, exist_ok=True)

# 3. 初始化資料庫表 (這相當於 C# EF Core 的 EnsureCreated)
# 如果你已經用 Alembic 做 Migration，這行可以省略
Base.metadata.create_all(bind=engine)

app = FastAPI(
    title="PersonPhotos API",
    docs_url=None,
    redoc_url=None,
    openapi_url=None
    )

# 4. CORS 設定 (C# 的 UseCors)
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "http://127.0.0.1:3000",
        ], # -- 必須明確指定前端網址，不能用 "*"
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# 5. 註冊路由 (C# 的 MapControllers)
app.include_router(photos.router, prefix="/api/v1/photos", tags=["Photos"])
app.include_router(albums.router, prefix="/api/v1/albums", tags=["Albums"])
# 新增這行
app.include_router(editor.router, prefix="/api/v1/editor", tags=["AI Editor"])

@app.get("/")
def root():
    return {"message": "Backend API is running"}

if __name__ == "__main__":
    import uvicorn
    # uvicorn.run("app.main:app", host="127.0.0.1", port=8000, reload=True)
    # 修正重點：因為 main.py 在根目錄，所以直接指向 main:app
    uvicorn.run("main:app", host="127.0.0.1", port=8000, reload=True)
