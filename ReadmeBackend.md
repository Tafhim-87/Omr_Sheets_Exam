# OMR System --- Backend README

## 1. Purpose

Build the Python backend for an AI-powered Optical Mark Recognition
(OMR) evaluation system.

The backend is responsible for analyzing the existing OMR PDF template,
processing uploaded scans/photos, recognizing marked bubbles, evaluating
answers, persisting results, and providing APIs for a Next.js frontend.

**Existing OMR PDF --- use this exact template as the starting
reference:**\
https://www.omrsheet.com/upload-new/100-QUESTIONS/100%20Q%20omr.pdf

Do not create a new OMR sheet. First download and inspect the supplied
PDF. Confirm its page dimensions, page count, alignment marks,
student-information fields, question numbering, option arrangement, and
bubble geometry. If the URL cannot be accessed, report that clearly and
request the PDF rather than inventing template coordinates.

## 2. Technology

-   Python 3
-   FastAPI
-   OpenCV
-   NumPy
-   Pillow
-   PyMuPDF for PDF rendering/inspection
-   scikit-learn for initial ML classifiers
-   PyTorch only if a neural model is justified by the dataset
-   Pydantic
-   MongoDB with PyMongo or an appropriate async driver
-   pytest

Use modular, typed, maintainable code. Do not put the entire pipeline in
one file.

## 3. Architecture and Processing Pipeline

Implement this processing flow:

1.  Receive and validate an uploaded PDF or image.
2.  Store the original file safely and create a processing job.
3.  Convert PDF pages to images when needed.
4.  Detect the sheet boundary and alignment markers.
5.  Correct rotation, perspective, and scale.
6.  Normalize illumination and reduce noise.
7.  Align the normalized image to the analyzed template.
8.  Extract configured regions of interest (ROIs) for student fields and
    bubbles.
9.  Classify each bubble using the recognition engine.
10. Resolve each question as a selected option, blank, multiple-marked,
    or uncertain.
11. Read student identifiers using the actual template's field layout.
12. Compare answers with the selected exam answer key.
13. Save the result, confidence information, model/template versions,
    and processing logs.
14. Return status and result data to the frontend.

Keep each stage independently testable. A failure at one stage must
return a meaningful error and must not create a falsely successful
result.

## 4. Phase One: Analyze the Existing PDF

Create `pdf_analyzer.py` to inspect the supplied PDF.

Extract and report: - Page count and page dimensions - Page
orientation - Visible alignment markers and their coordinates - Question
and option arrangement - Bubble centers and dimensions - Student
information fields - Roll/registration digit grids, if present -
Template-specific labels and section boundaries

Generate a versioned `omr_template.json` with coordinates normalized
relative to page width and height. Include coordinate units, page index,
question number, option label, ROI geometry, and template version.

Do not assume there are exactly four black corner squares. Detect and
document the actual registration features in the provided PDF. Use
manually verified template coordinates where automatic PDF analysis is
insufficient.

Validate the generated configuration by rendering an overlay on the
original PDF and visually inspecting it. Do not proceed with arbitrary
or unverified coordinates.

## 5. Image Preprocessing and Sheet Alignment

Create separate modules for: - File validation and PDF rendering - Image
preprocessing - Sheet/marker detection - Perspective correction -
Template alignment

Support JPG, JPEG, PNG, and PDF.

Handle realistic variation: - Rotation and mild perspective distortion -
Different image resolutions - Uneven illumination and shadows - Mild
blur and compression - Slightly cropped or damaged pages

Use appropriate techniques such as grayscale conversion, denoising,
adaptive thresholding, contour/feature detection, and
homography/perspective transforms.

Do not silently continue if alignment confidence is poor. Return an
explicit status such as `alignment_failed` or `manual_review_required`.

Preserve the original upload. Store processed images and diagnostic
overlays separately.

## 6. Bubble Recognition: Hybrid Computer Vision + Machine Learning

Do not build a pixel-counting-only system and do not claim an untrained
model is machine learning.

Use OpenCV for geometry, registration, and ROI extraction. Use a trained
ML classifier to classify individual bubble crops or extracted features.

### Bubble classes

At minimum, support: - `empty` - `filled` - `partial` -
`multiple_or_ambiguous` where applicable at question level -
`erased_or_uncertain`

A bubble-level model may classify empty/filled/partial/uncertain, while
question-level logic determines whether zero, one, or multiple options
were marked.

### Feature extraction

