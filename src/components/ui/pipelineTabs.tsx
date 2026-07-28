"use client";

import React from "react";
import {
  PIPELINE_STEPS,
  OFF_PATH_TABS,
  ClientTabId,
} from "@/components/ui/clientTabs";

interface PipelineTabsProps {
  /** Cuántos clientes hay parados en cada hito / desvío. */
  counts: Record<string, number>;
  activeTab: ClientTabId;
  onChange: (tab: ClientTabId) => void;
  /** Director y AM ven además "Todos" y "Papelera". */
  isAdmin?: boolean;
  className?: string;
}

/**
 * La línea de tiempo del proyecto convertida en botonera: cada hito es un botón con
 * el número de clientes parados ahí, y al apretarlo se despliegan esos clientes.
 * Debajo, en una fila aparte, los desvíos (condicionado, rechazado, cerrado perdido).
 *
 * Es el mismo recorrido que dibuja ProjectStepper para un proyecto concreto —ambos
 * leen PIPELINE_STEPS / STEP_DEFS—, así que la vista de lista y la del expediente
 * nunca se contradicen.
 */
export function PipelineTabs({ counts, activeTab, onChange, isAdmin = false, className = "" }: PipelineTabsProps) {
  const offPath = OFF_PATH_TABS.filter((t) => isAdmin || !t.adminOnly);

  return (
    <div className={`space-y-3 ${className}`}>
      {/* ── La línea de tiempo ──────────────────────────────────────────────── */}
      <div className="overflow-x-auto scrollbar-thin -mx-1 px-1">
        <div className="relative min-w-[860px] pt-1">
          {/* Riel de fondo: va de centro a centro del primer y último nodo. */}
          <div
            className="absolute top-[22px] h-0.5 bg-slate-200 dark:bg-slate-800"
            style={{ left: `${100 / (PIPELINE_STEPS.length * 2)}%`, right: `${100 / (PIPELINE_STEPS.length * 2)}%` }}
            aria-hidden="true"
          />

          <div className="relative flex">
            {PIPELINE_STEPS.map((step) => {
              const count = counts[step.id] ?? 0;
              const on = activeTab === step.id;
              const empty = count === 0;
              return (
                <button
                  key={step.id}
                  onClick={() => onChange(step.id)}
                  title={step.desc}
                  aria-pressed={on}
                  className="flex-1 min-w-0 flex flex-col items-center gap-1.5 px-1 pb-1 rounded-xl transition-all active:scale-[0.97] group"
                >
                  {/* Nodo: el número es el conteo de clientes parados en el hito. */}
                  <span
                    className={`h-9 w-9 rounded-full flex items-center justify-center text-xs font-black tabular-nums border-2 transition-all ${
                      on
                        ? "bg-emerald-600 border-emerald-700 text-white shadow-md ring-4 ring-emerald-500/15 scale-110"
                        : empty
                        ? "bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-300 dark:text-slate-600 group-hover:border-slate-300 dark:group-hover:border-slate-700"
                        : "bg-white dark:bg-slate-900 border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-200 group-hover:border-emerald-400 group-hover:text-emerald-600 dark:group-hover:text-emerald-400"
                    }`}
                  >
                    {count}
                  </span>
                  <span
                    className={`text-[9px] font-bold text-center uppercase tracking-wider leading-tight transition-colors ${
                      on
                        ? "text-emerald-700 dark:text-emerald-400"
                        : empty
                        ? "text-slate-350 dark:text-slate-600"
                        : "text-slate-500 dark:text-slate-400 group-hover:text-slate-700 dark:group-hover:text-slate-200"
                    }`}
                  >
                    {step.label}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* ── Los desvíos ─────────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-1.5 border-t border-slate-100 dark:border-slate-800 pt-3">
        <span className="text-[9px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 pr-1">
          Fuera de línea
        </span>
        {offPath.map(({ id, label, Icon, active, badge }) => {
          const count = counts[id] ?? 0;
          const on = activeTab === id;
          return (
            <button
              key={id}
              onClick={() => onChange(id)}
              aria-pressed={on}
              className={`inline-flex items-center gap-1.5 pl-2.5 pr-2 py-1.5 rounded-xl text-xs font-bold transition-all active:scale-[0.97] ${
                on
                  ? `${active} shadow-sm`
                  : "text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800/60 ring-1 ring-inset ring-transparent"
              }`}
            >
              <Icon className={`h-3.5 w-3.5 ${on ? "" : "opacity-70"}`} />
              <span>{label}</span>
              <span
                className={`min-w-[20px] text-center px-1.5 py-0.5 rounded-lg text-[10px] font-black tabular-nums ${
                  on ? badge : "bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400"
                }`}
              >
                {count}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
