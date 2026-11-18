import type {
  ExamResponse,
  OmrBatchResult,
  OmrJobStatus,
  OptionLetter,
  SheetResultItem,
  WrongAnswer,
} from "../types/omr";

type Loose = Record<string, unknown>;

// ---------- small helpers ----------

function pickStr(o: Loose, keys: string[]): string | null {
  for (const k of keys) {
    const v = o[k];
    if (typeof v === "string" && v.length > 0) return v;
    if (typeof v === "number" && Number.isFinite(v)) return String(v);
  }
  return null;
}

function pickNum(o: Loose, keys: string[], d = 0): number {
  for (const k of keys) {
    const v = o[k];
    if (typeof v === "number" && Number.isFinite(v)) return v;
    if (typeof v === "string" && v.trim() !== "") {
      const n = Number(v);
      if (Number.isFinite(n)) return n;
    }
  }
  return d;
}

function numArray(v: unknown): number[] {
  if (!Array.isArray(v)) return [];
  return v.filter(
    (n): n is number => typeof n === "number" && Number.isFinite(n)
  );
}

function isOptionLetter(v: unknown): v is OptionLetter {
  return v === "A" || v === "B" || v === "C" || v === "D";
}

function coerceAnswerKey(raw: unknown): Record<string, OptionLetter> {
  const out: Record<string, OptionLetter> = {};
  if (!raw || typeof raw !== "object") return out;
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (/^\d+$/.test(k) && isOptionLetter(v)) {
      out[k] = v;
    }
  }
  return out;
}

// ---------- exams ----------

export function normalizeExam(raw: unknown): ExamResponse {
  const o = (raw ?? {}) as Loose;
  const key = coerceAnswerKey(o.answer_key);
  const keyLength = Object.keys(key).length;

  const totalQuestions =
    typeof o.total_questions === "number" && Number.isFinite(o.total_questions)
      ? o.total_questions
      : keyLength > 0
      ? keyLength
      : 30; // last-resort fallback for legacy backend responses

  const status =
    o.status === "created" || o.status === "updated" ? o.status : undefined;

  return {
    exam_id: String(o.exam_id ?? o.id ?? ""),
    class: pickStr(o, ["class", "class_name"]) ?? "",
    subject_code: pickStr(o, ["subject_code", "subject"]) ?? "",
    title: typeof o.title === "string" ? o.title : undefined,
    marks_per_question: pickNum(o, ["marks_per_question"], 1),
    total_questions: totalQuestions,
    answer_key: key,
    version: pickNum(o, ["version"], 1),
    updated_at: typeof o.updated_at === "string" ? o.updated_at : undefined,
    ...(status ? { status } : {}),
  };
}

// ---------- job status ----------

export function normalizeJobStatus(raw: unknown): OmrJobStatus {
  const o = (raw ?? {}) as Loose;
  const s = pickStr(o, ["status"]) ?? "pending";
  const status: OmrJobStatus["status"] = (
    ["pending", "processing", "completed", "failed"].includes(s)
      ? s
      : "pending"
  ) as OmrJobStatus["status"];

  const out: OmrJobStatus = { status };
  if (typeof o.progress === "number" && Number.isFinite(o.progress)) {
    out.progress = o.progress;
  }
  if (typeof o.error === "string" && o.error) {
    out.error = o.error;
  }
  return out;
}

// ---------- sheet rows ----------

const REVIEW_MESSAGE_BN = "এটা মানুষ দেখবে";

function normalizeWrongAnswer(raw: unknown): WrongAnswer {
  const w = (raw ?? {}) as Loose;
  return {
    question: pickNum(w, ["question"]),
    marked: typeof w.marked === "string" ? w.marked : null,
    correct: typeof w.correct === "string" ? w.correct : null,
  };
}

export function normalizeSheet(raw: unknown): SheetResultItem {
  const o = (raw ?? {}) as Loose;

  const message = typeof o.message === "string" ? o.message : undefined;

  // Backend flips needs_review for multi-marked / low-confidence cases, but
  // it also uses the Bangla message as a signal. Honour both.
  const needsReview =
    o.needs_review === true ||
    (message !== undefined && message.includes(REVIEW_MESSAGE_BN));

  const reviewReasons = Array.isArray(o.review_reasons)
    ? o.review_reasons.filter((r): r is string => typeof r === "string")
    : undefined;

  const wrongAnswers = Array.isArray(o.wrong_answers)
    ? o.wrong_answers.map(normalizeWrongAnswer)
    : undefined;

  const unkeyedQuestions = Array.isArray(o.unkeyed_questions)
    ? numArray(o.unkeyed_questions)
    : undefined;

  return {
    page: typeof o.page === "number" ? o.page : undefined,
    class: pickStr(o, ["class", "class_name"]),
    section: pickStr(o, ["section"]),
    subject: pickStr(o, ["subject", "subject_code"]),
    roll: pickStr(o, ["roll"]),
    reg: pickStr(o, ["reg"]),
    mcq: typeof o.mcq === "number" ? o.mcq : null,
    exam_id: pickStr(o, ["exam_id"]),
    needs_review: needsReview,
    ...(message !== undefined ? { message } : {}),
    ...(reviewReasons !== undefined ? { review_reasons: reviewReasons } : {}),
    total_questions: pickNum(o, ["total_questions"], 30),
    right: pickNum(o, ["right"]),
    wrong: pickNum(o, ["wrong"]),
    unanswered: pickNum(o, ["unanswered"]),
    right_questions: numArray(o.right_questions),
    wrong_questions: numArray(o.wrong_questions),
    unanswered_questions: numArray(o.unanswered_questions),
    ...(wrongAnswers !== undefined ? { wrong_answers: wrongAnswers } : {}),
    ...(unkeyedQuestions !== undefined
      ? { unkeyed_questions: unkeyedQuestions }
      : {}),
    ...(typeof o.error === "string" ? { error: o.error } : {}),
  };
}

// ---------- batch result ----------

export function normalizeBatchResult(raw: unknown): OmrBatchResult {
  const o = (raw ?? {}) as Loose;
  const sheets = Array.isArray(o.sheets) ? o.sheets.map(normalizeSheet) : [];

  const computedReview = sheets.filter((s) => s.needs_review).length;

  return {
    sheets,
    failed_sheets: pickNum(o, ["failed_sheets"]),
    graded_sheets: pickNum(o, ["graded_sheets"], sheets.length),
    review_sheets: pickNum(o, ["review_sheets"], computedReview),
  };
}

/** Exposed for tests and callers who want the exact backend text. */
export { REVIEW_MESSAGE_BN };