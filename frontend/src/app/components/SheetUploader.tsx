"use client";

import { useRef, useState } from "react";
import { AnimatePresence, m } from "framer-motion";
import { Upload, X, RotateCcw } from "lucide-react";
import { useUploadQueue } from "../hooks/useUploadQueue";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Progress } from "../components/ui/progress";

export default function SheetUploader({
  onUploaded,
}: {
  onUploaded: (jobId: string, file: File) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const [fallbackClass, setFallbackClass] = useState("");
  const [fallbackSubject, setFallbackSubject] = useState("");
  const { items, addFiles, remove, start } = useUploadQueue(onUploaded);

  return (
    <section className="card">
      <div className="card-header"><h2>Upload OMR Sheets</h2></div>
      <div className="card-content stack">
        <div
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragOver(false);
            if (e.dataTransfer.files.length) void addFiles(e.dataTransfer.files);
          }}
          onClick={() => inputRef.current?.click()}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") inputRef.current?.click(); }}
          className={`dropzone ${dragOver ? "dropzone-on" : ""}`}
        >
          <Upload size={28} />
          <p>Drop JPG / PNG / PDF here, or click to choose (max 200 files)</p>
          <input
            ref={inputRef}
            type="file"
            multiple
            accept=".pdf,.jpg,.jpeg,.png"
            hidden
            onChange={(e) => { if (e.target.files) void addFiles(e.target.files); }}
          />
        </div>

        <div className="row">
          <div className="field">
            <Label htmlFor="fbcls">Fallback Class (optional)</Label>
            <Input id="fbcls" value={fallbackClass} onChange={(e) => setFallbackClass(e.target.value)} />
          </div>
          <div className="field">
            <Label htmlFor="fbsub">Fallback Subject (optional)</Label>
            <Input id="fbsub" value={fallbackSubject} onChange={(e) => setFallbackSubject(e.target.value)} />
          </div>
        </div>

        <AnimatePresence>
          {items.length > 0 && (
            <m.ul
              className="file-list"
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            >
              {items.map((it) => (
                <m.li key={it.id} layout className="file-item">
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div className="file-name">{it.file.name}</div>
                    <div className="muted">{(it.file.size / 1024).toFixed(1)} KB</div>
                    {it.status === "uploading" && <Progress value={it.progress} />}
                    {it.status === "error" && <div className="error">{it.error}</div>}
                    {it.status === "done" && <div className="muted">Queued job {it.jobId?.slice(0, 8)}…</div>}
                  </div>
                  <Button variant="ghost" aria-label="Remove" onClick={() => remove(it.id)}>
                    <X size={16} />
                  </Button>
                </m.li>
              ))}
            </m.ul>
          )}
        </AnimatePresence>

        <div className="row">
          <Button onClick={() => start(fallbackClass || undefined, fallbackSubject || undefined)} disabled={items.every((i) => i.status !== "ready")}>
            <RotateCcw size={16} /> Upload & Process
          </Button>
        </div>
      </div>
    </section>
  );
}