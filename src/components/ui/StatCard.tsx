"use client";

import React from "react";
import type { LucideIcon } from "lucide-react";

export type StatTone =
  | "slate"
  | "emerald"
  | "teal"
  | "blue"
  | "indigo"
  | "amber"
  | "cyan"
  | "rose";

const valueText: Record<StatTone, string> = {
  slate: "text-slate-900 dark:text-white",
  emerald: "text-emerald-600 dark:text-emerald-400",
  teal: "text-teal-600 dark:text-teal-400",
  blue: "text-blue-600 dark:text-blue-400",
  indigo: "text-indigo-600 dark:text-indigo-400",
  amber: "text-amber-600 dark:text-amber-400",
  cyan: "text-cyan-600 dark:text-cyan-400",
  rose: "text-rose-600 dark:text-rose-400",
};

const iconChip: Record<StatTone, string> = {
  slate: "bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-300",
  emerald: "bg-emerald-50 text-emerald-600 dark:bg-emerald-950/50 dark:text-emerald-400",
  teal: "bg-teal-50 text-teal-600 dark:bg-teal-950/50 dark:text-teal-400",
  blue: "bg-blue-50 text-blue-600 dark:bg-blue-950/50 dark:text-blue-400",
  indigo: "bg-indigo-50 text-indigo-600 dark:bg-indigo-950/50 dark:text-indigo-400",
  amber: "bg-amber-50 text-amber-600 dark:bg-amber-950/40 dark:text-amber-400",
  cyan: "bg-cyan-50 text-cyan-600 dark:bg-cyan-950/50 dark:text-cyan-400",
  rose: "bg-rose-50 text-rose-600 dark:bg-rose-950/40 dark:text-rose-400",
};

const accentBar: Record<StatTone, string> = {
  slate: "bg-slate-400",
  emerald: "bg-emerald-500",
  teal: "bg-teal-500",
  blue: "bg-blue-500",
  indigo: "bg-indigo-500",
  amber: "bg-amber-500",
  cyan: "bg-cyan-500",
  rose: "bg-rose-500",
};

/**
 * Compact KPI tile — the dense, "financial terminal" replacement for the old
 * h-28 / text-3xl / font-black stat cards. Neutral surface, accent only on the
 * number and the bottom hairline. `icon` and `sub` are optional.
 */
export function StatCard({
  label,
  value,
  sub,
  tone = "slate",
  icon: Icon,
  size = "md",
  className = "",
}: {
  label: string;
  value: React.ReactNode;
  sub?: React.ReactNode;
  tone?: StatTone;
  icon?: LucideIcon;
  size?: "md" | "sm";
  className?: string;
}) {
  const sm = size === "sm";
  return (
    <div
      className={`group relative overflow-hidden rounded-xl border border-slate-200/70 dark:border-slate-800 bg-white dark:bg-slate-900 ${sm ? "p-3" : "p-4"} shadow-sm shadow-slate-200/40 dark:shadow-none transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md ${className}`}
    >
      <div className="flex items-start justify-between gap-2">
        <span className="text-[10px] font-semibold uppercase tracking-[0.08em] text-slate-400 dark:text-slate-500 leading-tight">
          {label}
        </span>
        {Icon && (
          <div className={`${sm ? "h-6 w-6" : "h-7 w-7"} rounded-lg flex items-center justify-center shrink-0 ring-1 ring-inset ring-black/5 dark:ring-white/10 ${iconChip[tone]}`}>
            <Icon className={sm ? "h-3.5 w-3.5" : "h-4 w-4"} strokeWidth={2.2} />
          </div>
        )}
      </div>
      <div className={`${sm ? "mt-1" : "mt-2"} flex items-end justify-between gap-2`}>
        <span className={`${sm ? "text-xl" : "text-2xl"} font-bold tabular-nums tracking-tight leading-none ${valueText[tone]}`}>
          {value}
        </span>
        {sub && (
          <span className="text-[10px] font-semibold text-slate-400 dark:text-slate-500 leading-tight text-right pb-0.5">
            {sub}
          </span>
        )}
      </div>
      <span className={`absolute bottom-0 inset-x-0 h-0.5 ${accentBar[tone]} opacity-70`} />
    </div>
  );
}
