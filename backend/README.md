# Resume.AI 后端服务 (Backend)

基于 **FastAPI + SQLAlchemy 2.0 (Async) + PostgreSQL / SQLite + Alembic** 构建的企业级智能简历初筛核心后端服务。

---

## 1. 快速上手 (本地直接运行)

本项目内置开箱即用的异步 SQLite 支持，无需本地启动 Docker 或配置复杂数据库即可瞬间跑通！

### 1.1 激活虚拟环境并安装依赖
```bash
# 进入 backend 目录
cd backend

# 创建 Python 3.11 虚拟环境 (如尚未创建)
py -3.11 -m venv .venv

# 激活环境 (Windows PowerShell)
.\.venv\Scripts\Activate.ps1

# 安装依赖
pip install -r requirements.txt -i https://pypi.tuna.tsinghua.edu.cn/simple
```

### 1.2 执行数据库迁移
```bash
# 自动执行迁移升级至最新版本
alembic upgrade head
```

### 1.3 启动后端开发服务
```bash
uvicorn app.main:app --reload --port 8000
```
启动后访问：
* **Swagger 交互式接口文档**：[http://localhost:8000/docs](http://localhost:8000/docs)
* **ReDoc 文档**：[http://localhost:8000/redoc](http://localhost:8000/redoc)
* **健康检查状态**：[http://localhost:8000/api/v1/health](http://localhost:8000/api/v1/health)

---

## 2. 自动化测试套件
```bash
# 在项目根目录或 backend 目录下运行
$env:PYTHONPATH="backend"
pytest backend/tests -v
```

---

## 3. Docker 容器化启动 (PostgreSQL 16 + Redis 7)
在项目根目录下执行：
```bash
docker compose up -d
```
