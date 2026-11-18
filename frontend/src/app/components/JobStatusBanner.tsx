"use client";

import { m } from "framer-motion";
import { CheckCircle2, AlertTriangle, Loader2 } from "lucide-react";
import type { OmrJobStatus } from "../types/omr";

export default function JobStatusBanner({
  status,
  error,
}: {
  status: OmrJobStatus | null;
  error: string | null;
}) {
  if (!status && !error) return null;

  const s = error ? "failed" : status?.status ?? "pending";
  const variant =
    s === "failed" ? "danger" :
    s === "completed" ? "success" :
    "info";

  return (
    <m.div
      role="status"
      aria-live="polite"
      initial={{ opacity: 0, y: -6 }}
      animate={{ opacity: 1, y: 0 }}
      className={`banner banner-${variant}`}
    >
      {s === "processing" || s === "pending" ? (
        <m.span animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 1.1, ease: "linear" }}>
          <Loader2 size={16} />
        </m.span>
      ) : s === "failed" ? <AlertTriangle size={16} /> : <CheckCircle2 size={16} />}
      <div>
        <strong>
          {s === "pending" && "Queued…"}
          {s === "processing" && "Processing…"}
          {s === "completed" && "Completed"}
          {s === "failed" && "Failed"}
        </strong>
        {error && <div>{error}</div>}
        {status?.progress != null && <div>{status.progress}%</div>}
      </div>
    </m.div>
  );
}