Consider: - Interior filled-pixel ratio - Intensity statistics and
distribution - Local contrast - Connected components - Contour and shape
characteristics - Edge density - Difference from the corresponding blank
template region

Exclude printed outlines and labels from the bubble interior
measurement. Use the analyzed template to define the inner ROI.

### Model strategy

Start with a measurable baseline: - Extract features from labeled bubble
crops. - Train and compare Random Forest and SVM classifiers. - Use a
CNN only if enough representative labeled data is available and it
improves held-out performance.

Do not use synthetic samples as the only evidence of real-world
performance.

### Training dataset

Create a labeling workflow and dataset format containing: - Bubble crop
image - Label - Source sheet identifier - Template version -
Capture/scan condition metadata where available

Include samples of: - Empty bubbles - Fully filled bubbles - Partial
marks - Different pen/pencil types - Erasures - Cross-outs - Shadows and
uneven lighting - Low-quality scans - Multiple-marked questions

Split train/validation/test data by source sheet or student, not by
randomly splitting neighboring crops from the same sheet. This prevents
leakage.

### Prediction output

For each option, return the predicted class and confidence/probability
where supported. For each question, return: - `detected_answer` -
`question_status` - `confidence` - Per-option scores/probabilities -
`requires_manual_review` - Recognition warnings

Calibrate confidence on held-out data where possible. Use configurable
thresholds. Low-confidence results must be marked uncertain rather than
guessed.

## 7. Student Information Recognition

Implement only fields that actually exist in the analyzed PDF.

For bubble-based roll or registration digits, map each digit position to
its corresponding digit bubbles and apply the same recognition and
ambiguity rules.

For printed or handwritten text, use OCR only where appropriate. OCR
output must include confidence and manual verification for uncertain
values.

Never infer a missing student identity from the answer pattern or
unrelated records.

## 8. Answer Evaluation Engine

Create a separate deterministic evaluator that accepts recognized
answers and an exam configuration.

Example configuration:

``` json
{
  "exam_id": "EXAM-001",
  "total_questions": 100,
  "options": ["A", "B", "C", "D"],
  "marks_per_question": 1,
  "negative_marks": 0.25,
  "answer_key": {
    "1": "B",
    "2": "A",
    "3": "C",
    "4": "D"
  }
}
```

Support configurable question counts and options, marks per correct
answer, negative marking, unanswered questions, multiple-marked answers,
invalid answers, and uncertain recognition.

Return: - Total questions - Correct count - Wrong count - Unanswered
count - Multiple/invalid count - Uncertain count - Total marks -
Percentage - Grade, only if a grading scale is configured

Do not silently treat uncertain answers as wrong or correct. Keep
recognition status separate from scoring policy. Define and document the
exam's policy for multiple marks and uncertain answers.

Store the answer-key version used for every evaluation so historical
results remain reproducible.

## 9. FastAPI Service and API

Build a REST API with Pydantic request/response schemas.

Proposed routes:

### Templates

-   `POST /api/templates/analyze`
-   `GET /api/templates`
-   `GET /api/templates/{template_id}`

### Exams

-   `POST /api/exams`
-   `GET /api/exams`
-   `GET /api/exams/{exam_id}`
-   `PUT /api/exams/{exam_id}`
-   `DELETE /api/exams/{exam_id}`

### OMR processing

-   `POST /api/omr/upload`
-   `POST /api/omr/batch-upload`
-   `POST /api/omr/process/{job_id}`
-   `GET /api/omr/status/{job_id}`
-   `GET /api/omr/results/{job_id}`

### Results

-   `GET /api/results`
-   `GET /api/results/{result_id}`
-   `PUT /api/results/{result_id}/correction`
-   `GET /api/results/export`

### ML

-   `POST /api/ml/train` (restricted to authorized administrators)
-   `GET /api/ml/model-status`
-   `GET /api/ml/evaluation-metrics`

These are proposed endpoints. Document the final API contract and expose
Swagger/OpenAPI documentation. Use pagination and filtering for list
endpoints.

For large batches, use a background job system. FastAPI background tasks
may be sufficient for an initial prototype; use Celery/RQ with Redis
when durable, scalable job execution is required. Do not keep
long-running processing inside a request-response handler.

## 10. Database and Persistence

Use MongoDB collections or equivalent models for: - `templates` -
`exams` - `omr_jobs` - `results` - `ml_models` - `audit_logs`

