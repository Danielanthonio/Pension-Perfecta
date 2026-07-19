"use client";

import React from "react";

// Filtro/segmentado por modalidad de aprobación. Compartido por los dashboards
// (Todos / M40 / M10 recalculan KPIs) y las listas de clientes/aliados (filtran).
// M40 = azul, M10 = esmeralda, Todos = neutro — mismo código de color que los
// badges de modalidad del expediente.
export type ModalidadFilterValue = "all" | "40" | "10";

const OPTIONS: { id: ModalidadFilterValue; label: string; activeClasses: string }[] = [
  { id: "all", label: "Todos", activeClasses: "bg-white dark:bg-slate-700 text-slate-800 dark:text-white shadow-sm" },
  { id: "40", label: "M40", activeClasses: "bg-white dark:bg-slate-700 text-blue-700 dark:text-blue-300 shadow-sm ring-1 ring-inset ring-blue-500/30" },
  { id: "10", label: "M10", activeClasses: "bg-white dark:bg-slate-700 text-emerald-700 dark:text-emerald-300 shadow-sm ring-1 ring-inset ring-emerald-500/30" },
];

export function ModalidadFilter({
  value,
  onChange,
  className = "",
}: {
  value: ModalidadFilterValue;
  onChange: (v: ModalidadFilterValue) => void;
  className?: string;
}) {
  return (
    <div className={`inline-flex items-center gap-1 rounded-xl bg-slate-100 dark:bg-slate-800 p-1 border border-slate-200 dark:border-slate-700 ${className}`}>
      {OPTIONS.map((o) => {
        const on = value === o.id;
        return (
          <button
            key={o.id}
            type="button"
            onClick={() => onChange(o.id)}
            className={`px-3 py-1.5 rounded-lg text-[11px] font-black uppercase tracking-wider transition-all ${
              on ? o.activeClasses : "text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300"
            }`}
            title={o.id === "all" ? "Todas las modalidades" : `Modalidad ${o.id}`}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
