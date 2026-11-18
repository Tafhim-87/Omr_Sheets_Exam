import { config } from "./config";

export const ALLOWED_MIME = new Set([
  "application/pdf",
  "image/jpeg",
  "image/jpg",
  "image/png",
]);
export const ALLOWED_EXT = new Set([".pdf", ".jpg", ".jpeg", ".png"]);

const MAGIC = {
  pdf: [0x25, 0x50, 0x44, 0x46, 0x2d], // %PDF-
  jpg: [0xff, 0xd8, 0xff],
  png: [0x89, 0x50, 0x4e, 0x47],
} as const;

export type FileKind = "pdf" | "jpg" | "png" | "unknown";

export function sniffMagic(bytes: Uint8Array): FileKind {
  if (MAGIC.pdf.every((b, i) => bytes[i] === b)) return "pdf";
  if (MAGIC.jpg.every((b, i) => bytes[i] === b)) return "jpg";
  if (MAGIC.png.every((b, i) => bytes[i] === b)) return "png";
  return "unknown";
}

export async function readMagicHead(file: File, n = 8): Promise<FileKind> {
  const head = file.slice(0, n);
  const buf = new Uint8Array(await head.arrayBuffer());
  return sniffMagic(buf);
}

export interface FileValidation {
  ok: boolean;
  reason?: string;
}

export async function validateFile(file: File): Promise<FileValidation> {
  const maxBytes = config.publicMaxUploadMb * 1024 * 1024;
  if (file.size === 0) return { ok: false, reason: "File is empty." };
  if (file.size > maxBytes) {
    return { ok: false, reason: `File exceeds ${config.publicMaxUploadMb} MB.` };
  }
  const lower = file.name.toLowerCase();
  const ext = lower.slice(lower.lastIndexOf("."));
  if (!ALLOWED_EXT.has(ext)) {
    return { ok: false, reason: "Only .pdf, .jpg, .jpeg, .png allowed." };
  }
  if (file.type && !ALLOWED_MIME.has(file.type)) {
    return { ok: false, reason: `Unsupported MIME type: ${file.type}` };
  }
  const kind = await readMagicHead(file);
  const extKind =
    ext === ".pdf" ? "pdf" : ext === ".png" ? "png" : "jpg";
  if (kind === "unknown") return { ok: false, reason: "File content is not a PDF/JPEG/PNG." };
  if (kind !== extKind) return { ok: false, reason: "File extension does not match content." };
  return { ok: true };
}