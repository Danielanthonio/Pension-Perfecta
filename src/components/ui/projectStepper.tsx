"use client";

import React from "react";
import { CheckCircle2 } from "lucide-react";

// Fuente única de verdad del pipeline comercial. Las fechas de cada hito NO se
// capturan a mano: el sistema las registra al cambiar de estado (trigger en BD,
// tabla prospect_status_history). Compartido por Mis Clientes (aliado) y Gestión
// Clientes (director / account manager) para que ambos vean la misma línea de tiempo.
export const STEP_STATUSES = [
  "asesoria_agendada", // 0 · Agenda Asesoría
  "doc_proceso",       // 1 · Firma Carta Compromiso
  "analisis_riesgo",   // 2 · Análisis de Riesgo
  "firma_contrato",    // 3 · Firma de Contrato
  "firma_programada",  // 4 · Fin. Otorgado · Esperando líneas de captura
  "pagado_comision",   // 5 · Fin. Otorgado · Pagado cerrado
] as const;

export const STEP_DEFS: { label: string; desc: string }[] = [
  { label: "Agenda Asesoría", desc: "Asesoría agendada para presentar propuesta" },
  { label: "Firma Carta Compromiso", desc: "Carta compromiso firmada por el cliente" },
  { label: "Análisis de Riesgo", desc: "En análisis de riesgo operativo" },
  { label: "Firma de Contrato", desc: "Contrato de financiamiento firmado" },
  { label: "Esperando líneas de captura", desc: "Fin. Otorgado: se ejecutan las líneas de captura" },
  { label: "Pagado cerrado", desc: "Comisión liberada y cobrada" },
];

// La línea de tiempo (pipeline de cierre) SOLO aplica una vez que el proyecto fue APROBADO
// o va más adelante en el pipeline. Antes del dictamen de aprobación —evaluación pendiente,
// condicionado o rechazado— no hay línea de tiempo que mostrar.
export const TIMELINE_STATUSES: readonly string[] = ["aprobado_listo", ...STEP_STATUSES];
export function hasProjectTimeline(status: string): boolean {
  return TIMELINE_STATUSES.includes(status);
}

// Estado actual del prospecto -> índice del hito activo en el stepper.
export function getActiveStageIndex(status: string): number {
  switch (status) {
    case "asesoria_agendada":
      return 0;
    case "doc_proceso":
      return 1;
    case "analisis_riesgo":
      return 2;
    case "firma_contrato":
      return 3;
    case "firma_programada":
      return 4;
    case "pagado_comision":
      return 5;
    default:
      return 0;
  }
}

// Fecha y hora en Ciudad de México, tal como quedó registrada al cambiar de estado.
export const fmtStepDateTime = (t?: number): string | null =>
  t
    ? new Date(t).toLocaleString("es-MX", {
        timeZone: "America/Mexico_City",
        day: "2-digit",
        month: "short",
        hour: "2-digit",
        minute: "2-digit",
      })
    : null;

interface ProjectStepperProps {
  /** Índice del hito activo (usar getActiveStageIndex). */
  activeIndex: number;
  /** Mapa estado -> timestamp (ms) del prospecto; opcional, muestra la fecha bajo cada hito. */
  dates?: Record<string, number>;
  className?: string;
}

// Barra de progreso horizontal del pipeline (nodos + línea + fecha por hito).
export function ProjectStepper({ activeIndex, dates, className = "" }: ProjectStepperProps) {
  return (
    <div className={`relative ${className}`}>
      <div className="absolute inset-0 flex items-center" aria-hidden="true">
        <div className="w-full border-t-2 border-slate-200 dark:border-slate-800" />
      </div>
      <div className="absolute inset-0 flex items-center" aria-hidden="true">
        <div
          className="border-t-2 border-emerald-500 transition-all duration-500"
          style={{ width: `${(activeIndex / (STEP_DEFS.length - 1)) * 100}%` }}
        />
      </div>

      <div className="relative flex justify-between w-full">
        {STEP_DEFS.map((step, idx) => {
          const isCompleted = idx < activeIndex;
          const isActive = idx === activeIndex;
          const dt = fmtStepDateTime(dates?.[STEP_STATUSES[idx]]);
          return (
            <div key={idx} className="flex flex-col items-center group relative">
              <div
                className={`h-7 w-7 rounded-full flex items-center justify-center transition-all border-2 text-[10px] font-bold ${
                  isCompleted
                    ? "bg-emerald-500 border-emerald-600 text-white shadow-sm shadow-emerald-500/20"
                    : isActive
                    ? "bg-blue-600 border-blue-700 text-white shadow-md ring-4 ring-blue-500/10 dark:ring-blue-500/5 scale-110"
                    : "bg-slate-100 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-400 dark:text-slate-500"
                }`}
              >
                {isCompleted ? <CheckCircle2 className="h-4 w-4 text-white" /> : idx + 1}
              </div>
              <span
                className={`text-[9px] font-bold mt-2 text-center transition-colors uppercase tracking-wider hidden sm:block ${
                  isActive
                    ? "text-blue-600 dark:text-blue-400"
                    : isCompleted
                    ? "text-emerald-600 dark:text-emerald-400"
                    : "text-slate-400 dark:text-slate-500"
                }`}
              >
                {step.label}
              </span>
              {dt ? (
                <span className="text-[8px] font-semibold text-slate-400 dark:text-slate-500 mt-1 text-center hidden sm:block tabular-nums whitespace-nowrap">
                  {dt}
                </span>
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}
