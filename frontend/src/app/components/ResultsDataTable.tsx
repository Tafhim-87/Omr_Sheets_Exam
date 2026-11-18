"use client";

import { useMemo, useRef, useState } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { m } from "framer-motion";
import { Download, Search } from "lucide-react";
import type { OmrBatchResult, SheetResultItem } from "../types/omr";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Badge } from "../components/ui/badge";
import { downloadCsv, resultsToCsv } from "../lib/csv";
import { REVIEW_MESSAGE_BN, formatScore } from "../lib/format";

type Filter = "all" | "review" | "ok";
type SortKey = "roll" | "reg" | "mcq";

export default function ResultsDataTable({
  result,
  onRowClick,
}: {
  result: OmrBatchResult;
  onRowClick: (row: SheetResultItem) => void;
}) {
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [sort, setSort] = useState<SortKey>("roll");
  const parentRef = useRef<HTMLDivElement>(null);

  const rows = useMemo(() => {
    const s = q.trim().toLowerCase();
    let list = result.sheets.filter((r) => {
      if (filter === "review" && !r.needs_review) return false;
      if (filter === "ok" && r.needs_review) return false;
      if (!s) return true;
      return (
        (r.roll ?? "").toLowerCase().includes(s) ||
        (r.reg ?? "").toLowerCase().includes(s)
      );
    });
    list = [...list].sort((a, b) => {
      const av = a[sort] ?? "";
      const bv = b[sort] ?? "";
      if (typeof av === "number" && typeof bv === "number") return av - bv;
      return String(av).localeCompare(String(bv));
    });
    return list;
  }, [result.sheets, q, filter, sort]);

  const rowVirtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 44,
    overscan: 12,
  });

  const exportCsv = () => {
    downloadCsv(`omr-${Date.now()}.csv`, resultsToCsv(rows));
  };

  return (
    <section className="card">
      <div className="card-header stack">
        <div className="row" style={{ justifyContent: "space-between", flexWrap: "wrap" }}>
          <h2>Results ({rows.length})</h2>
          <div className="row">
            <Button variant="outline" onClick={exportCsv}>
              <Download size={14} /> Export CSV
            </Button>
          </div>
        </div>
        <div className="row" style={{ flexWrap: "wrap" }}>
          <Badge>Total {result.graded_sheets}</Badge>
          <Badge variant="warning">Review {result.review_sheets}</Badge>
          <Badge variant="danger">Failed {result.failed_sheets}</Badge>
        </div>
        <div className="row" style={{ flexWrap: "wrap" }}>
          <div className="row">
            <Search size={16} />
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search roll / reg"
            />
          </div>
          <select
            className="input"
            value={filter}
            onChange={(e) => setFilter(e.target.value as Filter)}
          >
            <option value="all">All</option>
            <option value="review">Needs review</option>
            <option value="ok">OK</option>
          </select>
          <select
            className="input"
            value={sort}
            onChange={(e) => setSort(e.target.value as SortKey)}
          >
            <option value="roll">Sort: Roll</option>
            <option value="reg">Sort: Reg</option>
            <option value="mcq">Sort: MCQ</option>
          </select>
        </div>
      </div>

      <div className="card-content">
        {rows.length === 0 ? (
          <p className="muted">No results match the current filter.</p>
        ) : (
          <div
            className="virtual-wrap"
            style={{ border: "1px solid #e5e7eb", borderRadius: 8, overflow: "hidden" }}
          >
            {/* Header — outside the scroll container, grid-aligned with rows */}
            <div className="v-header" role="row">
              <span className="v-cell v-num">#</span>
              <span className="v-cell">Roll</span>
              <span className="v-cell">Reg</span>
              <span className="v-cell">Right</span>
              <span className="v-cell">Wrong</span>
              <span className="v-cell">Unans</span>
              <span className="v-cell">MCQ</span>
              <span className="v-cell">Status</span>
            </div>

            {/* Only rows live inside the scrolling element */}
            <div
              ref={parentRef}
              style={{ height: 500, overflow: "auto" }}
              role="rowgroup"
            >
              <div
                style={{
                  height: rowVirtualizer.getTotalSize(),
                  position: "relative",
                  width: "100%",
                }}
              >
                {rowVirtualizer.getVirtualItems().map((vi) => {
                  const r = rows[vi.index]!;
                  return (
                    <m.div
                      key={vi.key}
                      className={`v-row ${r.needs_review ? "v-row-review" : ""}`}
                      style={{
                        position: "absolute",
                        top: 0,
                        left: 0,
                        right: 0,
                        height: vi.size,
                        transform: `translateY(${vi.start}px)`,
                      }}
                      onClick={() => onRowClick(r)}
                      role="button"
                      tabIndex={0}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          onRowClick(r);
                        }
                      }}
                    >
                      <span className="v-cell v-num">{vi.index + 1}</span>
                      <span className="v-cell">{r.roll ?? "—"}</span>
                      <span className="v-cell">{r.reg ?? "—"}</span>
                      <span className="v-cell">{r.right}</span>
                      <span className="v-cell">{r.wrong}</span>
                      <span className="v-cell">{r.unanswered}</span>
                      <span className="v-cell">{formatScore(r.mcq)}</span>
                      <span className="v-cell">
                        {r.needs_review ? (
                          <Badge variant="warning">{REVIEW_MESSAGE_BN}</Badge>
                        ) : (
                          <Badge variant="success">OK</Badge>
                        )}
                      </span>
                    </m.div>
                  );
                })}
              </div>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}