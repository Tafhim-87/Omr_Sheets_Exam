"use client";

import { useEffect, useRef } from "react";
import type { ExamResponse, OptionLetter } from "../types/omr";
import { Button } from "../components/ui/button";
import { Badge } from "../components/ui/badge";
import { formatDateTime } from "../lib/format";

const OPTIONS: OptionLetter[] = ["A", "B", "C", "D"];
const LABEL: Record<OptionLetter, string> = {
  A: "A / ক",
  B: "B / খ",
  C: "C / গ",
  D: "D / ঘ",
};

export default function AnswerKeyDetailDialog({
  exam,
  onClose,
  onEdit,
}: {
  exam: ExamResponse | null;
  onClose: () => void;
  onEdit: (e: ExamResponse) => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (exam && !el.open) el.showModal();
    if (!exam && el.open) el.close();
  }, [exam]);

  return (
    <dialog ref={ref} className="dialog" onClose={onClose}>
      {exam && (
        <div className="stack">
          <div
            className="row"
            style={{ justifyContent: "space-between", alignItems: "flex-start" }}
          >
            <div>
              <h2 style={{ margin: 0 }}>
                Class {exam.class} — Subject {exam.subject_code}
              </h2>
              {exam.title && <p className="muted" style={{ margin: "4px 0 0" }}>{exam.title}</p>}
            </div>
            <button
              className="btn btn-ghost"
              onClick={onClose}
              aria-label="Close"
              type="button"
            >
              ✕
            </button>
          </div>

          <div className="row" style={{ flexWrap: "wrap" }}>
            <Badge variant="success">v{exam.version}</Badge>
            <Badge>Qs: {exam.total_questions}</Badge>
            <Badge>Marks/Q: {exam.marks_per_question}</Badge>
            <Badge variant="info">Updated: {formatDateTime(exam.updated_at)}</Badge>
          </div>

          <div>
            <h3 style={{ margin: "12px 0 8px" }}>Answer Key</h3>
            <div className="grid-2" style={{ maxHeight: 360, overflowY: "auto", paddingRight: 4 }}>
              {Array.from({ length: exam.total_questions }, (_, i) => i + 1).map((q) => {
                const chosen = exam.answer_key[String(q)];
                return (
                  <div key={q} className="q-row">
                    <span className="q-num">Q{q}</span>
                    {OPTIONS.map((o) => {
                      const sel = chosen === o;
                      return (
                        <span
                          key={o}
                          className={`bubble ${sel ? "bubble-on" : ""}`}
                          style={{ cursor: "default", opacity: sel ? 1 : 0.45 }}
                          aria-hidden={!sel}
                        >
                          {LABEL[o]}
                        </span>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          </div>

          <div
            className="row"
            style={{ justifyContent: "flex-end", gap: 8, marginTop: 8 }}
          >
            <Button variant="outline" onClick={onClose} type="button">
              Close
            </Button>
            <Button
              onClick={() => {
                onClose();
                onEdit(exam);
              }}
              type="button"
            >
              Edit this key
            </Button>
          </div>
        </div>
      )}
    </dialog>
  );
}