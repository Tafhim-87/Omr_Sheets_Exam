import os
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.config import settings
from app.api.omr_routes import router as omr_router
from app.api.exam_routes import router as exam_router
from app.api.result_routes import router as result_router

app = FastAPI(
    title="AI-Powered OMR Evaluation Backend",
    version="1.0.0",
    description="Backend API for 100-Question OMR scanning, alignment, recognition, scoring, and review."
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

os.makedirs(settings.STORAGE_DIR, exist_ok=True)

app.include_router(omr_router, prefix="/api/omr", tags=["OMR Processing"])
app.include_router(exam_router, prefix="/api/exams", tags=["Exams"])
app.include_router(result_router, prefix="/api/results", tags=["Results & Auditing"])

@app.get("/health")
async def health_check():
    return {"status": "healthy", "template": "multigraphics_100q_v1"}