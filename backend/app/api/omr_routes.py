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
    """Locate the template no matter which directory the server was started from.

    Order: OMR_TEMPLATE_PATH env var -> ./templates (current dir) -> every parent
    directory of this file (…/templates/<name>). Raises if it cannot be found, so a
    wrong path fails loudly at startup instead of producing empty results.
    """
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



# Use the built-in marker aligner first (handles negative photos, light/grey markers, bent
# sheets); SheetDetector stays as the fallback if the four markers cannot be found.
USE_BUILTIN_ALIGNER = True


def fix_polarity(img):
    """Negative photo (dark paper, light ink, e.g. a scanner/phone "invert" filter) -> normal."""
    g = img if img.ndim == 2 else cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    return (255 - img) if np.median(g) < 110 else img

def align_by_markers(img, out_w=2480, out_h=3508, page=(210.0, 297.0),
                     centres=((8.5, 8.5), (201.5, 8.5), (8.5, 288.5), (201.5, 288.5))):
    g = img if img.ndim == 2 else cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    h, w = g.shape
    want = (7.0 * w / page[0]) ** 2          # marker area in px (page ~fills the photo)
    found = []
    for cx, cy in ((0, 0), (w, 0), (0, h), (w, h)):
        x0, x1 = (0, int(w * .18)) if cx == 0 else (int(w * .82), w)
        y0, y1 = (0, int(h * .13)) if cy == 0 else (int(h * .87), h)
        roi = cv2.GaussianBlur(g[y0:y1, x0:x1], (3, 3), 0)
        _, m = cv2.threshold(roi, 0, 255, cv2.THRESH_BINARY_INV + cv2.THRESH_OTSU)
        cs, _ = cv2.findContours(m, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
        best = None
        for c in cs:
            x, y, bw, bh = cv2.boundingRect(c)
            if not (0.4 * want < bw * bh < 2.5 * want and 0.7 < bw / bh < 1.43 and cv2.contourArea(c) > 0.75 * bw * bh):
                continue
            # prefer the blob closest to the image corner
            d = (x0 + x + bw / 2 - cx) ** 2 + (y0 + y + bh / 2 - cy) ** 2
            if best is None or d < best[0]:
                best = (d, (x0 + x + bw / 2, y0 + y + bh / 2))
        if best is None:
            return None
        found.append(best[1])
    src = np.float32(found)
    dst = np.float32([[mx / page[0] * out_w, my / page[1] * out_h] for mx, my in centres])
    return cv2.warpPerspective(g, cv2.getPerspectiveTransform(src, dst), (out_w, out_h), borderValue=255)


def align_sheet(image: np.ndarray) -> np.ndarray:
    image = fix_polarity(image)
    if USE_BUILTIN_ALIGNER:
        aligned = align_by_markers(image)
        if aligned is not None:
            return aligned
        logger.warning("Built-in aligner found no 4 markers; falling back to SheetDetector")
    return SheetDetector.align_and_normalize(image)


# ---- when the app is not sure, hand the sheet to a person ----
REVIEW_MESSAGE = "এটা মানুষ দেখবে"
REQUIRED_FIELDS = ("class", "subject", "roll", "reg")   # blank / unclear -> human review
MIN_ALIGNMENT = 0.6                                      # share of bubbles matched to a real circle
# A bubble is "sure empty" below DOUBT_LOW and "sure filled" above DOUBT_HIGH (measured: empty
# bubbles in photos reach 0.34, pen-filled ones start at ~0.70).  In between -> human review.
DOUBT_LOW, DOUBT_HIGH = 0.38, 0.65


def find_review_reasons(info: Dict[str, Any], questions: Dict[str, Any],
                        alignment: Dict[str, float]) -> List[str]:
    """Reasons the result cannot be trusted.  Empty list = the app is sure.

    NOTE: a question with two or more bubbles filled is NOT a doubt: it is simply wrong."""
    reasons: List[str] = []
    for f in REQUIRED_FIELDS:
        v = info.get(f)
        if v is None:
            reasons.append("%s: ফাঁকা" % f)
        elif "?" in str(v):
            reasons.append("%s: অস্পষ্ট (%s)" % (f, v))
    if info.get("section") == "?":
        reasons.append("section: অস্পষ্ট")
    for q in sorted(questions, key=lambda x: int(x)):
        opts = questions[q].get("per_option_metrics", {})
        if any(DOUBT_LOW <= m.get("fill_ratio", 0.0) < DOUBT_HIGH for m in opts.values()):
            reasons.append("প্রশ্ন %s: হালকা বা আংশিক দাগ" % q)
    weak = [k for k, v in alignment.items() if k != "set" and v < MIN_ALIGNMENT]
    if weak:
        reasons.append("ছবির অ্যালাইনমেন্ট দুর্বল: %s" % ", ".join(weak))
    return reasons


_OPTION_ALIASES = {
    "A": "A", "B": "B", "C": "C", "D": "D",
    "1": "A", "2": "B", "3": "C", "4": "D",
    "ক": "A", "খ": "B", "গ": "C", "ঘ": "D",
    "১": "A", "২": "B", "৩": "C", "৪": "D",
}


def normalize_answer_key(raw: Any) -> Dict[str, str]:
    """Turns an exam's answer key into {"1": "A", "2": "C", ...}.

    Accepts a dict ({"1": "A"} / {1: "a"} / Bangla ক-ঘ / 1-4) or a list (index 0 = Q1).
    Entries it cannot understand are skipped."""
    if not raw:
        return {}
    items = raw.items() if isinstance(raw, dict) else enumerate(raw, start=1)
    key: Dict[str, str] = {}
    for q, ans in items:
        letter = _OPTION_ALIASES.get(str(ans).strip().upper() if str(ans).strip().isascii() else str(ans).strip())
        if letter:
            key[str(q).strip()] = letter
    return key


def grade_questions(questions: Dict[str, Any], answer_key: Dict[str, str]) -> Dict[str, Any]:
    """Compares detected answers with the key, for EVERY question on the sheet (all 30).

    right      = marked option equals the key
    wrong      = marked a different option, or marked more than one option
    unanswered = nothing marked (listed in unanswered_questions, key or no key)
    unkeyed    = answered, but the exam's answer key has no entry for that question"""
    right, wrong, unanswered, unkeyed = [], [], [], []
    wrong_answers: Dict[str, Dict[str, Any]] = {}

    for q in sorted(questions, key=lambda x: int(x)):
        data = questions[q]
        marked = data.get("detected_answer")
        correct = answer_key.get(q)
        if data.get("question_status") == "multiple_marked":
            wrong.append(int(q))
            wrong_answers[q] = {"marked": "multiple", "correct": correct}
        elif marked is None:
            unanswered.append(int(q))
        elif correct is None:
            unkeyed.append(int(q))
        elif marked == correct:
            right.append(int(q))
        else:
            wrong.append(int(q))
            wrong_answers[q] = {"marked": marked, "correct": correct}

    out = {
        "total_questions": len(questions),
        "right": len(right),
        "wrong": len(wrong),
        "unanswered": len(unanswered),
        "right_questions": right,
        "wrong_questions": wrong,
        "unanswered_questions": unanswered,
        "wrong_answers": wrong_answers,
    }
    if unkeyed:
        out["unkeyed_questions"] = unkeyed
    return out


def read_sheet(image: np.ndarray) -> Dict[str, Any]:
    """Aligns and reads one sheet (no exam / grading yet)."""
    aligned = align_sheet(image)
    sheet_output = AnswerRecognizer(OMR_TEMPLATE).process_sheet(aligned)
    return {
        "info": sheet_output.get("student_info", {}),
        "questions": sheet_output.get("questions", {}),
        "alignment": sheet_output.get("alignment", {}),
    }


def build_sheet_result(read: Dict[str, Any], exam: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    """Turns a read sheet into the final per-sheet result, grading it against `exam`."""
    info, questions = read["info"], read["questions"]
    result = {
        "class": info.get("class"),
        "section": info.get("section"),
        "subject": info.get("subject"),
        "roll": info.get("roll"),
        "reg": info.get("reg"),
        # number of MCQs answered on this sheet (exactly one bubble filled)
        "mcq": sum(1 for d in questions.values() if d.get("detected_answer")),
    }

    reasons = find_review_reasons(info, questions, read.get("alignment", {}))
    answer_key = normalize_answer_key((exam or {}).get("answer_key"))

    if exam is None:
        reasons.append("এই শ্রেণি ও বিষয় কোডের কোনো পরীক্ষা (উত্তরমালা) পাওয়া যায়নি")
    elif not answer_key:
        reasons.append("পরীক্ষা %s-এ ব্যবহারযোগ্য উত্তরমালা নেই" % exam.get("exam_id"))
    else:
        missing = sorted(int(q) for q in questions if q not in answer_key)
        if missing:
            reasons.append("উত্তরমালায় এই প্রশ্নগুলোর উত্তর নেই: %s" % ", ".join(map(str, missing)))

    if exam is not None:
        result["exam_id"] = exam.get("exam_id")

    if reasons:
        # not sure -> no score is shown, a person checks the sheet
        result.update({"needs_review": True, "message": REVIEW_MESSAGE, "review_reasons": reasons})
    else:
        result["needs_review"] = False
        result.update(grade_questions(questions, answer_key))
    return result


def process_single_sheet_image(image: np.ndarray, exam: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    """Read + grade one sheet.  `exam` is the exam document (with its answer_key)."""
    return build_sheet_result(read_sheet(image), exam)


async def find_exam_for_sheet(db, info: Dict[str, Any], fallback_exam_id: Optional[str],
                              cache: Dict[Any, Any]) -> Optional[Dict[str, Any]]:
    """Picks the exam from what is printed on the sheet: class + subject code.

    Order: exam whose class_name == sheet class AND subject_code == sheet subject (newest
    wins).  Only if the sheet's class/subject could not be read does it fall back to the
    exam_id given at upload."""
    cls, subj = info.get("class"), info.get("subject")
    readable = cls and subj and "?" not in str(cls) and "?" not in str(subj)

    if readable:
        key = ("cs", str(cls), str(subj))
        if key not in cache:
            cache[key] = await db.exams.find_one(
                {"class_name": str(cls), "subject_code": str(subj)},
                sort=[("updated_at", -1)])
        return cache[key]

    if fallback_exam_id:
        key = ("id", fallback_exam_id)
        if key not in cache:
            cache[key] = await db.exams.find_one({"exam_id": fallback_exam_id})
        return cache[key]
    return None


async def run_omr_job(job_id: str, file_path: str, exam_id: Optional[str], db):
    """Processes single-sheet images or multi-page PDFs; each sheet is graded against the
    exam that matches its own class + subject code."""
    try:
        await db.omr_jobs.update_one(
            {"job_id": job_id},
            {"$set": {"status": "processing"}}
        )

        exam_cache: Dict[Any, Any] = {}

        async def handle(img: np.ndarray) -> Dict[str, Any]:
            read = await asyncio.to_thread(read_sheet, img)
            exam = await find_exam_for_sheet(db, read["info"], exam_id, exam_cache)
            return build_sheet_result(read, exam)

        ext = os.path.splitext(file_path)[1].lower()
        sheets_results = []

        if ext == ".pdf":
            doc = fitz.open(file_path)
            total_pages = len(doc)

            for page_index in range(total_pages):
                try:
                    page = doc.load_page(page_index)
                    img = render_pdf_page_to_cv2(page)
                    sheets_results.append(await handle(img))
                except Exception as page_err:
                    logger.exception("Failed processing page %s", page_index + 1)
                    sheets_results.append({
                        "page": page_index + 1,
                        "class": None, "section": None, "subject": None,
                        "roll": None, "reg": None, "mcq": None,
                        "needs_review": True, "message": REVIEW_MESSAGE,
                        "error": "%s: %s" % (type(page_err).__name__, page_err)
                    })
            doc.close()
        else:
            img = cv2.imread(file_path)
            if img is None:
                raise ValueError("Could not decode image file")
            sheets_results.append(await handle(img))

        failed_sheets = sum(1 for s_ in sheets_results if s_.get("error"))
        graded_sheets = sum(1 for s_ in sheets_results if "right" in s_)
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
            "graded_sheets": graded_sheets,
            "review_sheets": sum(1 for s_ in sheets_results if s_.get("needs_review")),
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
    exam_id: Optional[str] = Query(None, description="Optional fallback exam_id, used only if class/subject cannot be read from the sheet"),
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