"use client";

import { config, isDirectMode } from "./config";
import { normalizeBatchResult, normalizeExam, normalizeJobStatus } from "./normalize";
import type {
  ExamResponse,
  ExamUpsertPayload,
  OmrBatchResult,
  OmrJobStatus,
  OmrUploadResponse,
} from "../types/omr";

const base = isDirectMode ? config.publicApiBaseUrl : "";
const inflight = new Map<string, Promise<unknown>>();

const RETRYABLE_STATUS = new Set([429, 502, 503, 504]);

async function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function fetchJson(url: string, init: RequestInit, attempt = 0): Promise<Response> {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), config.requestTimeoutMs);
  try {
    const res = await fetch(url, { ...init, signal: controller.signal });
    if (res.ok) return res;
    if (attempt < 3 && RETRYABLE_STATUS.has(res.status)) {
      const ra = Number(res.headers.get("retry-after"));
      const backoff = Number.isFinite(ra)
        ? ra * 1000
        : Math.min(2000 * 2 ** attempt, 8000) + Math.random() * 250;
      await sleep(backoff);
      return fetchJson(url, init, attempt + 1);
    }
    throw new Error(await safeMessage(res));
  } finally {
    clearTimeout(t);
  }
}

async function safeMessage(res: Response): Promise<string> {
  try {
    const j = (await res.json()) as { detail?: string; message?: string };
    return j.detail ?? j.message ?? `Request failed (${res.status})`;
  } catch {
    return `Request failed (${res.status})`;
  }
}

function dedup<T>(key: string, run: () => Promise<T>): Promise<T> {
  const existing = inflight.get(key) as Promise<T> | undefined;
  if (existing) return existing;
  const p = run().finally(() => inflight.delete(key));
  inflight.set(key, p);
  return p;
}

export const api = {
  upsertAnswerKey(payload: ExamUpsertPayload): Promise<ExamResponse> {
    return dedup(`upsert:${payload.class}:${payload.subject_code}`, async () => {
      const res = await fetchJson(`${base}/api/exams`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      return normalizeExam(await res.json());
    });
  },

  listExams(className?: string, subjectCode?: string): Promise<ExamResponse[]> {
    const params = new URLSearchParams();
    if (className) params.set("class", className);
    if (subjectCode) params.set("subject_code", subjectCode);
    const qs = params.toString();
    const key = `listExams:${qs}`;
    return dedup(key, async () => {
      const res = await fetchJson(`${base}/api/exams${qs ? `?${qs}` : ""}`, {
        method: "GET",
        cache: "no-store",
      });
      const data = (await res.json()) as unknown;
      if (Array.isArray(data)) return data.map(normalizeExam);
      // Some backends return { items: [...] }
      const o = data as { items?: unknown };
      return Array.isArray(o.items) ? o.items.map(normalizeExam) : [];
    });
  },

  uploadSheet(formData: FormData, fallbackClass?: string, fallbackSubject?: string): Promise<OmrUploadResponse> {
    const params = new URLSearchParams();
    if (fallbackClass) params.set("class", fallbackClass);
    if (fallbackSubject) params.set("subject", fallbackSubject);
    const qs = params.toString();
    return (async () => {
      const res = await fetchJson(`${base}/api/omr/upload${qs ? `?${qs}` : ""}`, {
        method: "POST",
        body: formData,
      });
      return (await res.json()) as OmrUploadResponse;
    })();
  },

  async getJobStatus(jobId: string): Promise<OmrJobStatus> {
    const res = await fetchJson(`${base}/api/omr/status/${encodeURIComponent(jobId)}`, {
      method: "GET",
      cache: "no-store",
    });
    return normalizeJobStatus(await res.json());
  },

  async getJobResults(jobId: string): Promise<OmrBatchResult> {
    const res = await fetchJson(`${base}/api/omr/results/${encodeURIComponent(jobId)}`, {
      method: "GET",
      cache: "no-store",
    });
    return normalizeBatchResult(await res.json());
  },
};