from contextlib import asynccontextmanager
from fastapi import FastAPI, Request, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from app.api.v1.router import api_v1_router
from app.core.config import settings
from app.core.database import Base, engine


@asynccontextmanager
async def lifespan(app: FastAPI):
    """应用生命周期管理：初始化数据库与连接池释放"""
    # 自动执行 DDL 迁移并注入初始数据（支持 MySQL 与 SQLite）
    try:
        async with engine.begin() as conn:
            await conn.run_sync(Base.metadata.create_all)
        from app.core.database import AsyncSessionLocal
        from app.core.seeder import seed_demo_database
        async with AsyncSessionLocal() as session:
            await seed_demo_database(session)
    except Exception as e:
        print(f"[Startup Warning] Database initialization warning: {e}")
    yield
    # 停机释放连接池
    await engine.dispose()


app = FastAPI(
    title="Resume.AI Backend API",
    description="企业级证据驱动+人机协同 (HITL) 智能简历初筛工作台核心后端服务",
    version="0.1.0",
    lifespan=lifespan,
    docs_url="/docs",
    redoc_url="/redoc",
    openapi_url="/openapi.json",
)

# 配置 CORS 中间件
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# 挂载 API V1 路由
app.include_router(api_v1_router, prefix=settings.API_V1_PREFIX)


@app.get("/", summary="根服务存活检查")
async def root():
    return {
        "status": "ok",
        "app": "Resume.AI Backend",
        "version": "0.1.0",
        "docs": "/docs",
    }


@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    """全局兜底异常处理器"""
    return JSONResponse(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        content={
            "error": "InternalServerError",
            "message": str(exc) if settings.DEBUG else "系统内部异常，请联系管理员",
            "path": request.url.path,
        },
    )


@app.get("/")
async def root():
    return {
        "app": settings.APP_NAME,
        "version": "0.1.0",
        "docs": "/docs",
        "api_v1": settings.API_V1_PREFIX,
    }
