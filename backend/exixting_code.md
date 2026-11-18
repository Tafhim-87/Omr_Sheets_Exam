import os
import asyncio
import uuid
import json
import logging
from pathlib import Path
from typing import List, Dict, Any, Optional
import cv2
import numpy as np
from fastapi import APIRouter, UploadFile, File, BackgroundTasks, HTTPException, Depends, Query

try:
    import pymupdf as fitz
except ImportError:
    import fitz

from app.database import get_db
from app.config import settings
from app.omr.sheet_detector import SheetDetector
from app.omr.answer_recognizer import AnswerRecognizer

logger = logging.getLogger(__name__)
router = APIRouter()

TEMPLATE_NAME = "x_school_30q_template.json"


def _find_template_path() -> Path:
    candidates = []
    env = os.environ.get("OMR_TEMPLATE_PATH")
    if env:
        candidates.append(Path(env))
    candidates.append(Path.cwd() / "templates" / TEMPLATE_NAME)
    for parent in Path(__file__).resolve().parents:
        candidates.append(parent / "templates" / TEMPLATE_NAME)
    for c in candidates:
        if c.is_file():
            return c
    raise RuntimeError(
        "OMR template '%s' not found. Tried: %s. Set OMR_TEMPLATE_PATH or put it in a "
        "'templates' folder." % (TEMPLATE_NAME, ", ".join(str(c) for c in candidates))
    )


def _load_template() -> Dict[str, Any]:
    path = _find_template_path()
    with open(path, "r", encoding="utf-8") as f:
        tpl = json.load(f)
    for key in ("page_dimensions_mm", "mcq_layout", "student_grids", "options"):
        if key not in tpl:
            raise RuntimeError("Template %s is missing required key '%s'" % (path, key))
    logger.info("Loaded OMR template %s (v%s) from %s", tpl.get("template_id"), tpl.get("version"), path)
    return tpl


OMR_TEMPLATE = _load_template()


def render_pdf_page_to_cv2(page, dpi: int = 300) -> np.ndarray:
    """Renders a single PyMuPDF page directly into an OpenCV BGR image."""
    pix = page.get_pixmap(dpi=dpi)
    img_array = np.frombuffer(pix.samples, dtype=np.uint8)
    if pix.alpha:
        img_array = img_array.reshape((pix.height, pix.width, 4))
        img = cv2.cvtColor(img_array, cv2.COLOR_RGBA2BGR)
    else:
        img_array = img_array.reshape((pix.height, pix.width, 3))
        img = cv2.cvtColor(img_array, cv2.COLOR_RGB2BGR)
    return img


def process_single_sheet_image(image: np.ndarray, answer_key: Dict[str, str]) -> Dict[str, Any]:
    """Aligns and reads one sheet, calculating total correct answers using the answer key."""
    aligned = SheetDetector.align_and_normalize(image)
    sheet_output = AnswerRecognizer(OMR_TEMPLATE).process_sheet(aligned)

    questions = sheet_output.get("questions", {})
    info = sheet_output.get("student_info", {})

    # Calculate total correct answers by matching against the exam answer key
    total_correct = 0
    for q_num, data in questions.items():
        detected = data.get("detected_answer")
        expected = answer_key.get(str(q_num))
        if detected and expected and detected.strip().upper() == expected.strip().upper():
            total_correct += 1

    return {
        "class": info.get("class"),
        "section": info.get("section"),
        "subject": info.get("subject"),
        "roll": info.get("roll"),
        "reg": info.get("reg"),
        "mcq": total_correct
    }


