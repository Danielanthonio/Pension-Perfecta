"use client";

// Barra de filtros común a las pestañas del módulo Reportes.
//
// Va ARRIBA de todo lo que acota, en una sola fila: en los bocetos los filtros
// están repetidos dentro de cada tarjeta, pero tres botoneras iguales en la misma
// pantalla invitan a que una diga una cosa y la de al lado otra. Aquí se filtra
// una vez y todos los reportes de la pestaña responden a lo mismo.
//
// Cada bloque se puede apagar: la pestaña GENERAL solo monta el PERÍODO, porque
// su propio panel ya trae "Modalidad de aprobación" —que filtra por `modalidad`
// (la que fija Dirección al aprobar) y NO es lo mismo que Producto, que filtra
// por el tipo de financiamiento resuelto—. Dos botoneras parecidas, una al lado
// de la otra, es justo lo que este archivo evita.

import React, { useState } from "react";
import { Calendar } from "lucide-react";
import { segmented, pill } from "./ReportesCharts";
import type { ReportesFilters } from "./reportesFilters";
import {
  type FinFiltro,
  type RangoPreset,
  type SegmentoAliado,
  FIN_LABEL,
  RANGO_LABEL,
  SEGMENTO_LABEL,
} from "./reportesTypes";

const PRESETS: RangoPreset[] = ["hoy", "7d", "30d", "mes_actual", "mes_a_la_fecha", "mes_anterior", "anio_actual", "anio_anterior", "todo"];
const FINS: FinFiltro[] = ["todos", "modalidad_10", "modalidad_40", "credito_nomina"];
const SEGMENTOS: SegmentoAliado[] = ["todos", "independiente", "empresa"];

export function ReportesFiltroBar({
  filters,
  setFilters,
  mostrarProducto = true,
  mostrarSegmento = true,
}: {
  filters: ReportesFilters;
  setFilters: (patch: Partial<ReportesFilters>) => void;
  mostrarProducto?: boolean;
  mostrarSegmento?: boolean;
}) {
  const [rangoAbierto, setRangoAbierto] = useState(filters.preset === "personalizado");

  return (
    <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/70 dark:border-slate-800 shadow-sm p-3.5 space-y-3 print:hidden">
      <div className="flex flex-wrap items-center gap-2">
        <span className="inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.08em] text-slate-400 dark:text-slate-500 pr-1">
          <Calendar className="h-3.5 w-3.5" /> Período
        </span>
        <div className={`${segmented} flex-wrap`}>
          {PRESETS.map((p) => (
            <button
              key={p}
              onClick={() => {
                setRangoAbierto(false);
                setFilters({ preset: p });
              }}
              className={pill(filters.preset === p)}
            >
              {RANGO_LABEL[p]}
            </button>
          ))}
          <button
            onClick={() => {
              setRangoAbierto((v) => !v);
              if (filters.preset !== "personalizado") setFilters({ preset: "personalizado" });
            }}
            className={pill(filters.preset === "personalizado")}
          >
            {RANGO_LABEL.personalizado}
          </button>
        </div>
      </div>

      {rangoAbierto && (
        <div className="flex flex-wrap items-end gap-3 rounded-xl bg-slate-50 dark:bg-slate-950/40 border border-slate-200/70 dark:border-slate-800 p-3">
          <label className="flex flex-col gap-1">
            <span className="text-[9px] font-bold uppercase tracking-wide text-slate-400 dark:text-slate-500">Desde</span>
            <input
              type="date"
              value={filters.desde}
              onChange={(e) => setFilters({ preset: "personalizado", desde: e.target.value })}
              className="px-3 py-1.5 rounded-lg text-xs bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 outline-none focus:border-emerald-500"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-[9px] font-bold uppercase tracking-wide text-slate-400 dark:text-slate-500">Hasta</span>
            <input
              type="date"
              value={filters.hasta}
              onChange={(e) => setFilters({ preset: "personalizado", hasta: e.target.value })}
              className="px-3 py-1.5 rounded-lg text-xs bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 outline-none focus:border-emerald-500"
            />
          </label>
        </div>
      )}

      {(mostrarProducto || mostrarSegmento) && (
      <div className="flex flex-wrap items-center gap-x-5 gap-y-3 pt-1 border-t border-slate-100 dark:border-slate-800">
        {mostrarProducto && (
        <div className="flex items-center gap-2 flex-wrap">
          <span
            className="text-[10px] font-bold uppercase tracking-[0.08em] text-slate-400 dark:text-slate-500"
            title="Clasificación resuelta por cliente: Modalidad 40/10 sin decidir cuenta como Modalidad 40, igual que el badge del expediente."
          >
            Producto
          </span>
          <div className={`${segmented} flex-wrap`}>
            {FINS.map((f) => (
              <button key={f} onClick={() => setFilters({ fin: f })} className={pill(filters.fin === f)}>
                {f === "todos" ? "Todos" : FIN_LABEL[f]}
              </button>
            ))}
          </div>
        </div>
        )}

        {mostrarSegmento && (
          <div className="flex items-center gap-2 flex-wrap">
            <span
              className="text-[10px] font-bold uppercase tracking-[0.08em] text-slate-400 dark:text-slate-500"
              title="Se decide por el perfil del aliado que capturó el proyecto: si pertenece a una empresa multialiado, es Empresa."
            >
              Segmento
            </span>
            <div className={segmented}>
              {SEGMENTOS.map((s) => (
                <button key={s} onClick={() => setFilters({ segmento: s })} className={pill(filters.segmento === s)}>
                  {SEGMENTO_LABEL[s]}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
      )}
    </div>
  );
}
