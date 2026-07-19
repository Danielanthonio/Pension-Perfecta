import React from "react";
import { Wallet, Landmark } from "lucide-react";

/**
 * Tipo de financiamiento del prospecto — lo elige el ALIADO al capturar (ventana
 * bloqueante en "Subir Prospecto"). Es independiente de la `modalidad` (40/10)
 * que el Director/AM fija al aprobar: este campo clasifica el producto de origen.
 */
export type TipoFinanciamiento = "credito_nomina" | "modalidad_40_10";

interface TipoFinanciamientoMeta {
  value: TipoFinanciamiento;
  label: string;
  short: string;
  description: string;
  Icon: React.ComponentType<{ className?: string }>;
  /** Clases del badge (light + dark). */
  badge: string;
  /** Acento para el selector (borde/anillo al estar activo). */
  accent: string;
}

export const TIPO_FINANCIAMIENTO_OPTIONS: TipoFinanciamientoMeta[] = [
  {
    value: "credito_nomina",
    label: "Crédito de nómina",
    short: "Crédito nómina",
    description: "El prospecto se atiende como un crédito de nómina.",
    Icon: Wallet,
    badge:
      "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/30 dark:text-amber-400 dark:border-amber-900/50",
    accent:
      "border-amber-500 ring-amber-500 bg-amber-50 dark:bg-amber-950/20 dark:border-amber-500",
  },
  {
    value: "modalidad_40_10",
    label: "Modalidad 40/10",
    short: "Modalidad 40/10",
    description: "El prospecto se atiende bajo el esquema Modalidad 40/10.",
    Icon: Landmark,
    badge:
      "bg-indigo-50 text-indigo-700 border-indigo-200 dark:bg-indigo-950/30 dark:text-indigo-400 dark:border-indigo-900/50",
    accent:
      "border-indigo-500 ring-indigo-500 bg-indigo-50 dark:bg-indigo-950/20 dark:border-indigo-500",
  },
];

export function getTipoFinanciamientoMeta(
  value: TipoFinanciamiento | null | undefined
): TipoFinanciamientoMeta | null {
  if (!value) return null;
  return TIPO_FINANCIAMIENTO_OPTIONS.find((o) => o.value === value) || null;
}

export function getTipoFinanciamientoLabel(
  value: TipoFinanciamiento | null | undefined
): string {
  return getTipoFinanciamientoMeta(value)?.label ?? "Sin definir";
}

/**
 * Badge compacto para listas/tablas. Cuando no hay tipo definido muestra un
 * estado neutro "Sin definir" (prospectos previos a esta función).
 */
export function TipoFinanciamientoBadge({
  value,
  className = "",
}: {
  value: TipoFinanciamiento | null | undefined;
  className?: string;
}) {
  const meta = getTipoFinanciamientoMeta(value);

  if (!meta) {
    return (
      <span
        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[9px] font-bold uppercase tracking-wide border border-dashed border-slate-200 dark:border-slate-700 text-slate-400 dark:text-slate-500 bg-slate-50 dark:bg-slate-850/40 ${className}`}
      >
        Sin definir
      </span>
    );
  }

  const { Icon, short, badge } = meta;
  return (
    <span
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[9px] font-bold uppercase tracking-wide border ${badge} ${className}`}
    >
      <Icon className="h-3 w-3 shrink-0" />
      {short}
    </span>
  );
}
