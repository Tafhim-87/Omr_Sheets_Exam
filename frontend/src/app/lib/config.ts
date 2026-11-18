const num = (v: string | undefined, d: number): number => {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : d;
};

export const config = {
  backendUrl: process.env.BACKEND_URL ?? "http://localhost:8000",
  backendToken: process.env.BACKEND_API_TOKEN || undefined,
  allowedOrigins: (process.env.ALLOWED_ORIGINS ?? "http://localhost:3000")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean),
  maxUploadMb: num(process.env.MAX_UPLOAD_MB, 50),
  publicMaxUploadMb: num(process.env.NEXT_PUBLIC_MAX_UPLOAD_MB, 50),
  publicApiBaseUrl: process.env.NEXT_PUBLIC_API_BASE_URL || "",
  pollIntervalBaseMs: 1500,
  pollIntervalMaxMs: 15_000,
  pollFactor: 1.4,
  pollConcurrency: 4,
  pollMaxDurationMs: 30 * 60 * 1000,
  pollMaxErrors: 6,
  requestTimeoutMs: 15_000,
  uploadConcurrency: 3,
} as const;

export const isDirectMode = config.publicApiBaseUrl.length > 0;