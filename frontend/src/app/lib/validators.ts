import { z } from "zod";

export const optionSchema = z.enum(["A", "B", "C", "D"]);
export type OptionInput = z.infer<typeof optionSchema>;

export const classSchema = z.enum([
  "3", "4", "5", "6", "7", "8", "9", "10", "11", "12",
]);

export const subjectCodeSchema = z
  .string()
  .regex(/^\d{3}$/, "Subject code must be exactly 3 digits");

export const MIN_QUESTIONS = 1;
export const MAX_QUESTIONS = 100;

export const answerKeyRecordSchema = z.record(
  z.string().regex(/^\d+$/, "Answer-key keys must be numeric strings"),
  optionSchema
);

export const examPayloadSchema = z
  .object({
    class: classSchema,
    subject_code: subjectCodeSchema,
    title: z.string().trim().max(120).optional(),
    marks_per_question: z.number().positive().max(100),
    total_questions: z
      .number()
      .int()
      .min(MIN_QUESTIONS, `Minimum ${MIN_QUESTIONS} question(s)`)
      .max(MAX_QUESTIONS, `Maximum ${MAX_QUESTIONS} questions`),
    answer_key: answerKeyRecordSchema,
  })
  .superRefine((val, ctx) => {
    const expected = Array.from(
      { length: val.total_questions },
      (_, i) => String(i + 1)
    );

    // Every question 1..N must have an answer
    for (const q of expected) {
      if (!val.answer_key[q]) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["answer_key", q],
          message: `Question ${q} is missing an answer.`,
        });
      }
    }

    // No stray entries beyond N
    const extras = Object.keys(val.answer_key).filter(
      (k) => Number(k) > val.total_questions
    );
    if (extras.length > 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["answer_key"],
        message: `Answer key has ${extras.length} extra entr${
          extras.length === 1 ? "y" : "ies"
        } beyond Q${val.total_questions}.`,
      });
    }

    // Guard: every entry must be within 1..N (covers "0", "1000", etc.)
    const outOfRange = Object.keys(val.answer_key).filter((k) => {
      const n = Number(k);
      return !Number.isInteger(n) || n < 1 || n > val.total_questions;
    });
    if (outOfRange.length > 0 && extras.length === 0) {
      // avoid duplicate error if "extras" already reported the same keys
      const sample = outOfRange.slice(0, 3).join(", ");
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["answer_key"],
        message: `Answer key contains out-of-range question numbers: ${sample}${
          outOfRange.length > 3 ? "…" : ""
        }`,
      });
    }
  });

export type ExamPayloadInput = z.infer<typeof examPayloadSchema>;

/**
 * Parse a pasted key of ANY length.
 * Accepts A–D (any case) and Bengali ক / খ / গ / ঘ.
 * Ignores whitespace, digits, punctuation.
 * Returns null only if no valid letters are present.
 */
export function parsePastedKey(
  raw: string
): Record<string, "A" | "B" | "C" | "D"> | null {
  // Accept Latin (case-insensitive) and Bengali equivalents.
  // Note: we do NOT use .toUpperCase() on the whole string because Bengali
  // letters have no upper/lower case — we normalize per-character instead.
  const bengaliToLatin: Record<string, "A" | "B" | "C" | "D"> = {
    ক: "A",
    খ: "B",
    গ: "C",
    ঘ: "D",
  };

  const out: Record<string, "A" | "B" | "C" | "D"> = {};
  let n = 0;

  for (const ch of raw) {
    let letter: "A" | "B" | "C" | "D" | null = null;

    const bn = bengaliToLatin[ch];
    if (bn) {
      letter = bn;
    } else {
      const upper = ch.toUpperCase();
      if (upper === "A" || upper === "B" || upper === "C" || upper === "D") {
        letter = upper;
      }
    }

    if (letter) {
      n += 1;
      out[String(n)] = letter;
    }
  }

  return n === 0 ? null : out;
}