Persist: - Original file reference and processed artifact references -
Student and exam identifiers - Recognized answers - Per-option
predictions and confidence - Question-level status - Score breakdown -
Answer-key version - Template version - Model name/version - Processing
timestamps and errors - Manual corrections and audit history

Avoid storing large binary files directly in ordinary result documents.
Use safe filesystem/object storage or GridFS as appropriate, and store
references in MongoDB.

## 11. Manual Corrections and Audit Trail

Provide an API for authorized users to correct recognition results.

A correction must: - Validate the question number and selected
option/status. - Preserve the original machine prediction. - Store the
corrected value separately. - Record who made the correction, when, and
why where available. - Recalculate the result using the recorded
answer-key version. - Mark the result as reviewed.

Never overwrite the original recognition output or erase its confidence
and model metadata.

## 12. Suggested Backend Structure

``` text
backend/
├── app/
│   ├── main.py
│   ├── config/
│   ├── api/
│   ├── schemas/
│   ├── models/
│   ├── database/
│   ├── services/
│   ├── core/
│   ├── omr/
│   │   ├── pdf_analyzer.py
│   │   ├── template_loader.py
│   │   ├── image_preprocessor.py
│   │   ├── sheet_detector.py
│   │   ├── perspective_corrector.py
│   │   ├── template_aligner.py
│   │   ├── bubble_detector.py
│   │   ├── answer_recognizer.py
│   │   └── evaluator.py
│   ├── ml/
│   │   ├── feature_extractor.py
│   │   ├── dataset.py
│   │   ├── trainer.py
│   │   ├── classifier.py
│   │   └── evaluation.py
│   └── utils/
├── datasets/
├── trained_models/
├── uploads/
├── processed/
├── templates/
│   └── omr_template.json
├── tests/
├── requirements.txt
└── .env.example
```

## 13. Configuration and Security

Use environment variables for: - MongoDB connection string - Database
name - Upload/storage directory - Allowed frontend origins - Maximum
upload size - Model path/version - Recognition confidence thresholds -
Background worker settings

Provide `.env.example` with placeholder values only. Never commit real
credentials.

Security requirements: - Validate file extension, MIME type, and file
contents. - Limit file size and PDF page count. - Generate safe
server-side filenames. - Prevent path traversal. - Restrict CORS to
configured frontend origins. - Add authentication and role authorization
before exposing administrative actions. - Do not trust client-supplied
marks, answers, or student identity. - Avoid exposing internal
filesystem paths or stack traces in API responses.

## 14. Testing and Evaluation

Use pytest and maintain a test suite for: - PDF template analysis -
Template coordinate validation - Image alignment and perspective
correction - Bubble ROI extraction - Bubble classification -
Multiple-mark detection - Student digit recognition - Answer scoring and
negative marking - Uncertain-answer handling - API validation and upload
errors - Batch job failure isolation - Manual correction and audit
history

Report actual test-set metrics: - Accuracy - Precision - Recall -
F1-score - Confusion matrix - Question-level exact recognition rate -
Sheet-level exact recognition rate

Do not invent metrics. Record dataset size, split method, model version,
and test conditions with every reported result.

## 15. Development Order

1.  Download and inspect the provided 100-question PDF.
2.  Produce a template-analysis report and verified overlay.
3.  Generate and validate the versioned template JSON.
4.  Implement image loading, normalization, and alignment.
5.  Implement ROI extraction and a transparent OpenCV baseline.
6.  Build the bubble labeling dataset workflow.
7.  Train and evaluate ML classifiers using sheet-level splits.
8.  Implement confidence thresholds and manual-review flags.
9.  Implement student information recognition based on actual fields.
10. Implement deterministic answer evaluation.
11. Add MongoDB persistence and FastAPI endpoints.
12. Add background batch processing.
13. Implement manual correction and audit history.
14. Add integration tests using real sample sheets.
15. Document setup, training, API schemas, and deployment.

## 16. Definition of Done

The backend is ready for initial production evaluation when it can: -
Analyze the exact supplied OMR template. - Align real scans/photos to
that template. - Recognize answers with measurable held-out
performance. - Flag ambiguous and multiple-marked answers. - Evaluate
using configurable answer keys and scoring rules. - Process multiple
sheets without one failure stopping the batch. - Persist reproducible
results and model/template versions. - Support manual corrections with
an audit trail. - Expose documented APIs consumed by the Next.js
frontend.

**First task:** Inspect the provided PDF and return a factual
template-analysis report plus a verified coordinate overlay. Do not
begin by inventing bubble coordinates, training an untrained model, or
building unrelated features.
