"use client";

import { useState, lazy, Suspense } from "react";
import { Skeleton } from "../components/ui/skeleton";
import JobStatusBanner from "../components/JobStatusBanner";
import { useOmrJobPolling } from "../hooks/useOmrJobPolling";
import { useJobs, addJob, removeJob } from "../lib/jobsStore";
import { Button } from "../components/ui/button";
import type { ExamResponse, SheetResultItem } from "../types/omr";

const AnswerKeyForm = lazy(() => import("../components/AnswerKeyForm"));
const AnswerKeyList = lazy(() => import("../components/AnswerKeyList"));
const SheetUploader = lazy(() => import("../components/SheetUploader"));
const ResultsDataTable = lazy(() => import("../components/ResultsDataTable"));
const SheetDetailDialog = lazy(() => import("../components/SheetDetailDialog"));

type Tab = "scan" | "keys";

export default function Dashboard({ initialExams }: { initialExams: ExamResponse[] }) {
  const [tab, setTab] = useState<Tab>("scan");
  const [jobId, setJobId] = useState<string | null>(null);
  const [selected, setSelected] = useState<SheetResultItem | null>(null);
  const [editing, setEditing] = useState<ExamResponse | null>(null);
  const jobs = useJobs();
  const { status, result, error } = useOmrJobPolling(jobId);

  const handleUploaded = (id: string, file: File) => {
    addJob({ jobId: id, filename: file.name, createdAt: Date.now() });
    setJobId(id);
  };

  return (
    <div className="stack">
      <div className="tabs" role="tablist">
        <button role="tab" aria-selected={tab === "scan"} className={`tab ${tab === "scan" ? "tab-on" : ""}`} onClick={() => setTab("scan")}>Scan & Evaluate</button>
        <button role="tab" aria-selected={tab === "keys"} className={`tab ${tab === "keys" ? "tab-on" : ""}`} onClick={() => setTab("keys")}>Manage Answer Keys</button>
      </div>

      {tab === "scan" && (
        <div className="stack">
          <Suspense fallback={<Skeleton className="skeleton-lg" />}>
            <SheetUploader onUploaded={handleUploaded} />
          </Suspense>
          <JobStatusBanner status={status} error={error} />
          {result && (
            <Suspense fallback={<Skeleton className="skeleton-lg" />}>
              <ResultsDataTable result={result} onRowClick={setSelected} />
            </Suspense>
          )}
          {jobs.length > 0 && (
            <section className="card">
              <div className="card-header"><h2>Recent jobs</h2></div>
              <div className="card-content">
                <ul className="file-list">
                  {jobs.slice(0, 20).map((j) => (
                    <li key={j.jobId} className="file-item">
                      <button className="link" onClick={() => setJobId(j.jobId)}>
                        {j.filename} <span className="muted">— {new Date(j.createdAt).toLocaleString()}</span>
                      </button>
                      <Button variant="ghost" onClick={() => removeJob(j.jobId)}>Remove</Button>
                    </li>
                  ))}
                </ul>
              </div>
            </section>
          )}
        </div>
      )}

      {tab === "keys" && (
        <div className="stack">
          <Suspense fallback={<Skeleton className="skeleton-lg" />}>
            <AnswerKeyForm
  key={editing?.exam_id ?? "new"}
  initial={editing}
  onSaved={(e) => setEditing(e)}
/>
          </Suspense>
          <Suspense fallback={<Skeleton className="skeleton-lg" />}>
            <AnswerKeyList initial={initialExams} onSelect={setEditing} />
          </Suspense>
        </div>
      )}

      {selected && (
        <Suspense fallback={null}>
          <SheetDetailDialog row={selected} onClose={() => setSelected(null)} />
        </Suspense>
      )}
    </div>
  );
}