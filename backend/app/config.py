import os
from pydantic_settings import BaseSettings

class Settings(BaseSettings):
    MONGO_URI: str = os.getenv("MONGO_URI", "mongodb://localhost:27017")
    DB_NAME: str = os.getenv("DB_NAME", "omr_system")
    STORAGE_DIR: str = os.getenv("STORAGE_DIR", "./storage")
    CORS_ORIGINS: list[str] = ["http://localhost:3000"]
    MAX_UPLOAD_SIZE_MB: int = 15
    EMPTY_THRESHOLD: float = 0.15
    FILLED_THRESHOLD: float = 0.42

    class Config:
        env_file = ".env"

settings = Settings()