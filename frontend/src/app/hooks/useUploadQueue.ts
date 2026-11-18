"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "../lib/api";
import { validateFile } from "../lib/files";
import { config } from "../lib/config";

export type UploadItem = {
  id: string;
  file: File;
  status: "validating" | "ready" | "uploading" | "done" | "error" | "cancelled";
  progress: number;
  jobId?: string;
  error?: string;
};

let idCounter = 0;
const nextId = () => `f${++idCounter}-${Math.random().toString(36).slice(2, 8)}`;

export function useUploadQueue(onUploaded: (jobId: string, file: File) => void) {
  const [items, setItems] = useState<UploadItem[]>([]);
  const running = useRef(0);
  const aborts = useRef(new Map<string, AbortController>());
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      aborts.current.forEach((c) => c.abort());
      aborts.current.clear();
    };
  }, []);

  const update = useCallback((id: string, patch: Partial<UploadItem>) => {
    if (!mounted.current) return;
    setItems((prev) => prev.map((it) => (it.id === id ? { ...it, ...patch } : it)));
  }, []);

  const addFiles = useCallback(
    async (files: FileList | File[]) => {
      const arr = Array.from(files).slice(0, 200);
      const newItems: UploadItem[] = arr.map((file) => ({
        id: nextId(),
        file,
        status: "validating",
        progress: 0,
      }));
      setItems((prev) => [...prev, ...newItems]);
      for (const item of newItems) {
        const v = await validateFile(item.file);
        if (v.ok) update(item.id, { status: "ready" });
        else update(item.id, { status: "error", error: v.reason ?? "Invalid file" });
      }
    },
    [update]
  );

  const remove = useCallback((id: string) => {
    const c = aborts.current.get(id);
    c?.abort();
    aborts.current.delete(id);
    setItems((prev) => prev.filter((it) => it.id !== id));
  }, []);

  const start = useCallback(
    (fallbackClass?: string, fallbackSubject?: string) => {
      const ready = items.filter((it) => it.status === "ready");
      for (const it of ready) {
        void (async () => {
          while (running.current >= config.uploadConcurrency) {
            await new Promise((r) => setTimeout(r, 50));
          }
          running.current++;
          const ctrl = new AbortController();
          aborts.current.set(it.id, ctrl);
          update(it.id, { status: "uploading", progress: 0 });

          const fd = new FormData();
          fd.append("file", it.file);

          try {
            // XHR for progress
            const jobId = await new Promise<string>((resolve, reject) => {
              const xhr = new XMLHttpRequest();
              const url = `${
                process.env.NEXT_PUBLIC_API_BASE_URL ?? ""
              }/api/omr/upload${
                (() => {
                  const p = new URLSearchParams();
                  if (fallbackClass) p.set("class", fallbackClass);
                  if (fallbackSubject) p.set("subject", fallbackSubject);
                  const s = p.toString();
                  return s ? `?${s}` : "";
                })()
              }`;
              xhr.open("POST", url);
              xhr.upload.onprogress = (e) => {
                if (e.lengthComputable) {
                  update(it.id, { progress: Math.round((e.loaded / e.total) * 100) });
                }
              };
              xhr.onload = () => {
                if (xhr.status >= 200 && xhr.status < 300) {
                  try {
                    const j = JSON.parse(xhr.responseText) as { job_id?: string };
                    if (j.job_id) resolve(j.job_id);
                    else reject(new Error("Missing job_id"));
                  } catch {
                    reject(new Error("Invalid response"));
                  }
                } else reject(new Error(`Upload failed (${xhr.status})`));
              };
              xhr.onerror = () => reject(new Error("Network error"));
              xhr.onabort = () => reject(new Error("Aborted"));
              ctrl.signal.addEventListener("abort", () => xhr.abort());
              xhr.send(fd);
            });
            update(it.id, { status: "done", progress: 100, jobId });
            onUploaded(jobId, it.file);
          } catch (err) {
            update(it.id, {
              status: "error",
              error: err instanceof Error ? err.message : "Upload failed",
            });
          } finally {
            running.current--;
            aborts.current.delete(it.id);
          }
        })();
      }
    },
    [items, update, onUploaded]
  );

  return { items, addFiles, remove, start };
}