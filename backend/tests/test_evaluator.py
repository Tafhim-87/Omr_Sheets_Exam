import pytest
from app.omr.evaluator import ExamEvaluator

def test_evaluation_scoring():
    mock_recognized = {
        "1": {"question_status": "single_marked", "detected_answer": "A", "requires_manual_review": False},
        "2": {"question_status": "single_marked", "detected_answer": "C", "requires_manual_review": False},
        "3": {"question_status": "blank", "detected_answer": None, "requires_manual_review": False},
        "4": {"question_status": "multiple_marked", "detected_answer": None, "requires_manual_review": True},
    }

    exam_config = {
        "marks_per_question": 1.0,
        "negative_marks": 0.25,
        "penalize_multiple": True,
        "answer_key": {
            "1": "A",  # Correct (+1.0)
            "2": "B",  # Wrong (-0.25)
            "3": "C",  # Blank (0)
            "4": "D"   # Multi-marked penalized (-0.25)
        }
    }

    res = ExamEvaluator.evaluate(mock_recognized, exam_config)
    assert res["correct_count"] == 1
    assert res["wrong_count"] == 1
    assert res["unanswered_count"] == 1
    assert res["multiple_marked_count"] == 1
    assert res["total_score"] == 0.5  # 1.0 - 0.25 - 0.25 = 0.5
    assert res["needs_manual_audit"] is True