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
 * Financiamiento RESUELTO por cliente. A diferencia de `getTipoFinanciamientoMeta`
 * (que devuelve el genérico "Modalidad 40/10" que elige el aliado al capturar),
 * esto colapsa el prospecto a UNA sola clasificación efectiva:
 *   - Crédito de nómina                → "Crédito de nómina" (ámbar)
 *   - Modalidad 40/10 aprobada en "10" → "Modalidad 10" (esmeralda)
 *   - Modalidad 40/10 en cualquier otro caso (aprobada en "40" o aún sin decidir)
 *                                      → "Modalidad 40" (azul, el default)
 * Nunca se muestra el combinado "40/10" por cliente: es una o la otra. La
 * modalidad concreta la fija Dirección al aprobar; mientras tanto se asume 40.
 */
export type FinanciamientoKind = "credito_nomina" | "modalidad_40" | "modalidad_10";

export interface FinanciamientoResueltoMeta {
  kind: FinanciamientoKind;
  label: string;
  short: string;
  description: string;
  Icon: React.ComponentType<{ className?: string }>;
  badge: string;
  accent: string;
}

const MODALIDAD_40_META: Omit<FinanciamientoResueltoMeta, "kind"> = {
  label: "Modalidad 40",
  short: "Modalidad 40",
  description: "El prospecto se atiende en Modalidad 40.",
  Icon: Landmark,
  badge:
    "bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/30 dark:text-blue-400 dark:border-blue-900/50",
  accent:
    "border-blue-500 ring-blue-500 bg-blue-50 dark:bg-blue-950/20 dark:border-blue-500",
};

const MODALIDAD_10_META: Omit<FinanciamientoResueltoMeta, "kind"> = {
  label: "Modalidad 10",
  short: "Modalidad 10",
  description: "El prospecto se aprobó en Modalidad 10.",
  Icon: Landmark,
  badge:
    "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/30 dark:text-emerald-400 dark:border-emerald-900/50",
  accent:
    "border-emerald-500 ring-emerald-500 bg-emerald-50 dark:bg-emerald-950/20 dark:border-emerald-500",
};

export function getFinanciamientoResuelto(
  tipo: TipoFinanciamiento | null | undefined,
  modalidad: string | null | undefined
): FinanciamientoResueltoMeta | null {
  if (!tipo) return null;
  if (tipo === "credito_nomina") {
    const cn = TIPO_FINANCIAMIENTO_OPTIONS[0];
    return {
      kind: "credito_nomina",
      label: cn.label,
      short: cn.short,
      description: cn.description,
      Icon: cn.Icon,
      badge: cn.badge,
      accent: cn.accent,
    };
  }
  // modalidad_40_10 → se resuelve a la modalidad concreta (default 40).
  return modalidad === "10"
    ? { kind: "modalidad_10", ...MODALIDAD_10_META }
    : { kind: "modalidad_40", ...MODALIDAD_40_META };
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
 * Badge compacto para listas/tablas. Muestra el financiamiento RESUELTO del
 * cliente: Crédito de nómina, Modalidad 40 o Modalidad 10 — nunca el combinado
 * "40/10". La modalidad concreta la fija Dirección al aprobar (`modalidad`);
 * mientras no la decida, un prospecto de Modalidad 40/10 se muestra como
 * Modalidad 40 (el default). Cuando no hay tipo definido muestra un estado
 * neutro "Sin definir" (prospectos previos a esta función).
 */
export function TipoFinanciamientoBadge({
  value,
  modalidad,
  className = "",
}: {
  value: TipoFinanciamiento | null | undefined;
  modalidad?: string | null;
  className?: string;
}) {
  const meta = getFinanciamientoResuelto(value, modalidad);

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
