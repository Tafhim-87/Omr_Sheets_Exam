from datetime import datetime, timezone
from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from app.database import get_db
from app.omr.evaluator import ExamEvaluator

router = APIRouter()

class CorrectionRequest(BaseModel):
    question_number: int
    corrected_answer: str
    reviewer_id: str
    reason: str

@router.get("/{result_id}")
async def get_result(result_id: str, db = Depends(get_db)):
    res = await db.results.find_one({"result_id": result_id}, {"_id": 0})
    if not res:
        raise HTTPException(status_code=404, detail="Result not found")
    return res

@router.put("/{result_id}/correction")
async def correct_result(result_id: str, payload: CorrectionRequest, db = Depends(get_db)):
    res = await db.results.find_one({"result_id": result_id})
    if not res:
        raise HTTPException(status_code=404, detail="Result not found")

    q_key = str(payload.question_number)
    if q_key not in res["recognition"]:
        raise HTTPException(status_code=400, detail="Invalid question number")

    original_val = res["recognition"][q_key]["detected_answer"]

    # Preserve original machine prediction and update with correction
    res["recognition"][q_key]["detected_answer"] = payload.corrected_answer
    res["recognition"][q_key]["question_status"] = "corrected"
    res["recognition"][q_key]["requires_manual_review"] = False

    audit_entry = {
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "question": payload.question_number,
        "original_value": original_val,
        "corrected_value": payload.corrected_answer,
        "reviewer_id": payload.reviewer_id,
        "reason": payload.reason
    }

    exam = await db.exams.find_one({"exam_id": res["exam_id"]})
    exam_config = exam if exam else {"marks_per_question": 1.0, "negative_marks": 0.25, "answer_key": {}}
    updated_eval = ExamEvaluator.evaluate(res["recognition"], exam_config)

    await db.results.update_one(
        {"result_id": result_id},
        {
            "$set": {
                f"recognition.{q_key}": res["recognition"][q_key],
                "evaluation": updated_eval,
                "needs_review": updated_eval["needs_manual_audit"]
            },
            "$push": {"audit_trail": audit_entry}
        }
    )

    return {"status": "updated", "result_id": result_id, "evaluation": updated_eval}