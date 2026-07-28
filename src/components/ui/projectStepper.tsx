"use client";

import React from "react";
import { CheckCircle2 } from "lucide-react";

// Fuente única de verdad del pipeline comercial. Las fechas de cada hito NO se
// capturan a mano: el sistema las registra al cambiar de estado (trigger en BD,
// tabla prospect_status_history). Compartido por Mis Clientes (aliado) y Gestión
// Clientes (director / account manager) para que ambos vean la misma línea de tiempo.
// El recorrido arranca en la CREACIÓN del proyecto, no en la aprobación: los tres
// roles (aliado, account manager y director) ven exactamente esta misma línea.
export const STEP_STATUSES = [
  "evaluacion_pendiente", // 0 · Proyecto creado
  "aprobado_listo",       // 1 · Listo para Presentar (lo pone Dirección/AM al aprobar)
  "asesoria_agendada",    // 2 · Agenda de Asesoría (la pone la FECHA que graba quien agenda)
  "doc_proceso",          // 3 · Firma Carta Compromiso
  "analisis_riesgo",      // 4 · Análisis de Riesgo
  "firma_contrato",       // 5 · Firma de Contrato
  "firma_programada",     // 6 · Fin. Otorgado · Cerrada Ganada
  "pagado_comision",      // 7 · Fin. Otorgado · Pagada Cerrada
] as const;

export const STEP_DEFS: { label: string; desc: string }[] = [
  { label: "Proyecto creado", desc: "Expediente capturado, en evaluación" },
  { label: "Listo para Presentar", desc: "Aprobado: se puede presentar la propuesta al cliente" },
  { label: "Agenda de Asesoría", desc: "Reunión con el cliente agendada" },
  { label: "Firma Carta Compromiso", desc: "Carta compromiso firmada por el cliente" },
  { label: "Análisis de Riesgo", desc: "En análisis de riesgo operativo" },
  { label: "Firma de Contrato", desc: "Contrato de financiamiento firmado" },
  { label: "Cerrada Ganada", desc: "Fin. Otorgado: se ejecutan las líneas de captura" },
  { label: "Pagada Cerrada", desc: "Comisión liberada y cobrada" },
];

// Índice del paso "Proyecto creado": es también donde se planta cualquier proyecto
// todavía sin dictamen (evaluación o condicionado).
export const STEP_CREATED_INDEX = 0;

// Estados que se salen de la línea: no hay avance que dibujar.
const DEAD_END_STATUSES = ["rechazado", "cerrado_perdido", "cerrado_riesgo", "cerrado_desiste"];

// Ahora TODO proyecto vivo tiene línea de tiempo (arranca al crearse). Solo se excluyen
// los desenlaces: un rechazado o un cerrado perdido ya no avanza por esta línea.
export function hasProjectTimeline(status: string): boolean {
  return !DEAD_END_STATUSES.includes(status);
}

// Estado actual del prospecto -> índice del hito activo en el stepper.
// Los estados previos al dictamen (evaluación pendiente y condicionados) se quedan
// en "Proyecto creado", que es el default.
export function getActiveStageIndex(status: string): number {
  const idx = (STEP_STATUSES as readonly string[]).indexOf(status);
  return idx >= 0 ? idx : STEP_CREATED_INDEX;
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
  /**
   * Fecha de alta del prospecto (created_at). Da fecha al hito "Proyecto creado":
   * el historial de estados solo registra CAMBIOS, así que un proyecto recién
   * capturado no tiene fila propia de `evaluacion_pendiente`.
   */
  createdAt?: string | null;
  className?: string;
}

// Barra de progreso horizontal del pipeline (nodos + línea + fecha por hito).
export function ProjectStepper({ activeIndex, dates, createdAt, className = "" }: ProjectStepperProps) {
  const createdTs = createdAt ? new Date(createdAt).getTime() : undefined;
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
          const raw = dates?.[STEP_STATUSES[idx]] ?? (idx === STEP_CREATED_INDEX ? createdTs : undefined);
          const dt = fmtStepDateTime(raw);
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
                className={`text-[9px] font-bold mt-2 text-center transition-colors uppercase tracking-wider hidden sm:block w-[78px] leading-tight ${
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
