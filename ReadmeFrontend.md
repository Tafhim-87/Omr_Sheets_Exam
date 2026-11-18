# OMR System --- Frontend README

## 1. Purpose

Build the frontend for an AI-powered Optical Mark Recognition (OMR)
evaluation platform.

The frontend uses **Next.js App Router** and communicates with a
separate **Python FastAPI backend**. It allows administrators and
teachers to manage exams, upload OMR sheets, monitor processing, review
uncertain recognition results, and export student results.

The project already has an OMR sheet template. Do not design a
replacement sheet.

**Existing OMR PDF:**\
https://www.omrsheet.com/upload-new/100-QUESTIONS/100%20Q%20omr.pdf

The backend must analyze this exact PDF and expose its template details.
The frontend should consume those details through APIs rather than
hardcoding sheet geometry.

## 2. Technology

-   Next.js (latest stable version), App Router
-   TypeScript preferred
-   React
-   Tailwind CSS for basic functional layout only
-   Axios or native Fetch
-   React Hook Form and Zod where useful
-   A suitable table and chart library only when needed

Do not spend time on elaborate styling, animations, or decorative UI.
Prioritize correct workflows, accessibility, responsive functionality,
and clear error states.

## 3. Core User Workflows

1.  Administrator creates an exam.
2.  Administrator selects the analyzed OMR template.
3.  Administrator configures question count, answer key, marks, and
    negative marking.
4.  Teacher uploads one or more scanned OMR sheets or PDFs.
5.  Frontend displays upload and processing progress.
6.  Backend returns recognized student information, answers, confidence,
    and evaluation.
7.  Teacher reviews uncertain answers and corrects them when necessary.
8.  Final results are saved and can be searched, filtered, and exported.

## 4. Required Pages

### Dashboard

Display data returned by the backend: - Number of exams - Number of
uploaded/processed sheets - Number of students - Average marks, where
meaningful - Processing status summary - Recent activity

Do not fabricate metrics. Show an empty state when no data exists.

### Exams

Features: - List, search, and view exams - Create and edit an exam -
Configure exam name, description, date, and template - Configure total
questions and available options - Configure marks per correct answer and
negative marks - Enter and validate the answer key - View exam
processing/results summary

The UI must validate that the answer key matches the configured question
count and allowed options.

### OMR Upload

Features: - Single-file and multiple-file upload - Drag-and-drop and
file picker - JPG, JPEG, PNG, and PDF validation - Preview supported
images/PDF metadata before upload - Select the target exam - Upload
progress and per-file status - Processing progress/status from the
backend - Retry failed uploads where supported - Clear, actionable error
messages

Do not assume a successful upload means successful recognition. Show
upload and processing states separately.

### Results

Features: - Results list with pagination - Search by student name, roll,
registration number, or student ID - Filter by exam and review status -
Sort by score and processing date - Individual result detail page -
Correct, incorrect, unanswered, multiple-marked, and uncertain counts -
Percentage and grade when configured - Export CSV/Excel where supported
by the backend

### Result Detail

Show: - Student and exam information - Total score and scoring
breakdown - Recognized answer for every question - Correct answer from
the answer-key version used - Per-question status and confidence -
Original uploaded sheet preview, if available - Recognition warnings and
processing metadata - Manual review status and correction history

Clearly distinguish the machine-recognized answer from the final
corrected answer.

### Manual Review

Allow authorized users to: - Open the original sheet image - Zoom and
inspect the relevant bubble area - See detected options,
scores/probabilities, and confidence - Select a corrected answer or mark
the response blank/invalid - Add a correction reason if required - Save
the correction - Approve the reviewed result

Require confirmation before finalizing a correction. Show the audit
history returned by the backend. Never silently overwrite the original
machine prediction.

### Template Management

Show available OMR templates and their analysis status. Display
supported question counts, options, page dimensions, and template
version when returned by the API.

Allow template analysis only if the backend exposes the operation and
the user has permission. Do not implement browser-side PDF geometry
detection.

## 5. API Integration

Use a centralized API client. Configure the backend base URL through an
environment variable:

``` env
NEXT_PUBLIC_API_BASE_URL=http://localhost:8000
```

Suggested API routes (coordinate exact request/response schemas with the
backend implementation):

### Templates

-   `POST /api/templates/analyze`
-   `GET /api/templates`
-   `GET /api/templates/{id}`

### Exams

