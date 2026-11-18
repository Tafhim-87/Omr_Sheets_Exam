import logging
from typing import Dict, List, Tuple

import cv2
import numpy as np

logger = logging.getLogger(__name__)


class AnswerRecognizer:
    """Reads MCQ answers and student-identity grids from an aligned OMR sheet.

    Why this is not a plain "template mm -> pixel" lookup any more
    ---------------------------------------------------------------
    A camera photo (or a slightly bent / scaled printout) is never perfectly flat, so
    after the 4-corner-marker alignment the bubbles in the middle of the sheet can still
    be 4-5 mm (a whole bubble) away from where the template says they are.  Reading at the
    template position then looks at the wrong cell or at paper.

    So every block of bubbles (roll, reg, subject, set, class, section, MCQ column 1 / 2) is
    located on the real image first:
      1. find the real circles (empty rings AND filled discs) around the block,
      2. find the shift that makes the template grid land on them,
      3. fit a small affine correction, then snap each bubble to its detected circle.
    Fill is then measured against the *local* paper brightness, so grey shading from
    a photo or photocopy does not look like ink.
    """

    SEARCH_MM = 7.0          # how far a block may be from its template position
    DETECT_THRESHOLD = 0.32  # circle evidence needed to count as a detected bubble
    SNAP_MM = 1.6            # max distance a bubble may be snapped to a detected circle
    # Registration squares (7 mm, 5 mm inset): centres in mm.  Override with "markers_mm"
    # in the template JSON if the sheet design changes.
    DEFAULT_MARKERS_MM = {"TL": (8.5, 8.5), "TR": (201.5, 8.5), "BL": (8.5, 288.5), "BR": (201.5, 288.5)}
    MARKER_MM = 7.0

    def __init__(self, template: dict, **_ignored):
        self.template = template
        self.page_w_mm = template["page_dimensions_mm"]["width"]
        self.page_h_mm = template["page_dimensions_mm"]["height"]
        self.bubble_r_mm = template.get("bubble_radius_mm", 2.3)
        self._matched = {}
        self._anchors: List[Tuple[np.ndarray, np.ndarray]] = []   # (template px, found px)
        self._prior = None

    # ------------------------------------------------------------------ geometry
    def _mm_to_px(self, mm_x: float, mm_y: float, img_w: int, img_h: int):
        x = int((mm_x / self.page_w_mm) * img_w)
        y = int((mm_y / self.page_h_mm) * img_h)
        return x, y

    def _find_markers(self, gray: np.ndarray) -> Dict[str, Tuple[float, float]]:
        """Locate the four solid black registration squares inside the aligned image."""
        h, w = gray.shape[:2]
        ppm_x, ppm_y = w / self.page_w_mm, h / self.page_h_mm
        expected = {k: tuple(v) for k, v in (self.template.get("markers_mm") or self.DEFAULT_MARKERS_MM).items()}
        want = (self.MARKER_MM * (ppm_x + ppm_y) / 2.0) ** 2
        found = {}
        for name, (mx, my) in expected.items():
            cx, cy = mx * ppm_x, my * ppm_y
            rx, ry = 14.0 * ppm_x, 14.0 * ppm_y
            x0, x1 = max(0, int(cx - rx)), min(w, int(cx + rx))
            y0, y1 = max(0, int(cy - ry)), min(h, int(cy + ry))
            roi = gray[y0:y1, x0:x1]
            if roi.size == 0:
                continue
            _, mask = cv2.threshold(roi, 0, 255, cv2.THRESH_BINARY_INV + cv2.THRESH_OTSU)
            cnts, _ = cv2.findContours(mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
            best, best_err = None, None
            for c in cnts:
                x, y, bw, bh = cv2.boundingRect(c)
                area = cv2.contourArea(c)
                if not (0.5 * want < bw * bh < 1.8 * want) or not (0.75 < bw / max(bh, 1) < 1.33):
                    continue
                if area < 0.8 * bw * bh:                      # must be a solid square
                    continue
                err = abs(bw * bh - want)
                if best is None or err < best_err:
                    best, best_err = (x0 + x + bw / 2.0, y0 + y + bh / 2.0), err
            if best is not None:
                found[name] = best
        return found

    def _normalize(self, gray: np.ndarray) -> np.ndarray:
        """Re-register the image so the markers sit exactly where the template says.

        Makes the result independent of how the earlier alignment step placed the
        markers (centre vs outer edge, cropping, small scale errors)."""
        h, w = gray.shape[:2]
        found = self._find_markers(gray)
        if len(found) != 4:
            return gray
        expected = self.template.get("markers_mm") or self.DEFAULT_MARKERS_MM
        names = ["TL", "TR", "BL", "BR"]
        src = np.float32([found[n] for n in names])
        dst = np.float32([[expected[n][0] / self.page_w_mm * w, expected[n][1] / self.page_h_mm * h] for n in names])
        ppm = (w / self.page_w_mm + h / self.page_h_mm) / 2.0
        if float(np.abs(src - dst).max()) < 0.8 * ppm:          # already within 0.8 mm
            return gray
        H = cv2.getPerspectiveTransform(src, dst)
        return cv2.warpPerspective(gray, H, (w, h), flags=cv2.INTER_LINEAR, borderValue=255)

    def _prepare(self, aligned_image: np.ndarray) -> dict:
        gray = aligned_image
        if gray.ndim == 3:
            gray = cv2.cvtColor(gray, cv2.COLOR_BGR2GRAY)
        gray = self._normalize(gray)
        gray = cv2.GaussianBlur(gray, (3, 3), 0)
        h, w = gray.shape[:2]
        ppm_x = w / self.page_w_mm
        ppm_y = h / self.page_h_mm
        ppm = (ppm_x + ppm_y) / 2.0
        return {"gray": gray, "w": w, "h": h, "ppm_x": ppm_x, "ppm_y": ppm_y,
                "ppm": ppm, "r": max(3, int(round(self.bubble_r_mm * ppm)))}

    # ------------------------------------------------------------------ circle detection
    def _detect_circles(self, ctx: dict, x0: int, y0: int, x1: int, y1: int) -> np.ndarray:
        """Return array of (x, y, score) of ring-or-disc shaped bubbles inside the box."""
        gray, r = ctx["gray"], ctx["r"]
        x0, y0 = max(0, x0), max(0, y0)
        x1, y1 = min(ctx["w"], x1), min(ctx["h"], y1)
        k = int(round(r * 1.35))
        if x1 - x0 <= 2 * k + 2 or y1 - y0 <= 2 * k + 2:
            return np.zeros((0, 3), np.float32)

        crop = gray[y0:y1, x0:x1].astype(np.float32)
        yy, xx = np.mgrid[-k:k + 1, -k:k + 1]
        dist = np.hypot(xx, yy)
        ring = np.ones(dist.shape, np.float32)
        ring[(dist <= r) & (dist >= r - max(2.0, 0.17 * r))] = 0.0
        disc = np.ones(dist.shape, np.float32)
        disc[dist <= r * 0.9] = 0.0

        ev = np.maximum(
            cv2.matchTemplate(crop, ring, cv2.TM_CCOEFF_NORMED),
            cv2.matchTemplate(crop, disc, cv2.TM_CCOEFF_NORMED),
        )
        ev = np.nan_to_num(ev, nan=0.0, posinf=0.0, neginf=0.0)

        m = int(round(ctx["ppm"] * 3.6)) | 1
        peaks = (ev == cv2.dilate(ev, np.ones((m, m), np.uint8))) & (ev > self.DETECT_THRESHOLD)
        ys, xs = np.nonzero(peaks)
        if len(xs) == 0:
            return np.zeros((0, 3), np.float32)
        return np.stack([xs + k + x0, ys + k + y0, ev[ys, xs]], axis=1).astype(np.float32)

    def _locate_block(self, ctx: dict, points_mm: List[Tuple[float, float]],
                      use_prior: bool = False) -> Tuple[np.ndarray, float]:
        """Find real pixel centres for a block of template points.

        use_prior: start from the sheet bend learned from the big blocks (used for the
        small class/section rows, whose look-alike bubbles are easy to mis-register).
        Returns (centres Nx2 in px, matched_ratio 0..1)."""
        w, h, ppm = ctx["w"], ctx["h"], ctx["ppm"]
        P = np.array([[mx / self.page_w_mm * w, my / self.page_h_mm * h] for mx, my in points_mm], np.float32)

        base, search_mm = P, self.SEARCH_MM
        if use_prior and self._prior is not None:
            base = P + self._prior(P)
        if use_prior:
            search_mm = 5.0 if self._prior is not None else self.SEARCH_MM

        margin = (search_mm + 4.0) * ppm
        det = self._detect_circles(
            ctx, int(base[:, 0].min() - margin), int(base[:, 1].min() - margin),
            int(base[:, 0].max() + margin), int(base[:, 1].max() + margin))
        if len(det) < max(4, len(P) // 6):
            return base.copy(), 0.0

        D, S = det[:, :2], det[:, 2]
        idx = np.arange(len(P))

        # A bubble may only be matched to a circle closer than 45% of the grid pitch,
        # otherwise it could be matched to its neighbour.
        if len(P) > 1:
            pd = np.linalg.norm(P[:, None, :] - P[None, :, :], axis=2)
            np.fill_diagonal(pd, np.inf)
            cap = 0.45 * float(pd.min())
        else:
            cap = 2.0 * ppm

        # 1) coarse: best whole-block shift
        tol = min(2.0 * ppm, cap)
        step = 0.5 * ppm
        n_steps = int(search_mm / 0.5)
        best_score, best_shift = -1.0, np.zeros(2, np.float32)
        if use_prior:
            # small block of look-alike bubbles: match the whole ring pattern at once
            best_shift = self._pattern_shift(ctx, base, search_mm)
        else:
            for iy in range(-n_steps, n_steps + 1):
                for ix in range(-n_steps, n_steps + 1):
                    shift = np.array([ix * step, iy * step], np.float32)
                    d = np.linalg.norm((base + shift)[:, None, :] - D[None, :, :], axis=2)
                    j = d.argmin(1)
                    dm = d[idx, j]
                    ok = dm < tol
                    score = float((S[j] * ok).sum() - 0.05 * (dm[ok].sum() / ppm))
                    if score > best_score:
                        best_score, best_shift = score, shift

        # 2) fine: re-fit an affine map, tightening the match tolerance each round.
        #    This follows tilted / curved / lens-distorted sheets, where the error is
        #    different at the top and the bottom of the same block.
        cur = base + best_shift
        for frac in (1.0, 0.75, 0.55, 0.4, 0.3):
            d = np.linalg.norm(cur[:, None, :] - D[None, :, :], axis=2)
            j = d.argmin(1)
            ok = d[idx, j] < cap * frac
            if ok.sum() >= 6:
                cur = self._apply_fit(P, P[ok], D[j[ok]], ppm)
            elif ok.sum() >= 2:
                cur = cur + np.mean(D[j[ok]] - cur[ok], axis=0)

        d = np.linalg.norm(cur[:, None, :] - D[None, :, :], axis=2)
        j = d.argmin(1)
        near = d[idx, j] < self.SNAP_MM * ppm
        refined = cur.copy()
        refined[near] = D[j[near]]
        ratio = float(near.mean())
        if not use_prior and ratio >= 0.75 and near.sum() >= 20:
            self._anchors.append((P[near].copy(), refined[near].copy()))
        return refined, ratio

    def _pattern_shift(self, ctx: dict, base: np.ndarray, search_mm: float) -> np.ndarray:
        """Shift that best lays ALL expected rings of a block onto the real ink at once.

        Per-bubble detection is weak for blurry photos, but summed over a whole block the
        ring pattern is very distinctive (its ends show which column is which)."""
        gray, r, ppm = ctx["gray"], ctx["r"], ctx["ppm"]
        m = int(search_mm * ppm)
        px0, py0 = int(base[:, 0].min() - r - 4), int(base[:, 1].min() - r - 4)
        px1, py1 = int(base[:, 0].max() + r + 5), int(base[:, 1].max() + r + 5)
        x0, y0, x1, y1 = px0 - m, py0 - m, px1 + m, py1 + m
        if x0 < 0 or y0 < 0 or x1 > ctx["w"] or y1 > ctx["h"]:
            x0, y0 = max(0, x0), max(0, y0)
            x1, y1 = min(ctx["w"], x1), min(ctx["h"], y1)
        crop = gray[y0:y1, x0:x1].astype(np.float32)
        if crop.shape[0] <= py1 - py0 or crop.shape[1] <= px1 - px0:
            return np.zeros(2, np.float32)

        k = 2 * r + 9
        bg = cv2.morphologyEx(crop, cv2.MORPH_CLOSE, np.ones((k, k), np.uint8))
        bg = cv2.GaussianBlur(bg, (0, 0), r / 2.0)
        ink = np.clip((bg - crop) / np.maximum(bg - 30.0, 1.0), 0.0, 1.0)

        pat = np.zeros((py1 - py0, px1 - px0), np.float32)
        for x, y in base:
            cv2.circle(pat, (int(round(x - px0)), int(round(y - py0))), max(2, r - 2), 1.0, 3)
        pat = cv2.GaussianBlur(pat, (0, 0), 1.5)

        res = cv2.matchTemplate(ink, pat, cv2.TM_CCOEFF_NORMED)
        res = np.nan_to_num(res, nan=-1.0)
        ox, oy = px0 - x0, py0 - y0                      # index of "no shift"
        yy, xx = np.mgrid[0:res.shape[0], 0:res.shape[1]]
        inside = np.hypot(xx - ox, yy - oy) <= m
        res = np.where(inside, res, -1.0)
        best = float(res.max())
        peaks = (res == cv2.dilate(res, np.ones((int(2.5 * ppm) | 1,) * 2, np.uint8))) & (res >= 0.92 * best)
        cand = np.argwhere(peaks)
        # near-ties (e.g. one bubble pitch apart) go to the one closest to the learned bend
        iy, ix = min(cand, key=lambda c: (c[1] - ox) ** 2 + (c[0] - oy) ** 2)
        return np.array([ix - ox, iy - oy], np.float32)

    def _build_prior(self, ctx: dict) -> None:
        """Learn how the sheet is bent from reliably matched big blocks.

        The estimate for a point uses a locally weighted affine fit, so anchors close to
        it count most and the extrapolation stays gentle (a global quadratic overshoots)."""
        if not self._anchors:
            return
        src = np.concatenate([a for a, _ in self._anchors])
        dst = np.concatenate([b for _, b in self._anchors])
        if len(src) < 60:
            return
        disp = dst - src
        sigma = 60.0 * ctx["ppm"]

        def prior(pts):
            pts = np.asarray(pts, np.float32)
            c = pts.mean(axis=0)
            wgt = np.exp(-(np.linalg.norm(src - c, axis=1) / sigma) ** 2) + 1e-6
            A = np.column_stack([src - c, np.ones(len(src))])
            Aw = A * wgt[:, None]
            coef = np.linalg.solve(A.T @ Aw + 1e-3 * np.eye(3), Aw.T @ disp)
            return np.column_stack([pts - c, np.ones(len(pts))]) @ coef

        self._prior = prior

    def _apply_fit(self, all_src: np.ndarray, src: np.ndarray, dst: np.ndarray, ppm: float) -> np.ndarray:
        """Fit src->dst, then apply that same transform to every template point."""
        px = np.ptp(src[:, 0]) > 1.0 * ppm
        py = np.ptp(src[:, 1]) > 1.0 * ppm
        out = all_src.astype(np.float32).copy()
        if px and py:
            A = np.column_stack([src, np.ones(len(src))])
            cx, *_ = np.linalg.lstsq(A, dst[:, 0], rcond=None)
            cy, *_ = np.linalg.lstsq(A, dst[:, 1], rcond=None)
            B = np.column_stack([all_src, np.ones(len(all_src))])
            out[:, 0], out[:, 1] = B @ cx, B @ cy
        elif py:                                   # one column: x shift, y scale + shift
            out[:, 0] = all_src[:, 0] + np.mean(dst[:, 0] - src[:, 0])
            a, b = np.polyfit(src[:, 1], dst[:, 1], 1)
            out[:, 1] = a * all_src[:, 1] + b
        else:                                      # translation only
            out += np.mean(dst - src, axis=0)
        return out

    # ------------------------------------------------------------------ fill measurement
    def _analyze(self, ctx: dict, cx: float, cy: float) -> dict:
        """Fraction of the bubble's core that is clearly darker than the paper around it."""
        gray, r, w, h = ctx["gray"], ctx["r"], ctx["w"], ctx["h"]
        pad = int(r * 1.8)
        x0, x1 = max(0, int(cx) - pad), min(w, int(cx) + pad + 1)
        y0, y1 = max(0, int(cy) - pad), min(h, int(cy) + pad + 1)
        roi = gray[y0:y1, x0:x1].astype(np.float32)
        if roi.size == 0:
            return {"fill_ratio": 0.0, "status": "empty", "confidence": 0.0}
        yy, xx = np.mgrid[y0:y1, x0:x1]
        dist = np.hypot(xx - cx, yy - cy)

        core = dist <= 0.62 * r
        paper = (dist >= 1.15 * r) & (dist <= 1.75 * r)
        if core.sum() < 4 or paper.sum() < 8:
            return {"fill_ratio": 0.0, "status": "empty", "confidence": 0.0}

        bg = float(np.percentile(roi[paper], 75))          # local paper brightness
        ink = 40.0
        thr = bg - 0.45 * max(bg - ink, 1.0)               # clearly darker than paper
        fill = float((roi[core] < thr).mean())
        if bg < 90:                                        # no paper visible -> unreliable
            fill = 0.0

        status = "filled" if fill >= 0.45 else ("uncertain" if fill >= 0.25 else "empty")
        conf = min(0.99, 0.5 + abs(fill - 0.45))
        return {"fill_ratio": round(fill, 3), "status": status, "confidence": round(conf, 3)}

    # ------------------------------------------------------------------ student grids
    def _read_digit_grid(self, ctx: dict, cfg: dict) -> Tuple[object, float]:
        points = []
        for col in range(cfg["digits"]):
            x = cfg["col_start_x_mm"] + col * cfg["col_step_x_mm"]
            for d in range(10):
                points.append((x, cfg["bubble_start_y_mm"] + d * cfg["bubble_step_y_mm"]))
        centres, matched = self._locate_block(ctx, points)

        digits, any_filled = [], False
        for col in range(cfg["digits"]):
            scores = []
            for d in range(10):
                cx, cy = centres[col * 10 + d]
                scores.append((d, self._analyze(ctx, cx, cy)["fill_ratio"]))
            scores.sort(key=lambda it: it[1], reverse=True)
            top_d, top = scores[0]
            second = scores[1][1] if len(scores) > 1 else 0.0
            if top >= 0.45 and (top - second) >= 0.20:
                digits.append(str(top_d))
                any_filled = True
            else:
                digits.append("?")
        return ("".join(digits) if any_filled else None), matched

    def process_student_grids(self, aligned_image: np.ndarray, _ctx: dict = None) -> dict:
        ctx = _ctx or self._prepare(aligned_image)
        out = {}
        self._matched = getattr(self, "_matched", {})
        for name, cfg in self.template.get("student_grids", {}).items():
            out[name], self._matched[name] = self._read_digit_grid(ctx, cfg)
        return out

    def process_choice_fields(self, aligned_image: np.ndarray, _ctx: dict = None) -> dict:
        """Single-choice rows (class, section): exactly one filled bubble per field.

        All rows are located together as ONE block: separately, a row of 5-6 look-alike
        bubbles can lock onto the neighbouring row when the photo is shifted."""
        ctx = _ctx or self._prepare(aligned_image)
        fields = self.template.get("choice_fields", {})
        if not fields:
            return {}
        self._matched = getattr(self, "_matched", {})

        points, owner = [], []
        for name, cfg in fields.items():
            for o in cfg["options"]:
                points.append((o["x_mm"], o["y_mm"]))
                owner.append((name, o["value"]))
        if self._prior is None:
            self._build_prior(ctx)
        centres, matched = self._locate_block(ctx, points, use_prior=True)
        for name in fields:
            self._matched[name] = matched

        by_field: Dict[str, list] = {n: [] for n in fields}
        for (name, value), (cx, cy) in zip(owner, centres):
            by_field[name].append((value, self._analyze(ctx, cx, cy)["fill_ratio"]))

        out = {}
        for name, scores in by_field.items():
            scores.sort(key=lambda it: it[1], reverse=True)
            if not scores or scores[0][1] < 0.45:
                out[name] = None
            else:
                second = scores[1][1] if len(scores) > 1 else 0.0
                out[name] = scores[0][0] if scores[0][1] - second >= 0.20 else "?"
        return out

    # ------------------------------------------------------------------ MCQ
    def process_sheet(self, aligned_image: np.ndarray) -> dict:
        ctx = self._prepare(aligned_image)
        self._matched, self._anchors, self._prior = {}, [], None
        questions = {}

        for ci, col_cfg in enumerate(self.template["mcq_layout"]["columns"]):
            start_q, end_q = col_cfg["question_range"]
            first_y = col_cfg["first_q_y_center_mm"]
            y_step = col_cfg["row_step_y_mm"]
            xs = col_cfg["option_center_x_mm"]
            n_opts = len(self.template["options"])

            points = [(xs[o], first_y + qi * y_step)
                      for qi in range(end_q - start_q + 1) for o in range(n_opts)]
            centres, matched = self._locate_block(ctx, points)
            self._matched["mcq_col_%d" % ci] = matched

            for qi, q_num in enumerate(range(start_q, end_q + 1)):
                marked, analyses = [], {}
                for oi, label in enumerate(self.template["options"]):
                    cx, cy = centres[qi * n_opts + oi]
                    res = self._analyze(ctx, cx, cy)
                    analyses[label] = res
                    if res["fill_ratio"] >= 0.45:
                        marked.append(label)

                if len(marked) == 1:
                    status, detected = "single_marked", marked[0]
                    conf = analyses[detected]["confidence"]
                elif len(marked) > 1:
                    status, detected, conf = "multiple_marked", None, 0.95
                else:
                    status, detected, conf = "blank", None, 0.95

                questions[str(q_num)] = {
                    "question_number": q_num,
                    "detected_answer": detected,
                    "question_status": status,
                    "confidence": conf,
                    "requires_manual_review": status == "multiple_marked",
                    "per_option_metrics": analyses,
                }

        student_info = self.process_student_grids(aligned_image, ctx)
        student_info.update(self.process_choice_fields(aligned_image, ctx))

        # share of bubbles that were matched to a real circle, per block (1.0 = perfect)
        low = {k: round(v, 2) for k, v in self._matched.items() if v < 0.6}
        if low:
            logger.warning("Low grid-match on blocks (sheet may be badly aligned): %s", low)

        return {"questions": questions, "student_info": student_info,
                "alignment": {k: round(v, 2) for k, v in self._matched.items()}}