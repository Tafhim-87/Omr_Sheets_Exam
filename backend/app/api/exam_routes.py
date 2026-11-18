from datetime import datetime, timezone
from typing import Dict, List, Optional
from fastapi import APIRouter, HTTPException, Depends, Query
from pydantic import BaseModel, Field
from app.database import get_db

router = APIRouter()


class ExamUpsert(BaseModel):
    class_name: str = Field(..., alias="class", description="Class identifier, e.g., '5', '10'")
    subject_code: str = Field(..., description="Subject code, e.g., '103'")
    title: Optional[str] = None
    total_questions: int = 30
    options: List[str] = ["A", "B", "C", "D"]
    marks_per_question: float = 1.0
    answer_key: Dict[str, str] = Field(
        default_factory=dict,
        description="Map of question number to correct option, e.g. {'1': 'A', '2': 'B'}"
    )

    class Config:
        populate_by_name = True


@router.post("", status_code=200)
async def upsert_exam_answer_key(payload: ExamUpsert, db=Depends(get_db)):
    """
    Creates or updates an exam answer key by (class, subject_code).
    If submitted a 2nd or 3rd time for the same class & subject_code,
    it automatically overwrites the old key and increments the version.
    """
    clean_class = payload.class_name.strip()
    clean_subject = payload.subject_code.strip()
    exam_id = f"CLASS-{clean_class}-SUB-{clean_subject}"

    # Normalize answer keys to uppercase
    normalized_key = {
        str(k).strip(): str(v).strip().upper()
        for k, v in payload.answer_key.items()
    }

    now = datetime.now(timezone.utc).isoformat()
    existing = await db.exams.find_one({"class_name": clean_class, "subject_code": clean_subject})

    next_version = (existing.get("version", 1) + 1) if existing else 1
    title = payload.title or f"Class {clean_class} - Subject {clean_subject}"

    doc = {
        "exam_id": exam_id,
        "class_name": clean_class,
        "subject_code": clean_subject,
        "title": title,
        "total_questions": payload.total_questions,
        "options": payload.options,
        "marks_per_question": payload.marks_per_question,
        "negative_marks": 0.0,
        "answer_key": normalized_key,
        "version": next_version,
        "updated_at": now,
    }

    await db.exams.update_one(
        {"class_name": clean_class, "subject_code": clean_subject},
        {
            "$set": doc,
            "$setOnInsert": {"created_at": now}
        },
        upsert=True,
    )

    return {
        "status": "updated" if existing else "created",
        "version": next_version,
        **doc
    }


@router.get("")
async def list_exams(
    class_name: Optional[str] = Query(None, alias="class"),
    subject_code: Optional[str] = Query(None),
    db=Depends(get_db)
):
    query = {}
    if class_name:
        query["class_name"] = class_name.strip()
    if subject_code:
        query["subject_code"] = subject_code.strip()

    cursor = db.exams.find(query, {"_id": 0}).sort("updated_at", -1)
    return await cursor.to_list(length=100)


@router.get("/{class_name}/{subject_code}")
async def get_exam_by_class_and_subject(class_name: str, subject_code: str, db=Depends(get_db)):
    exam = await db.exams.find_one(
        {"class_name": class_name.strip(), "subject_code": subject_code.strip()},
        {"_id": 0}
    )
    if not exam:
        raise HTTPException(
            status_code=404,
            detail=f"No answer key found for Class '{class_name}' and Subject '{subject_code}'"
        )
    return exam


@router.delete("/{class_name}/{subject_code}")
async def delete_exam(class_name: str, subject_code: str, db=Depends(get_db)):
    res = await db.exams.delete_one(
        {"class_name": class_name.strip(), "subject_code": subject_code.strip()}
    )
    if res.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Exam configuration not found")
    return {"status": "deleted", "class": class_name, "subject_code": subject_code}