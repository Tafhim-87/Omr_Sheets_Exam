import cv2
import numpy as np

class BubbleDetector:
    def __init__(self, empty_thresh: float = 0.15, filled_thresh: float = 0.42):
        self.empty_thresh = empty_thresh
        self.filled_thresh = filled_thresh

    def analyze_roi(self, roi: np.ndarray) -> dict:
        gray = cv2.cvtColor(roi, cv2.COLOR_BGR2GRAY) if len(roi.shape) == 3 else roi
        h, w = gray.shape

        # Inner circular mask to exclude boundary lines
        mask = np.zeros((h, w), dtype=np.uint8)
        cv2.circle(mask, (w // 2, h // 2), int(min(w, h) * 0.36), 255, -1)

        # Otsu thresholding for illumination robustness
        _, thresh = cv2.threshold(gray, 0, 255, cv2.THRESH_BINARY_INV + cv2.THRESH_OTSU)
        inner_pixels = cv2.bitwise_and(thresh, thresh, mask=mask)

        filled_pixels = cv2.countNonZero(inner_pixels)
        total_pixels = cv2.countNonZero(mask)
        fill_ratio = float(filled_pixels / total_pixels) if total_pixels > 0 else 0.0

        if fill_ratio >= self.filled_thresh:
            status = "filled"
            conf = min(1.0, (fill_ratio - self.filled_thresh) / (1.0 - self.filled_thresh) + 0.6)
        elif fill_ratio <= self.empty_thresh:
            status = "empty"
            conf = min(1.0, (self.empty_thresh - fill_ratio) / self.empty_thresh + 0.6)
        else:
            status = "uncertain"
            conf = 0.40

        return {
            "fill_ratio": round(fill_ratio, 4),
            "status": status,
            "confidence": round(conf, 3)
        }