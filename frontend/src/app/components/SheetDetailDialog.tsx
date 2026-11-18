"use client";

import { useEffect, useRef } from "react";
import { XCircle, CheckCircle2, Circle, AlertTriangle } from "lucide-react";
import type { SheetResultItem } from "../types/omr";
import { REVIEW_MESSAGE_BN } from "../lib/format";

export default function SheetDetailDialog({
  row,
  onClose,
}: {
  row: SheetResultItem | null;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (row && !el.open) el.showModal();
    if (!row && el.open) el.close();
  }, [row]);

  return (
    <dialog ref={ref} className="dialog" onClose={onClose}>
      {row && (
        <div className="stack">
          <div className="row" style={{ justifyContent: "space-between" }}>
            <h2>Sheet — Page {row.page ?? "?"}</h2>
            <button className="btn btn-ghost" onClick={onClose} aria-label="Close">✕</button>
          </div>

          {row.needs_review && (
            <div className="banner banner-warning">
              <AlertTriangle size={16} />
              <strong>{REVIEW_MESSAGE_BN}</strong>
            </div>
          )}

          <div className="grid-2">
            <div>Class: <strong>{row.class ?? "—"}</strong></div>
            <div>Section: <strong>{row.section ?? "—"}</strong></div>
            <div>Subject: <strong>{row.subject ?? "—"}</strong></div>
            <div>Roll: <strong>{row.roll ?? "—"}</strong></div>
            <div>Reg: <strong>{row.reg ?? "—"}</strong></div>
            <div>MCQ: <strong>{row.mcq ?? "—"}</strong></div>
          </div>

          <div className="row" style={{ flexWrap: "wrap" }}>
            <span className="chip chip-ok"><CheckCircle2 size={14} /> Right {row.right}</span>
            <span className="chip chip-bad"><XCircle size={14} /> Wrong {row.wrong}</span>
            <span className="chip"><Circle size={14} /> Unanswered {row.unanswered}</span>
          </div>

          {row.review_reasons && row.review_reasons.length > 0 && (
            <div>
              <h3>Review reasons</h3>
              <ul>{row.review_reasons.map((r, i) => <li key={i}>{r}</li>)}</ul>
            </div>
          )}

          {row.wrong_answers && row.wrong_answers.length > 0 && (
            <div>
              <h3>Wrong answers</h3>
              <table className="table">
                <thead><tr><th>Q</th><th>Marked</th><th>Correct</th></tr></thead>
                <tbody>
                  {row.wrong_answers.map((w, i) => (
                    <tr key={i}><td>{w.question}</td><td>{w.marked ?? "—"}</td><td>{w.correct ?? "—"}</td></tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {row.message && <p className="muted">{row.message}</p>}
        </div>
      )}
    </dialog>
  );
}