-   `POST /api/exams`
-   `GET /api/exams`
-   `GET /api/exams/{id}`
-   `PUT /api/exams/{id}`
-   `DELETE /api/exams/{id}`

### OMR

-   `POST /api/omr/upload`
-   `POST /api/omr/batch-upload`
-   `POST /api/omr/process/{id}`
-   `GET /api/omr/status/{id}`
-   `GET /api/omr/results/{id}`

### Results

-   `GET /api/results`
-   `GET /api/results/{id}`
-   `PUT /api/results/{id}/correction`
-   `GET /api/results/export`

### ML status

-   `POST /api/ml/train` (admin-only, if training is exposed through the
    API)
-   `GET /api/ml/model-status`
-   `GET /api/ml/evaluation-metrics`

These are proposed contracts. Inspect the actual FastAPI OpenAPI schema
and adapt the frontend to the implemented request/response models. Do
not invent response fields.

## 6. Suggested Frontend Structure

``` text
frontend/
├── app/
│   ├── (dashboard)/
│   │   ├── dashboard/
│   │   ├── exams/
│   │   ├── upload/
│   │   ├── results/
│   │   └── templates/
│   ├── login/
│   ├── layout.tsx
│   └── page.tsx
├── components/
│   ├── layout/
│   ├── forms/
│   ├── tables/
│   ├── upload/
│   ├── omr/
│   └── feedback/
├── hooks/
├── lib/
│   ├── api-client.ts
│   ├── validators/
│   └── utils/
├── services/
│   ├── exams.ts
│   ├── omr.ts
│   ├── results.ts
│   └── templates.ts
├── types/
└── README.md
```

Keep components small and reusable. Keep API calls out of presentation
components where practical.

## 7. State, Errors, and Security

-   Use server components for data that can be fetched securely on the
    server.
-   Use client components only where interaction is required.
-   Handle loading, empty, success, and error states on every
    data-driven page.
-   Prevent duplicate submissions while requests are pending.
-   Handle expired sessions and unauthorized responses according to the
    backend auth design.
-   Never expose database credentials, private API keys, or backend
    secrets in `NEXT_PUBLIC_` variables.
-   Validate files on the frontend for user feedback, but enforce all
    security validation on the backend.
-   Do not trust student details, marks, or answer results supplied by
    the browser.
-   Restrict manual correction and exam-management actions to authorized
    roles.

Authentication is not assumed to be implemented yet. Confirm the
backend's authentication method before building protected routes.

## 8. Accessibility and Usability

-   Use semantic HTML and accessible labels.
-   Ensure all controls work with keyboard navigation.
-   Provide clear validation messages.
-   Do not communicate status using color alone.
-   Make tables usable on smaller screens.
-   Provide meaningful file names and upload status for assistive
    technology.

## 9. Testing

Add tests for: - Exam form validation - Answer-key validation - File
type and size feedback - Upload success and failure - Processing status
display - Result calculations as displayed by the API - Manual
correction workflow - Search, filtering, pagination, and exports

Mock API responses in frontend tests. Do not use fake metrics or claim
real recognition accuracy from frontend tests.

## 10. Development Order

1.  Inspect backend OpenAPI docs and agree on API schemas.
2.  Configure the API client and shared TypeScript types.
3.  Implement exam creation and answer-key management.
4.  Implement single and batch upload.
5.  Implement processing status.
6.  Implement result list and detail views.
7.  Implement manual review and correction.
8.  Implement template and model status views.
9.  Add tests, accessibility checks, and error handling.

## 11. Definition of Done

The frontend is complete when a user can create an exam, upload a real
sheet using the provided template, see backend processing status,
inspect returned recognition results, correct uncertain answers with an
audit trail, and view/export saved results.

Do not mark the workflow complete using mocked data. Clearly label any
temporary mock or unavailable backend feature.


# OMR System — Frontend Specification (`FRONTEND.md`)

## 1. Purpose & Overview

Build the web frontend for an AI-powered Optical Mark Recognition (OMR) evaluation system using **Next.js (App Router)**, **TypeScript**, **Tailwind CSS**, **shadcn/ui**, and **Framer Motion**.

