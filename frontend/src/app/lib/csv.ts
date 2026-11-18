import type { SheetResultItem } from "../types/omr";

const HEADERS = [
  "page", "class", "section", "subject", "roll", "reg",
  "mcq", "total_questions", "right", "wrong", "unanswered", "needs_review",
] as const;

function escapeCell(v: unknown): string {
  let s = v == null ? "" : String(v);
  // Formula-injection guard: prefix dangerous leading chars
  if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
  // Preserve leading zeros (e.g. roll "000011")
  if (/^\d+$/.test(s) && /^0/.test(s) && s.length > 1) s = `="${s}"`;
  if (/[",\n\r]/.test(s)) s = `"${s.replace(/"/g, '""')}"`;
  return s;
}

export function resultsToCsv(sheets: SheetResultItem[]): string {
  const lines: string[] = [HEADERS.join(",")];
  for (const s of sheets) {
    const row = HEADERS.map((h) => {
      const v = (s as unknown as Record<string, unknown>)[h];
      return escapeCell(v);
    });
    lines.push(row.join(","));
  }
  return lines.join("\r\n");
}

export function downloadCsv(filename: string, csv: string): void {
  const blob = new Blob([`\uFEFF${csv}`], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}