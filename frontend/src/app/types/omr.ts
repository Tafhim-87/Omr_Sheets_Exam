export type OptionLetter = "A" | "B" | "C" | "D";

export type ClassId =
  | "3" | "4" | "5" | "6" | "7" | "8" | "9" | "10" | "11" | "12";

export interface ExamUpsertPayload {
  class: string;
  subject_code: string;
  title?: string;
  marks_per_question: number;
  total_questions: number;
  answer_key: Record<string, OptionLetter>;
}

export interface ExamResponse {
  exam_id: string;
  class: string;
  subject_code: string;
  title?: string;
  marks_per_question: number;
  total_questions: number;
  answer_key: Record<string, OptionLetter>;
  version: number;
  updated_at?: string;
  status?: "created" | "updated";
}

export interface OmrUploadResponse {
  job_id: string;
  status: string;
}

export type JobStatus = "pending" | "processing" | "completed" | "failed";

export interface OmrJobStatus {
  status: JobStatus;
  progress?: number;
  error?: string;
}

export interface WrongAnswer {
  question: number;
  marked: string | null;
  correct: string | null;
}

export interface SheetResultItem {
  page?: number;
  class: string | null;
  section: string | null;
  subject: string | null;
  roll: string | null;
  reg: string | null;
  mcq: number | null;
  exam_id?: string | null;
  needs_review: boolean;
  message?: string;
  review_reasons?: string[];
  total_questions: number;
  right: number;
  wrong: number;
  unanswered: number;
  right_questions: number[];
  wrong_questions: number[];
  unanswered_questions: number[];
  wrong_answers?: WrongAnswer[];
  unkeyed_questions?: number[];
  error?: string;
}

export interface OmrBatchResult {
  sheets: SheetResultItem[];
  failed_sheets: number;
  graded_sheets: number;
  review_sheets: number;
}

export interface PersistedJob {
  jobId: string;
  filename: string;
  createdAt: number;
}