from pydantic_settings import BaseSettings, SettingsConfigDict

class Settings(BaseSettings):
    # 資料庫相關
    db_user: str
    db_password: str
    db_host: str
    db_name: str
    
    # 資料夾路徑
    target_dir: str

    # Hashids 相關
    HASHIDS_SALT: str
    HASHIDS_MIN_LENGTH: int = 8

    # 告訴 Pydantic 讀取 .env 檔案
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

settings = Settings()