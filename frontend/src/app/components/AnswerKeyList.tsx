"use client";

import { useEffect, useMemo, useState } from "react";
import { api } from "../lib/api";
import type { ExamResponse } from "../types/omr";
import { Input } from "../components/ui/input";
import { Button } from "../components/ui/button";
import { formatDateTime } from "../lib/format";
import AnswerKeyDetailDialog from "./AnswerKeyDetailDialog";

export default function AnswerKeyList({
  initial,
  onSelect,
}: {
  initial: ExamResponse[];
  onSelect?: (e: ExamResponse) => void;
}) {
  const [items, setItems] = useState<ExamResponse[]>(initial);
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(false);
  const [viewing, setViewing] = useState<ExamResponse | null>(null);

  const refresh = async () => {
    setLoading(true);
    try {
      setItems(await api.listExams());
    } finally {
      setLoading(false);
    }
  };

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return items;
    return items.filter(
      (e) =>
        e.class.toLowerCase().includes(s) ||
        e.subject_code.toLowerCase().includes(s) ||
        (e.title ?? "").toLowerCase().includes(s)
    );
  }, [items, q]);

  if (items.length === 0) {
    return <p className="muted">No answer keys saved yet.</p>;
  }

  return (
    <>
      <section className="card">
        <div
          className="card-header"
          style={{ display: "flex", gap: 8, justifyContent: "space-between", flexWrap: "wrap" }}
        >
          <h2>Saved Answer Keys</h2>
          <div className="row">
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search class / subject"
            />
            <Button variant="outline" onClick={refresh} disabled={loading}>
              {loading ? "…" : "Refresh"}
            </Button>
          </div>
        </div>
        <div className="card-content">
          <table className="table">
            <thead>
              <tr>
                <th>Class</th>
                <th>Subject</th>
                <th>Title</th>
                <th>Qs</th>
                <th>Marks/Q</th>
                <th>Version</th>
                <th>Updated</th>
                <th aria-label="actions" />
              </tr>
            </thead>
            <tbody>
              {filtered.map((e) => (
                <tr
                  key={e.exam_id}
                  className="clickable"
                  onClick={() => setViewing(e)}
                  tabIndex={0}
                  onKeyDown={(ev) => {
                    if (ev.key === "Enter" || ev.key === " ") {
                      ev.preventDefault();
                      setViewing(e);
                    }
                  }}
                >
                  <td>{e.class}</td>
                  <td>{e.subject_code}</td>
                  <td>{e.title ?? "—"}</td>
                  <td>{e.total_questions}</td>
                  <td>{e.marks_per_question}</td>
                  <td>v{e.version}</td>
                  <td>{formatDateTime(e.updated_at)}</td>
                  <td>
                    <Button
                      variant="ghost"
                      onClick={(ev) => {
                        ev.stopPropagation();
                        onSelect?.(e);
                      }}
                      aria-label={`Edit class ${e.class} subject ${e.subject_code}`}
                    >
                      Edit
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {viewing && (
        <AnswerKeyDetailDialog
          exam={viewing}
          onClose={() => setViewing(null)}
          onEdit={(e) => onSelect?.(e)}
        />
      )}
    </>
  );
}