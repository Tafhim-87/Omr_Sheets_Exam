from typing import Dict, Any

class ExamEvaluator:
    @staticmethod
    def evaluate(recognized_questions: Dict[str, Any], exam_config: Dict[str, Any]) -> Dict[str, Any]:
        answer_key = exam_config.get("answer_key", {})
        marks_correct = float(exam_config.get("marks_per_question", 1.0))
        # Negative marks forced to 0.0 unless explicitly required
        marks_negative = float(exam_config.get("negative_marks", 0.0))

        correct = 0
        wrong = 0
        unanswered = 0
        multiple_marked = 0
        uncertain = 0

        evaluation_details = {}

        for q_str, q_data in recognized_questions.items():
            status = q_data.get("question_status", "blank")
            detected = q_data.get("detected_answer")
            expected = answer_key.get(q_str)

            if status == "blank":
                unanswered += 1
                outcome = "unanswered"
                awarded = 0.0
            elif status == "multiple_marked":
                multiple_marked += 1
                outcome = "multiple_marked"
                # No negative deduction
                awarded = -marks_negative if marks_negative > 0 else 0.0
            elif status == "uncertain":
                uncertain += 1
                outcome = "uncertain"
                awarded = 0.0
            elif status == "single_marked" or status == "corrected":
                if expected and detected == expected:
                    correct += 1
                    outcome = "correct"
                    awarded = marks_correct
                else:
                    wrong += 1
                    outcome = "wrong"
                    # No negative deduction
                    awarded = -marks_negative if marks_negative > 0 else 0.0
            else:
                outcome = "unknown"
                awarded = 0.0

            evaluation_details[q_str] = {
                "detected": detected,
                "expected": expected,
                "outcome": outcome,
                "score_delta": awarded,
                "requires_review": q_data.get("requires_manual_review", False)
            }

        total_questions = len(recognized_questions)
        total_score = max(0.0, float(correct * marks_correct))
        max_possible = float(total_questions * marks_correct)
        percentage = round((total_score / max_possible * 100), 2) if max_possible > 0 else 0.0

        return {
            "total_questions": total_questions,
            "correct_count": correct,
            "wrong_count": wrong,
            "unanswered_count": unanswered,
            "multiple_marked_count": multiple_marked,
            "uncertain_count": uncertain,
            "total_score": round(total_score, 2),
            "max_score": round(max_possible, 2),
            "percentage": percentage,
            "needs_manual_audit": (multiple_marked > 0 or uncertain > 0),
            "details": evaluation_details
        }