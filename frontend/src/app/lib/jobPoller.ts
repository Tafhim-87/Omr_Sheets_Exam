"use client";

import { config } from "./config";
import { api } from "./api";
import type { OmrBatchResult, OmrJobStatus } from "../types/omr";

type Sub = {
  onStatus: (s: OmrJobStatus) => void;
  onResult?: (r: OmrBatchResult) => void;
  onError: (e: string) => void;
};

type Entry = {
  jobId: string;
  subs: Set<Sub>;
  status: OmrJobStatus | null;
  result: OmrBatchResult | null;
  errors: number;
  intervalMs: number;
  startedAt: number;
  timer: ReturnType<typeof setTimeout> | null;
  running: boolean;
};

const entries = new Map<string, Entry>();
const TERMINAL: OmrJobStatus["status"][] = ["completed", "failed"];
const queue: string[] = [];
let active = 0;

function schedule() {
  while (active < config.pollConcurrency && queue.length > 0) {
    const jobId = queue.shift()!;
    const entry = entries.get(jobId);
    if (!entry) continue;
    if (typeof document !== "undefined" && document.hidden) {
      queue.unshift(jobId);
      return;
    }
    active++;
    void tick(entry).finally(() => {
      active--;
      schedule();
    });
  }
}

async function tick(entry: Entry) {
  if (entry.running) return;
  entry.running = true;
  try {
    if (Date.now() - entry.startedAt > config.pollMaxDurationMs) {
      entry.subs.forEach((s) => s.onError("Polling timed out."));
      cleanup(entry.jobId);
      return;
    }
    const status = await api.getJobStatus(entry.jobId);
    entry.status = status;
    entry.errors = 0;
    entry.subs.forEach((s) => s.onStatus(status));

    if (status.status === "completed" || status.status === "processing") {
      // fetch results once completed
    }
    if (status.status === "completed" && entry.result == null) {
      const result = await api.getJobResults(entry.jobId);
      entry.result = result;
      entry.subs.forEach((s) => s.onResult?.(result));
    }
    if (TERMINAL.includes(status.status)) {
      cleanup(entry.jobId);
      return;
    }
    entry.intervalMs = Math.min(
      entry.intervalMs * config.pollFactor,
      config.pollIntervalMaxMs
    );
    entry.timer = setTimeout(() => {
      queue.push(entry.jobId);
      schedule();
    }, entry.intervalMs);
  } catch (err) {
    entry.errors++;
    entry.subs.forEach((s) => s.onError(err instanceof Error ? err.message : "Polling error"));
    if (entry.errors >= config.pollMaxErrors) {
      cleanup(entry.jobId);
      return;
    }
    entry.intervalMs = Math.min(entry.intervalMs * config.pollFactor, config.pollIntervalMaxMs);
    entry.timer = setTimeout(() => {
      queue.push(entry.jobId);
      schedule();
    }, entry.intervalMs);
  } finally {
    entry.running = false;
  }
}

function cleanup(jobId: string) {
  const e = entries.get(jobId);
  if (!e) return;
  if (e.timer) clearTimeout(e.timer);
  entries.delete(jobId);
}

export function subscribeJob(jobId: string, sub: Sub): () => void {
  let entry = entries.get(jobId);
  if (!entry) {
    entry = {
      jobId,
      subs: new Set(),
      status: null,
      result: null,
      errors: 0,
      intervalMs: config.pollIntervalBaseMs,
      startedAt: Date.now(),
      timer: null,
      running: false,
    };
    entries.set(jobId, entry);
    queue.push(jobId);
    schedule();
  }
  entry.subs.add(sub);
  if (entry.status) sub.onStatus(entry.status);
  if (entry.result) sub.onResult?.(entry.result);

  const off = () => {
    entry!.subs.delete(sub);
    if (entry!.subs.size === 0) cleanup(jobId);
  };
  return off;
}

if (typeof document !== "undefined") {
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) schedule();
  });
}