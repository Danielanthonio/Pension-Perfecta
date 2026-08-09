"use client";

// Pestaña CLOSER del módulo Reportes.
//
// No se reimplementa nada: es el tablero del módulo Closers, embebido. Ese
// tablero ya resuelve lo que se pidió —verlo general, individual o con varios
// closers a la vez— con su botonera «Todos / <closer>», que admite selección
// múltiple, y con el botón «Ver» de cada fila, que abre la ficha completa.
//
// Duplicarlo aquí habría significado dos sitios donde cuadrar los mismos
// números, y las métricas de closers se agregan en Postgres (RPC
// `closers_overview` / `closers_serie`): el navegador ni siquiera tiene los
// datos crudos para recalcularlas.
//
// El período se comparte por la URL: `useCloserFilters` y `useReportesFilters`
// leen los mismos parámetros `rango`/`desde`/`hasta`/`grano`, así que cambiar de
// pestaña conserva el rango elegido.

import React from "react";
import Link from "next/link";
import { ArrowRight, Target } from "lucide-react";
import ClosersOverview from "@/components/closers/ClosersOverview";

export function ClosersReportes({ qs }: { qs: string }) {
  return (
    <div className="space-y-5">
      <div className="rounded-2xl border border-slate-200/70 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm px-4 py-3 flex flex-wrap items-center gap-3 print:hidden">
        <div className="h-8 w-8 rounded-lg bg-amber-50 dark:bg-amber-950/40 text-amber-600 dark:text-amber-400 flex items-center justify-center shrink-0 ring-1 ring-inset ring-amber-500/10">
          <Target className="h-4 w-4" strokeWidth={2.2} />
        </div>
        <p className="text-[11px] text-slate-500 dark:text-slate-400 flex-1 min-w-[240px] leading-relaxed">
          Usa la botonera <strong>Closer</strong> de los filtros para verlo general, individual o comparando varios.
          El botón <strong>Ver</strong> de cada fila abre la ficha completa de ese closer.
        </p>
        <Link
          href={`/admin/closers${qs}`}
          className="shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[11px] font-bold text-slate-600 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 transition-all active:scale-95"
        >
          Abrir el módulo Closers <ArrowRight className="h-3.5 w-3.5" />
        </Link>
      </div>

      <ClosersOverview embebido />
    </div>
  );
}
