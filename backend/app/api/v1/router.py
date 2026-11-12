from fastapi import APIRouter
from app.api.v1.health import router as health_router
from app.api.v1.jobs import router as jobs_router
from app.api.v1.batches import router as batches_router
from app.api.v1.screening_items import router as screening_items_router

api_v1_router = APIRouter()
api_v1_router.include_router(health_router)
api_v1_router.include_router(jobs_router)
api_v1_router.include_router(batches_router, prefix="/batches", tags=["Batches"])
api_v1_router.include_router(screening_items_router, prefix="/screening-items", tags=["ScreeningItems"])
