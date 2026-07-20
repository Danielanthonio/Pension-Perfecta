"use client";

import React from "react";

// Filtro/segmentado por modalidad de aprobación y tipo de financiamiento.
// Compartido por los dashboards (Todos / M40 / M10 / CN recalculan KPIs) y las
// listas de clientes/aliados (filtran). M40 = azul, M10 = esmeralda,
// CN (Crédito de nómina) = ámbar, Todos = neutro — mismo código de color que los
// badges del expediente. M40/M10 filtran por `modalidad` (la fija Dirección al
// aprobar); CN filtra por `tipo_financiamiento` (lo elige el aliado al capturar).
export type ModalidadFilterValue = "all" | "40" | "10" | "cn";

/**
 * ¿Este prospecto pasa el filtro de modalidad / tipo de financiamiento?
 * Centraliza la lógica para que dashboards y listas la compartan.
 */
export function prospectMatchesModalidadFilter(
  p: { modalidad?: string | null; tipo_financiamiento?: string | null },
  value: ModalidadFilterValue
): boolean {
  if (value === "all") return true;
  if (value === "cn") return p.tipo_financiamiento === "credito_nomina";
  return p.modalidad === value;
}

const OPTIONS: { id: ModalidadFilterValue; label: string; title: string; activeClasses: string }[] = [
  { id: "all", label: "Todos", title: "Todas las modalidades", activeClasses: "bg-white dark:bg-slate-700 text-slate-800 dark:text-white shadow-sm" },
  { id: "40", label: "M40", title: "Modalidad 40", activeClasses: "bg-white dark:bg-slate-700 text-blue-700 dark:text-blue-300 shadow-sm ring-1 ring-inset ring-blue-500/30" },
  { id: "10", label: "M10", title: "Modalidad 10", activeClasses: "bg-white dark:bg-slate-700 text-emerald-700 dark:text-emerald-300 shadow-sm ring-1 ring-inset ring-emerald-500/30" },
  { id: "cn", label: "CN", title: "Crédito de nómina", activeClasses: "bg-white dark:bg-slate-700 text-amber-700 dark:text-amber-300 shadow-sm ring-1 ring-inset ring-amber-500/30" },
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
            title={o.title}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
