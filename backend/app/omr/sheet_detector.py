import cv2
import numpy as np

class SheetDetector:
    @staticmethod
    def align_and_normalize(image: np.ndarray, target_w: int = 2100, target_h: int = 2970) -> np.ndarray:
        gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY) if len(image.shape) == 3 else image
        blurred = cv2.GaussianBlur(gray, (5, 5), 0)
        _, thresh = cv2.threshold(blurred, 60, 255, cv2.THRESH_BINARY_INV)

        contours, _ = cv2.findContours(thresh, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
        
        # Candidate black squares (marker size is ~7mm x 7mm)
        marker_centers = []
        img_area = image.shape[0] * image.shape[1]

        for c in contours:
            area = cv2.contourArea(c)
            # Filter marker candidates by relative area (between 0.01% and 0.5% of page)
            if 0.0001 * img_area < area < 0.005 * img_area:
                peri = cv2.arcLength(c, True)
                approx = cv2.approxPolyDP(c, 0.04 * peri, True)
                if len(approx) == 4:
                    x, y, w, h = cv2.boundingRect(approx)
                    aspect_ratio = float(w) / h
                    if 0.8 <= aspect_ratio <= 1.25:
                        M = cv2.moments(c)
                        if M["m00"] != 0:
                            marker_centers.append([M["m10"] / M["m00"], M["m01"] / M["m00"]])

        if len(marker_centers) >= 4:
            pts = np.array(marker_centers, dtype="float32")
            # Sort into TL, TR, BR, BL
            s = pts.sum(axis=1)
            tl = pts[np.argmin(s)]
            br = pts[np.argmax(s)]

            diff = np.diff(pts, axis=1)
            tr = pts[np.argmin(diff)]
            bl = pts[np.argmax(diff)]

            src = np.array([tl, tr, br, bl], dtype="float32")
            
            # Destination based on 5mm inset + 3.5mm marker center = 8.5mm from corners
            x_pad = int((8.5 / 210.0) * target_w)
            y_pad = int((8.5 / 297.0) * target_h)

            dst = np.array([
                [x_pad, y_pad],
                [target_w - x_pad, y_pad],
                [target_w - x_pad, target_h - y_pad],
                [x_pad, target_h - y_pad]
            ], dtype="float32")

            matrix = cv2.getPerspectiveTransform(src, dst)
            return cv2.warpPerspective(image, matrix, (target_w, target_h))

        # Fallback to general boundary crop if markers are occluded
        return cv2.resize(image, (target_w, target_h))