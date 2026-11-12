from pathlib import Path
from typing import List
from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict

BACKEND_DIR = Path(__file__).resolve().parent.parent.parent


class Settings(BaseSettings):
    APP_NAME: str = "Resume.AI Backend"
    APP_ENV: str = "development"
    DEBUG: bool = True
    API_V1_PREFIX: str = "/api/v1"

    # 数据库连接串：优先使用 MySQL，若未配置或连接失败则自动兼容 SQLite
    DATABASE_URL: str = "mysql+aiomysql://root:root@127.0.0.1:3306/resume_ai?charset=utf8mb4"

    # 真实大模型 API 配置
    LLM_PROVIDER: str = "deepseek"
    LLM_API_KEY: str = "sk-363240638e1a47a6b1ea0a734c7b740f"
    LLM_BASE_URL: str = "https://api.deepseek.com"
    LLM_MODEL: str = "deepseek-chat"

    # 备用大模型配置 (支持 302.ai / GPT-4o-mini / Gemini)
    SECONDARY_LLM_API_KEY: str = "sk-2BO4CwzHo3Tv0Jx8gfUTCZaraSfisTjj1WT4pOVZ1DjBtg11"
    SECONDARY_LLM_BASE_URL: str = "https://api.302.ai/v1"
    SECONDARY_LLM_MODEL: str = "gpt-4o-mini"

    # Redis 连接串
    REDIS_URL: str = "redis://localhost:6379/0"

    # CORS 域名白名单
    CORS_ORIGINS: List[str] = Field(
        default=["http://localhost:5173", "http://127.0.0.1:5173"]
    )

    # 文件存储目录
    STORAGE_DIR: str = str(BACKEND_DIR / "storage")

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=True,
        extra="ignore",
    )


settings = Settings()
