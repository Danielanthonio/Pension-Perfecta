"use client";

import React, { useMemo, useState } from "react";
import { ArrowDown, ArrowUp, ChevronsUpDown } from "lucide-react";

export type SortDir = "asc" | "desc";

/** Accessor returns a comparable value (number or string) for a given row. */
export type Accessors<T> = Record<string, (row: T) => number | string | null | undefined>;

export interface SortState {
  sortKey: string;
  sortDir: SortDir;
  toggle: (key: string) => void;
  setSortKey: (key: string) => void;
  setSortDir: (dir: SortDir) => void;
}

/**
 * Generic, reusable table/list sorting. Numeric values sort numerically;
 * strings sort with locale-aware, natural (numeric) comparison. Default
 * direction on selecting a new column is "desc" (mayor a menor), which is
 * what the director expects for performance metrics.
 */
export function useSortable<T>(
  data: T[],
  accessors: Accessors<T>,
  initialKey: string,
  initialDir: SortDir = "desc"
): SortState & { sorted: T[] } {
  const [sortKey, setSortKey] = useState(initialKey);
  const [sortDir, setSortDir] = useState<SortDir>(initialDir);

  const sorted = useMemo(() => {
    const acc = accessors[sortKey];
    if (!acc) return data;
    const arr = [...data].sort((a, b) => {
      const va = acc(a);
      const vb = acc(b);
      const aNil = va === null || va === undefined || va === "";
      const bNil = vb === null || vb === undefined || vb === "";
      if (aNil && bNil) return 0;
      if (aNil) return 1; // nulls always sink to the bottom
      if (bNil) return -1;
      if (typeof va === "number" && typeof vb === "number") return va - vb;
      return String(va).localeCompare(String(vb), "es", { numeric: true, sensitivity: "base" });
    });
    return sortDir === "desc" ? arr.reverse() : arr;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, sortKey, sortDir]);

  const toggle = (key: string) => {
    if (key === sortKey) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("desc");
    }
  };

  return { sorted, sortKey, sortDir, toggle, setSortKey, setSortDir };
}

/* ---- Accent tokens (neutral base + accent) ---------------------------- */
type Accent = "emerald" | "blue" | "indigo" | "teal";
const accentText: Record<Accent, string> = {
  emerald: "text-emerald-600 dark:text-emerald-400",
  blue: "text-blue-600 dark:text-blue-400",
  indigo: "text-indigo-600 dark:text-indigo-400",
  teal: "text-teal-600 dark:text-teal-400",
};

export interface SortOption {
  id: string;
  label: string;
}

/**
 * Compact "Ordenar por [campo] [dirección]" control — the explicit dropdown +
 * direction toggle the director asked for. Pairs with useSortable.
 */
export function SortControl({
  options,
  sort,
  accent = "emerald",
  label = "Ordenar",
}: {
  options: SortOption[];
  sort: SortState;
  accent?: Accent;
  label?: string;
}) {
  const dirDesc = sort.sortDir === "desc";
  return (
    <div className="flex items-center gap-1.5">
      <span className="text-[10px] font-semibold uppercase tracking-[0.08em] text-slate-400 dark:text-slate-500 hidden sm:block shrink-0">
        {label}
      </span>
      <div className="flex items-center rounded-xl border border-slate-200 dark:border-slate-750 bg-white dark:bg-slate-850 shadow-sm overflow-hidden">
        <div className="relative">
          <select
            value={sort.sortKey}
            onChange={(e) => sort.setSortKey(e.target.value)}
            className="appearance-none bg-transparent py-1.5 pl-3 pr-7 text-xs font-semibold text-slate-700 dark:text-slate-300 outline-none cursor-pointer"
          >
            {options.map((o) => (
              <option key={o.id} value={o.id} className="dark:bg-slate-900">
                {o.label}
              </option>
            ))}
          </select>
          <ChevronsUpDown className="h-3.5 w-3.5 text-slate-400 absolute right-1.5 top-1/2 -translate-y-1/2 pointer-events-none" />
        </div>
        <button
          type="button"
          onClick={() => sort.setSortDir(dirDesc ? "asc" : "desc")}
          title={dirDesc ? "Mayor a menor" : "Menor a mayor"}
          aria-label={dirDesc ? "Orden descendente" : "Orden ascendente"}
          className={`px-2 py-1.5 border-l border-slate-200 dark:border-slate-750 text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors active:scale-90 ${accentText[accent]}`}
        >
          {dirDesc ? <ArrowDown className="h-3.5 w-3.5" strokeWidth={2.5} /> : <ArrowUp className="h-3.5 w-3.5" strokeWidth={2.5} />}
        </button>
      </div>
    </div>
  );
}

/**
 * Clickable, sortable <th>. Drop-in replacement for a plain header cell.
 * Shows the active sort direction and lets the user click to sort.
 */
export function SortHeader({
  col,
  label,
  sort,
  align = "left",
  className = "",
}: {
  col: string;
  label: React.ReactNode;
  sort: SortState;
  align?: "left" | "center" | "right";
  className?: string;
}) {
  const active = sort.sortKey === col;
  const justify = align === "center" ? "justify-center" : align === "right" ? "justify-end" : "justify-start";
  return (
    <th className={`px-4 py-2.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-slate-400 dark:text-slate-500 ${className}`}>
      <button
        type="button"
        onClick={() => sort.toggle(col)}
        className={`inline-flex items-center gap-1 w-full ${justify} group hover:text-slate-700 dark:hover:text-slate-200 transition-colors ${
          active ? "text-slate-700 dark:text-slate-200" : ""
        }`}
      >
        <span>{label}</span>
        {active ? (
          sort.sortDir === "desc" ? (
            <ArrowDown className="h-3 w-3 shrink-0" strokeWidth={2.6} />
          ) : (
            <ArrowUp className="h-3 w-3 shrink-0" strokeWidth={2.6} />
          )
        ) : (
          <ChevronsUpDown className="h-3 w-3 shrink-0 opacity-0 group-hover:opacity-60 transition-opacity" />
        )}
      </button>
    </th>
  );
}
