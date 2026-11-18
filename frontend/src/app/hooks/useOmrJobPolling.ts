"use client";

import { useEffect, useState } from "react";
import { subscribeJob } from "../lib/jobPoller";
import type { OmrBatchResult, OmrJobStatus } from "../types/omr";

export function useOmrJobPolling(jobId: string | null) {
  const [status, setStatus] = useState<OmrJobStatus | null>(null);
  const [result, setResult] = useState<OmrBatchResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!jobId) {
      setStatus(null);
      setResult(null);
      setError(null);
      return;
    }
    const off = subscribeJob(jobId, {
      onStatus: setStatus,
      onResult: setResult,
      onError: setError,
    });
    return off;
  }, [jobId]);

  return { status, result, error };
}