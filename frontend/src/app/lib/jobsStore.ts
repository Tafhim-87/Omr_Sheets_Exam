"use client";

import { useSyncExternalStore } from "react";
import type { PersistedJob } from "../types/omr";

const KEY = "omr.jobs.v1";
const CAP = 100;
const listeners = new Set<() => void>();
let cache: PersistedJob[] | null = null;

function read(): PersistedJob[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as PersistedJob[];
    return Array.isArray(parsed) ? parsed.filter((j) => j && typeof j.jobId === "string") : [];
  } catch {
    return [];
  }
}

function write(list: PersistedJob[]) {
  cache = list.slice(0, CAP);
  try {
    window.localStorage.setItem(KEY, JSON.stringify(cache));
  } catch {
    /* quota */
  }
  listeners.forEach((l) => l());
}

export function addJob(job: PersistedJob) {
  const list = read().filter((j) => j.jobId !== job.jobId);
  write([job, ...list]);
}

export function removeJob(jobId: string) {
  write(read().filter((j) => j.jobId !== jobId));
}

function getSnapshot(): PersistedJob[] {
  if (cache == null) cache = read();
  return cache;
}

function getServerSnapshot(): PersistedJob[] {
  return [];
}

export function useJobs(): PersistedJob[] {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      if (typeof window !== "undefined") {
        window.addEventListener("storage", cb);
        return () => {
          listeners.delete(cb);
          window.removeEventListener("storage", cb);
        };
      }
      return () => listeners.delete(cb);
    },
    getSnapshot,
    getServerSnapshot
  );
}