async def run_omr_job(job_id: str, file_path: str, exam_id: str, db):
    """Processes single-sheet images or multi-page PDFs with batch isolation."""
    try:
        await db.omr_jobs.update_one(
            {"job_id": job_id},
            {"$set": {"status": "processing"}}
        )

        # Retrieve the exam configuration and answer key
        exam = await db.exams.find_one({"exam_id": exam_id})
        answer_key = exam.get("answer_key", {}) if exam else {}

        ext = os.path.splitext(file_path)[1].lower()
        sheets_results = []

        if ext == ".pdf":
            doc = fitz.open(file_path)
            total_pages = len(doc)

            for page_index in range(total_pages):
                try:
                    page = doc.load_page(page_index)
                    img = render_pdf_page_to_cv2(page)
                    sheet_data = await asyncio.to_thread(process_single_sheet_image, img, answer_key)
                    sheets_results.append(sheet_data)
                except Exception as page_err:
                    logger.exception("Failed processing page %s", page_index + 1)
                    sheets_results.append({
                        "page": page_index + 1,
                        "class": None, "section": None, "subject": None,
                        "roll": None, "reg": None, "mcq": None,
                        "error": "%s: %s" % (type(page_err).__name__, page_err)
                    })
            doc.close()
        else:
            img = cv2.imread(file_path)
            if img is None:
                raise ValueError("Could not decode image file")
            sheet_data = await asyncio.to_thread(process_single_sheet_image, img, answer_key)
            sheets_results.append(sheet_data)

        failed_sheets = sum(1 for s_ in sheets_results if s_.get("error"))
        if failed_sheets == len(sheets_results):
            final_status = "failed"
        elif failed_sheets:
            final_status = "completed_with_errors"
        else:
            final_status = "completed"

        result_id = str(uuid.uuid4())
        result_doc = {
            "result_id": result_id,
            "job_id": job_id,
            "exam_id": exam_id,
            "total_sheets": len(sheets_results),
            "failed_sheets": failed_sheets,
            "sheets": sheets_results,
            "status": final_status
        }

        await db.results.insert_one(result_doc)
        await db.omr_jobs.update_one(
            {"job_id": job_id},
            {"$set": {"status": final_status, "result_id": result_id,
                      "total_sheets": len(sheets_results), "failed_sheets": failed_sheets}}
        )

    except Exception as e:
        logger.exception("Error processing job %s", job_id)
        await db.omr_jobs.update_one(
            {"job_id": job_id},
            {"$set": {"status": "failed", "error": str(e)}}
        )


@router.post("/upload")
async def upload_omr(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    exam_id: str = Query(..., description="Target exam_id"),
    db = Depends(get_db)
):
    """Accepts single or multi-page OMR PDF/image files."""
    valid_exts = (".pdf", ".png", ".jpg", ".jpeg")
    if not file.filename.lower().endswith(valid_exts):
        raise HTTPException(status_code=400, detail="Unsupported file format")

    os.makedirs(settings.STORAGE_DIR, exist_ok=True)
    job_id = str(uuid.uuid4())
    safe_filename = f"{job_id}_{os.path.basename(file.filename)}"
    save_path = os.path.join(settings.STORAGE_DIR, safe_filename)

    with open(save_path, "wb") as f:
        f.write(await file.read())

    job_doc = {
        "job_id": job_id,
        "filename": file.filename,
        "status": "queued",
        "file_path": save_path,
        "exam_id": exam_id,
        "result_id": None
    }
    await db.omr_jobs.insert_one(job_doc)
    background_tasks.add_task(run_omr_job, job_id, save_path, exam_id, db)

    return {
        "job_id": job_id,
        "status": "queued",
        "filename": file.filename,
        "exam_id": exam_id
    }


@router.get("/status/{job_id}")
async def get_job_status(job_id: str, db = Depends(get_db)):
    job = await db.omr_jobs.find_one({"job_id": job_id}, {"_id": 0})
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    return job


@router.get("/results/{job_id}")
async def get_job_results(job_id: str, db = Depends(get_db)):
    result = await db.results.find_one(
        {"job_id": job_id},
        {"_id": 0, "job_id": 1, "status": 1, "total_sheets": 1, "failed_sheets": 1, "sheets": 1}
    )
    if not result:
        job = await db.omr_jobs.find_one({"job_id": job_id})
        if not job:
            raise HTTPException(status_code=404, detail="Job not found")
        return {"job_id": job_id, "status": job.get("status"), "message": "Still processing"}
    return result