The frontend interfaces with the FastAPI backend (`http://localhost:8000/api`) to:
1. **Manage Class & Subject Answer Keys:** Create and auto-version answer keys indexed by `(class, subject_code)` with interactive bubble selection.
2. **Upload OMR Sheets:** Drag-and-drop single smartphone camera photos (`JPG`, `PNG`) or bulk multi-page PDF batches (`30+` student sheets in one file).
3. **Track Processing Status:** Poll background jobs in real time with smooth progress animations.
4. **View & Export Evaluated Results:** Display evaluated student records (`class`, `section`, `subject`, `roll`, `reg`, `mcq`) in an interactive table with search, filtering, and CSV export.

---

## 2. Tech Stack & Setup

- **Framework:** Next.js 14+ (App Router, TypeScript)
- **Styling:** Tailwind CSS
- **UI Primitives:** `shadcn/ui`
- **Motion & Transitions:** `framer-motion`
- **Icons:** `lucide-react`

### Initialization Commands

```bash
npx create-next-app@latest omr-frontend --typescript --tailwind --eslint --app --src-dir
cd omr-frontend

npx shadcn@latest init
npx shadcn@latest add button card input label select table badge progress dialog toast tabs skeleton

npm install framer-motion lucide-react
```

### Environment Configuration (`.env.local`)

```env
NEXT_PUBLIC_API_BASE_URL=http://localhost:8000/api
```

---

## 3. Directory Structure

```text
src/
├── app/
│   ├── layout.tsx                  # Root layout, fonts, Toaster
│   └── page.tsx                    # Main Dashboard (Scan & Evaluate | Manage Answer Keys)
├── components/
│   ├── omr/
│   │   ├── AnswerKeyForm.tsx       # Interactive Q1–Q30 bubble selector & versioned saver
│   │   ├── AnswerKeyList.tsx       # Active Class/Subject answer keys list
│   │   ├── SheetUploader.tsx       # Framer Motion drag-and-drop zone (PDF/Image)
│   │   ├── JobStatusBanner.tsx     # Animated polling progress indicator
│   │   └── ResultsDataTable.tsx    # Staggered animated table + CSV export
│   └── ui/                         # shadcn/ui components
├── hooks/
│   └── useOmrJobPolling.ts         # Polls GET /api/omr/status/{job_id}
├── lib/
│   └── api.ts                      # Typed FastAPI client
└── types/
    └── omr.ts                      # TypeScript interfaces
```

---

## 4. API Contracts & TypeScript Types (`src/types/omr.ts`)

```typescript
export type OptionLetter = "A" | "B" | "C" | "D";

export interface ExamUpsertPayload {
  class: string;          // e.g., "5", "10"
  subject_code: string;   // e.g., "103"
  title?: string;
  total_questions: number;
  marks_per_question: number;
  answer_key: Record<string, OptionLetter>;
}

export interface ExamResponse extends ExamUpsertPayload {
  exam_id: string;
  class_name: string;
  version: number;
  negative_marks: number;
  updated_at: string;
  status?: "created" | "updated";
}

export interface SheetResultItem {
  page?: number;
  class: string | null;
  section: string | null;
  subject: string | null;
  roll: string | null;
  reg: string | null;
  mcq: number | null;
  warning?: string;
  error?: string;
}

export interface OmrUploadResponse {
  job_id: string;
  status: "queued";
  filename: string;
}

export interface OmrJobStatus {
  job_id: string;
  filename: string;
  status: "queued" | "processing" | "completed" | "completed_with_errors" | "failed";
  result_id: string | null;
  total_sheets?: number;
  failed_sheets?: number;
  error?: string;
}

export interface OmrBatchResult {
  job_id: string;
  status: string;
  total_sheets: number;
  failed_sheets: number;
  sheets: SheetResultItem[];
}
```

---

## 5. Backend Integration (`src/lib/api.ts`)

| Action | Method | Endpoint | Payload / Query |
| :--- | :--- | :--- | :--- |
| Save / Update Answer Key | `POST` | `/api/exams` | JSON (`class`, `subject_code`, `answer_key`) |
| List Answer Keys | `GET` | `/api/exams` | `?class=5&subject_code=103` |
| Upload OMR PDF / Image | `POST` | `/api/omr/upload` | `multipart/form-data` (`file`), optional `?class=&subject=` |
| Check Processing Status | `GET` | `/api/omr/status/{job_id}` | Path param `job_id` |
| Get Evaluated Results | `GET` | `/api/omr/results/{job_id}` | Path param `job_id` |

