import "server-only";
import { config } from "./config";
import { normalizeExam } from "./normalize";
import type { ExamResponse } from "../types/omr";

export async function serverListExams(): Promise<ExamResponse[]> {
  try {
    const headers: HeadersInit = {};
    if (config.backendToken) headers["authorization"] = `Bearer ${config.backendToken}`;
    const res = await fetch(`${config.backendUrl}/api/exams`, {
      headers,
      next: { revalidate: 30 },
    });
    if (!res.ok) return [];
    const data = (await res.json()) as unknown;
    const list = Array.isArray(data)
      ? data
      : Array.isArray((data as { items?: unknown }).items)
      ? ((data as { items: unknown[] }).items)
      : [];
    return list.map(normalizeExam);
  } catch {
    return [];
  }
}