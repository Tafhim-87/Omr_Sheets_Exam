import { NextRequest, NextResponse } from "next/server";
import { config } from "../../lib/config";
import { rateLimit } from "../../lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ALLOWED_GET = [/^exams$/, /^omr\/status\/[A-Za-z0-9_-]{1,64}$/, /^omr\/results\/[A-Za-z0-9_-]{1,64}$/];
const ALLOWED_POST = [/^exams$/, /^omr\/upload$/];

const ALLOWED_QUERY_KEYS = new Set(["class", "subject", "subject_code", "exam_id"]);

function originAllowed(req: NextRequest): boolean {
  const origin = req.headers.get("origin");
  if (!origin) return true; // non-browser or same-origin fetch without Origin
  return config.allowedOrigins.includes(origin);
}

function clientIp(req: NextRequest): string {
  const fwd = req.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0]!.trim();
  return req.headers.get("x-real-ip") ?? "unknown";
}

function buildTarget(path: string[], req: NextRequest): URL {
  const joined = path.join("/");
  const url = new URL(`/api/${joined}`, config.backendUrl);
  for (const [k, v] of req.nextUrl.searchParams.entries()) {
    if (ALLOWED_QUERY_KEYS.has(k)) url.searchParams.set(k, v);
  }
  return url;
}

function forwardHeaders(contentType?: string | null): Headers {
  const h = new Headers();
  if (contentType) h.set("content-type", contentType);
  if (config.backendToken) h.set("authorization", `Bearer ${config.backendToken}`);
  return h;
}

function safeError(status: number): NextResponse {
  const msg =
    status === 429
      ? "Too many requests."
      : status === 413
      ? "Payload too large."
      : "Upstream request failed.";
  return NextResponse.json({ detail: msg }, { status });
}

async function handle(req: NextRequest, ctx: { params: Promise<{ path: string[] }> }) {
  const { path } = await ctx.params;
  const joined = path.join("/");
  const isGet = req.method === "GET";
  const isPost = req.method === "POST";

  if (!isGet && !isPost) {
    return NextResponse.json({ detail: "Method not allowed." }, { status: 405 });
  }
  const allowList = isGet ? ALLOWED_GET : ALLOWED_POST;
  if (!allowList.some((re) => re.test(joined))) {
    return NextResponse.json({ detail: "Endpoint not allowed." }, { status: 403 });
  }
  if (!isGet && !originAllowed(req)) {
    return NextResponse.json({ detail: "Origin not allowed." }, { status: 403 });
  }
  if (!rateLimit(clientIp(req))) return safeError(429);

  const target = buildTarget(path, req);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), config.requestTimeoutMs);

  try {
    if (isGet) {
      const res = await fetch(target, {
        method: "GET",
        headers: forwardHeaders(),
        signal: controller.signal,
        cache: "no-store",
      });
      const ct = res.headers.get("content-type") ?? "application/json";
      if (!res.ok) return safeError(res.status);
      const body = await res.arrayBuffer();
      return new NextResponse(body, {
        status: 200,
        headers: { "content-type": ct, "cache-control": "no-store" },
      });
    }

    // POST: stream request body upstream, require Content-Length
    const contentLength = req.headers.get("content-length");
    if (!contentLength) {
      return NextResponse.json({ detail: "Content-Length required." }, { status: 411 });
    }
    const maxBytes = config.maxUploadMb * 1024 * 1024;
    if (Number(contentLength) > maxBytes) return safeError(413);

    const upstreamRes = await fetch(target, {
      method: "POST",
      headers: forwardHeaders(req.headers.get("content-type")),
      body: req.body,
      // @ts-expect-error duplex is required for streaming request bodies
      duplex: "half",
      signal: controller.signal,
    });

    if (!upstreamRes.ok) return safeError(upstreamRes.status);
    const ct = upstreamRes.headers.get("content-type") ?? "application/json";
    const buf = await upstreamRes.arrayBuffer();
    return new NextResponse(buf, {
      status: upstreamRes.status,
      headers: { "content-type": ct, "cache-control": "no-store" },
    });
  } catch {
    return NextResponse.json({ detail: "Upstream unavailable." }, { status: 502 });
  } finally {
    clearTimeout(timeout);
  }
}

export { handle as GET, handle as POST };