```typescript
import { ExamUpsertPayload, ExamResponse, OmrUploadResponse, OmrJobStatus, OmrBatchResult } from "@/types/omr";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8000/api";

export const omrApi = {
  async upsertAnswerKey(payload: ExamUpsertPayload): Promise<ExamResponse> {
    const res = await fetch(`${API_BASE}/exams`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!res.ok) throw new Error(await res.text());
    return res.json();
  },

  async listExams(className?: string, subjectCode?: string): Promise<ExamResponse[]> {
    const params = new URLSearchParams();
    if (className) params.append("class", className);
    if (subjectCode) params.append("subject_code", subjectCode);
    const res = await fetch(`${API_BASE}/exams?${params.toString()}`);
    if (!res.ok) throw new Error(await res.text());
    return res.json();
  },

  async uploadSheetFile(
    file: File,
    fallbackClass?: string,
    fallbackSubject?: string
  ): Promise<OmrUploadResponse> {
    const formData = new FormData();
    formData.append("file", file);

    const params = new URLSearchParams();
    if (fallbackClass) params.append("class", fallbackClass);
    if (fallbackSubject) params.append("subject", fallbackSubject);

    const qs = params.toString() ? `?${params.toString()}` : "";
    const res = await fetch(`${API_BASE}/omr/upload${qs}`, {
      method: "POST",
      body: formData,
    });
    if (!res.ok) throw new Error(await res.text());
    return res.json();
  },

  async getJobStatus(jobId: string): Promise<OmrJobStatus> {
    const res = await fetch(`${API_BASE}/omr/status/${jobId}`);
    if (!res.ok) throw new Error(await res.text());
    return res.json();
  },

  async getJobResults(jobId: string): Promise<OmrBatchResult> {
    const res = await fetch(`${API_BASE}/omr/results/${jobId}`);
    if (!res.ok) throw new Error(await res.text());
    return res.json();
  },
};
```

---

## 6. Real-Time Job Polling Hook (`src/hooks/useOmrJobPolling.ts`)

```typescript
"use client";

import { useState, useEffect } from "react";
import { omrApi } from "@/lib/api";
import { OmrJobStatus, OmrBatchResult } from "@/types/omr";

export function useOmrJobPolling(jobId: string | null) {
  const [status, setStatus] = useState<OmrJobStatus null |>(null);
  const [result, setResult] = useState<OmrBatchResult null |>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!jobId) return;
    let cancelled = false;
    let timer: NodeJS.Timeout;

    const poll = async () => {
      try {
        const current = await omrApi.getJobStatus(jobId);
        if (cancelled) return;
        setStatus(current);

        if (current.status === "completed" || current.status === "completed_with_errors") {
          const data = await omrApi.getJobResults(jobId);
          if (!cancelled) setResult(data);
        } else if (current.status === "failed") {
          setError(current.error || "Processing failed.");
        } else {
          timer = setTimeout(poll, 1500);
        }
      } catch (err: any) {
        if (!cancelled) setError(err.message || "Polling error");
      }
    };

    poll();
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [jobId]);

  return { status, result, error };
}
```

---

## 7. UI Components & Framer Motion Patterns

### `AnswerKeyForm.tsx`
- Renders class selector (`3`–`12`), subject code input (`103`), and a 2-column Q1–Q30 bubble grid (`A/ক`, `B/খ`, `C/গ`, `D/ঘ`).
- Uses `motion.button` with `whileTap={{ scale: 0.9 }}` on each bubble.
- Displays an animated version badge (`Saved v2`, `Saved v3`) via `motion.div` whenever an existing `(class, subject_code)` key is updated.

### `SheetUploader.tsx`
- Interactive dropzone accepting `.pdf`, `.jpg`, `.jpeg`, and `.png`.
- Uses `AnimatePresence` to smoothly transition between empty prompt state and selected file preview card.
- Includes optional fallback inputs for `class` and `subject_code` in case a sheet lacks filled header bubbles.

### `ResultsDataTable.tsx`
- Renders evaluated records with columns: `#`, `Class`, `Section`, `Subject`, `Roll`, `Reg No.`, and `MCQ Score`.
- Animates rows sequentially using `motion.tr` (`initial={{ opacity: 0, y: 10 }}`, `animate={{ opacity: 1, y: 0 }}`, `transition={{ delay: idx * 0.04 }}`).
- Provides a one-click **Export CSV** button to download all sheet results.

---

## 8. CORS Requirement

Ensure FastAPI allows requests from `http://localhost:3000`:

```python
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
```
