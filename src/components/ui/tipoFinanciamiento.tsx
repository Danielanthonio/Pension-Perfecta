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
 * Un "slot" del expediente del prospecto. El expediente siempre tiene dos
 * documentos en dos slots: el primero (`runsOcr`) es del que el OCR lee CURP/NSS
 * y el segundo es de soporte. Qué documentos son depende del tipo de
 * financiamiento:
 *   - Crédito de nómina → Resolución de Pensión (OCR) + INE
 *   - Modalidad 40/10   → Reporte de Semanas IMSS (OCR) + Estado de Cuenta AFORE
 */
export interface ExpedienteDocSlot {
  /** Valor que se guarda en `documents.file_type`. */
  fileType: "IMSS" | "AFORE" | "RESOLUCION" | "INE";
  /** Título completo (formulario / vista del director). */
  title: string;
  /** Etiqueta corta para listas/badges. */
  shortLabel: string;
  /** Descripción de apoyo. */
  description: string;
  /** true en el slot del que el OCR extrae los datos del cliente. */
  runsOcr: boolean;
}

const EXPEDIENTE_SLOTS: Record<TipoFinanciamiento, [ExpedienteDocSlot, ExpedienteDocSlot]> = {
  credito_nomina: [
    {
      fileType: "RESOLUCION",
      title: "Resolución de Pensión",
      shortLabel: "Resolución",
      description: "Resolución de pensión del cliente. El OCR lee la CURP y el NSS de este documento.",
      runsOcr: true,
    },
    {
      fileType: "INE",
      title: "Identificación Oficial (INE)",
      shortLabel: "INE",
      description: "Credencial para votar (INE) del cliente, legible por ambos lados.",
      runsOcr: false,
    },
  ],
  modalidad_40_10: [
    {
      fileType: "IMSS",
      title: "Reporte de Semanas IMSS",
      shortLabel: "IMSS",
      description: "Reporte certificado de semanas cotizadas emitido por el IMSS.",
      runsOcr: true,
    },
    {
      fileType: "AFORE",
      title: "Estado de Cuenta AFORE",
      shortLabel: "AFORE",
      description: "Último estado de cuenta o captura digital legible de Afore.",
      runsOcr: false,
    },
  ],
};

/**
 * Slots del expediente para un tipo de financiamiento. Cuando no hay tipo
 * definido (prospectos previos a esta función) se usan los de Modalidad 40/10
 * (IMSS + AFORE), que es el comportamiento histórico.
 */
export function getExpedienteDocSlots(
  value: TipoFinanciamiento | null | undefined
): [ExpedienteDocSlot, ExpedienteDocSlot] {
  return EXPEDIENTE_SLOTS[value ?? "modalidad_40_10"] ?? EXPEDIENTE_SLOTS.modalidad_40_10;
}

const DOC_TYPE_LABELS: Record<string, string> = {
  IMSS: "IMSS",
  AFORE: "AFORE",
  RESOLUCION: "Resolución",
  INE: "INE",
  OTROS: "Otros",
};

/** Etiqueta legible de un `documents.file_type` (para sidebar/listas). */
export function getDocTypeLabel(fileType: string | null | undefined): string {
  if (!fileType) return "Documento";
  return DOC_TYPE_LABELS[fileType] ?? fileType;
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
