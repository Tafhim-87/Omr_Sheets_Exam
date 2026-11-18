"use client";

import { useEffect, useState } from "react";
import { api } from "../lib/api";
import type { OmrBatchResult } from "../types/omr";

export function useJobResults(jobId: string | null) {
  const [data, setData] = useState<OmrBatchResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!jobId) {
      setData(null);
      return;
    }
    setLoading(true);
    api
      .getJobResults(jobId)
      .then(setData)
      .catch((e: unknown) =>
        setError(e instanceof Error ? e.message : "Failed to load results")
      )
      .finally(() => setLoading(false));
  }, [jobId]);

  return { data, error, loading };
}