"use client";

import { useState } from "react";
import { m } from "framer-motion";
import { api } from "../lib/api";
import {
  examPayloadSchema,
  parsePastedKey,
  MIN_QUESTIONS,
  MAX_QUESTIONS,
} from "../lib/validators";
import type { ExamResponse, OptionLetter } from "../types/omr";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Badge } from "../components/ui/badge";
import { useToast } from "../components/ui/toast";

const OPTIONS: OptionLetter[] = ["A", "B", "C", "D"];
const LABEL: Record<OptionLetter, string> = {
  A: "A / ক", B: "B / খ", C: "C / গ", D: "D / ঘ",
};
const CLASSES = ["3", "4", "5", "6", "7", "8", "9", "10", "11", "12"];

export default function AnswerKeyForm({
  initial,
  onSaved,
}: {
  initial?: ExamResponse | null;
  onSaved?: (e: ExamResponse) => void;
}) {
  const toast = useToast();
  const [className, setClassName] = useState(initial?.class ?? "5");
  const [subjectCode, setSubjectCode] = useState(initial?.subject_code ?? "103");
  const [title, setTitle] = useState(initial?.title ?? "");
  const [marksPerQuestion, setMarksPerQuestion] = useState(
    initial?.marks_per_question ?? 1
  );
  const [totalQuestions, setTotalQuestions] = useState(
    initial?.total_questions ?? 30
  );
  const [key, setKey] = useState<Record<string, OptionLetter>>(
    initial?.answer_key ?? {}
  );
  const [paste, setPaste] = useState("");
  const [saving, setSaving] = useState(false);
  const [savedVersion, setSavedVersion] = useState<number | null>(
    initial?.version ?? null
  );
  const [err, setErr] = useState<string | null>(null);

  // If the user shrinks the question count, drop orphan answers
  const changeTotalQuestions = (n: number) => {
    const clamped = Math.max(MIN_QUESTIONS, Math.min(MAX_QUESTIONS, n || MIN_QUESTIONS));
    setTotalQuestions(clamped);
    setKey((prev) => {
      const next: Record<string, OptionLetter> = {};
      for (const [k, v] of Object.entries(prev)) {
        if (Number(k) <= clamped) next[k] = v;
      }
      return next;
    });
  };

  const filled = Object.keys(key).length;
  const allFilled = filled === totalQuestions;

  const setAns = (q: number, o: OptionLetter) => {
    setKey((prev) => ({ ...prev, [String(q)]: o }));
  };

 const applyPaste = () => {
  const parsed = parsePastedKey(paste);
  if (!parsed) {
    setErr("Paste at least one letter (A–D or ক–ঘ).");
    return;
  }

  const count = Object.keys(parsed).length;

  if (count > MAX_QUESTIONS) {
    setErr(
      `Pasted ${count} letters, but the maximum is ${MAX_QUESTIONS}. Trim the paste or split it into multiple exams.`
    );
    return;
  }

  // Auto-grow / auto-shrink the question count to match the paste.
  // This is the fix: instead of rejecting, we adapt.
  const previousCount = totalQuestions;
  setTotalQuestions(count);
  setKey(parsed);
  setErr(null);

  if (count !== previousCount) {
    toast.push(
      `Question count updated ${previousCount} → ${count} to match pasted key.`,
      "info"
    );
  } else {
    toast.push(`Pasted ${count}-question key.`, "success");
  }
};

  const save = async () => {
    setErr(null);
    const parsed = examPayloadSchema.safeParse({
      class: className,
      subject_code: subjectCode,
      title: title.trim() || undefined,
      marks_per_question: marksPerQuestion,
      total_questions: totalQuestions,
      answer_key: key,
    });
    if (!parsed.success) {
      setErr(parsed.error.issues[0]?.message ?? "Invalid form.");
      return;
    }
    setSaving(true);
    try {
      const exam = await api.upsertAnswerKey(parsed.data);
      setSavedVersion(exam.version);
      onSaved?.(exam);
      toast.push(`Saved v${exam.version}`, "success");
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="card">
      <div className="card-header" style={{ display: "flex", justifyContent: "space-between" }}>
        <h2>Answer Key</h2>
        {savedVersion != null && <Badge variant="success">Saved v{savedVersion}</Badge>}
      </div>
      <div className="card-content stack">
        <div className="row" style={{ flexWrap: "wrap" }}>
          <div className="field">
            <Label htmlFor="cls">Class</Label>
            <select
              id="cls"
              value={className}
              onChange={(e) => setClassName(e.target.value)}
              className="input"
            >
              {CLASSES.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>
          <div className="field">
            <Label htmlFor="subj">Subject (3-digit)</Label>
            <Input
              id="subj"
              value={subjectCode}
              onChange={(e) => setSubjectCode(e.target.value)}
              maxLength={3}
              inputMode="numeric"
            />
          </div>
          <div className="field">
            <Label htmlFor="totalQs">Total Questions</Label>
            <Input
              id="totalQs"
              type="number"
              min={MIN_QUESTIONS}
              max={MAX_QUESTIONS}
              value={totalQuestions}
              onChange={(e) => changeTotalQuestions(Number(e.target.value))}
            />
          </div>
          <div className="field">
            <Label htmlFor="title">Title (optional)</Label>
            <Input
              id="title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </div>
          <div className="field">
            <Label htmlFor="mpq">Marks per Q</Label>
            <Input
              id="mpq"
              type="number"
              step="0.25"
              min="0.25"
              value={marksPerQuestion}
              onChange={(e) => setMarksPerQuestion(Number(e.target.value) || 1)}
            />
          </div>
        </div>

        <div className="row">
          <div className="field" style={{ flex: 1 }}>
            <Label htmlFor="paste">
              Paste a key ({totalQuestions} letters)
            </Label>
            <div className="row">
              <Input
                id="paste"
                value={paste}
                onChange={(e) => setPaste(e.target.value)}
                placeholder={totalQuestions === 30 ? "BBCDA..." : `${totalQuestions} letters`}
              />
              <Button type="button" variant="outline" onClick={applyPaste}>
                Apply
              </Button>
            </div>
          </div>
        </div>

        <div className="grid-2">
          {Array.from({ length: totalQuestions }, (_, i) => i + 1).map((q) => (
            <div key={q} className="q-row">
              <span className="q-num">Q{q}</span>
              {OPTIONS.map((o) => {
                const sel = key[String(q)] === o;
                return (
                  <m.button
                    key={o}
                    type="button"
                    whileTap={{ scale: 0.92 }}
                    onClick={() => setAns(q, o)}
                    aria-pressed={sel}
                    aria-label={`Q${q} option ${o}`}
                    className={`bubble ${sel ? "bubble-on" : ""}`}
                  >
                    {LABEL[o]}
                  </m.button>
                );
              })}
            </div>
          ))}
        </div>

        <div
          className="row"
          style={{ justifyContent: "space-between", alignItems: "center" }}
        >
          <span className="muted">
            {filled}/{totalQuestions} filled
          </span>
          <Button onClick={save} disabled={saving || !allFilled}>
            {saving ? "Saving…" : "Save Answer Key"}
          </Button>
        </div>

        {err && (
          <p className="error" role="alert">
            {err}
          </p>
        )}
      </div>
    </section>
  );
}