// Etapas del pipeline como botonera, compartidas por "Mis Clientes" (portal aliado) y
// "Gestión de Clientes" (director / account manager). Fuente única de verdad: los tres
// roles ven exactamente el mismo recorrido.
//
// El recorrido es el MISMO que dibuja ProjectStepper (STEP_STATUSES / STEP_DEFS): la
// botonera es esa línea de tiempo hecha clicable, con el conteo de clientes parados en
// cada hito. Por eso los pasos se derivan de ahí y no se redeclaran.
//
// Ojo: esto NO son las etapas de STAGES_LIST ni los buckets de _pipelineBuckets.ts (esos
// alimentan el embudo y los KPIs, y agrupan distinto). Aquí la pregunta es una sola:
// ¿en qué punto del recorrido está parado este cliente?

import { XCircle, MinusCircle, Trash2, LayoutGrid, AlertTriangle } from "lucide-react";
import { Prospect, isLostStatus } from "@/utils/context/AppContext";
import { STEP_STATUSES, STEP_DEFS } from "@/components/ui/projectStepper";

/** Un paso de la línea de tiempo (camino feliz). */
export type PipelineStepId = (typeof STEP_STATUSES)[number];
/** Un desvío: no está en la línea, pero el cliente tiene que seguir siendo alcanzable. */
export type OffPathTabId = "condicionado" | "rechazados" | "cerrados" | "papelera" | "todos";
export type ClientTabId = PipelineStepId | OffPathTabId;

// Estados previos al dictamen que NO condicionan: siguen contando como "Proyecto creado".
// (falta_reporte / falta_afore / pendiente_documentos son subetapas legacy de evaluación.)
const CREADO_STATUSES = ["evaluacion_pendiente", "falta_reporte", "falta_afore", "pendiente_documentos"];

// Condicionado: hay dictamen, pero con peros. Se sale de la línea hasta que se resuelva.
const CONDICIONADO_STATUSES = [
  "aportacion",
  "falta_semanas",
  "falta_afore_cuenta",
  "posible_simulacion",
  "agenda_futura",
];

/**
 * En qué hito de la línea (o en qué desvío) está parado el prospecto.
 * Devuelve `null` si su estado no encaja en ninguno (estado legacy o nuevo sin
 * clasificar): esos solo se ven en la pestaña "Todos" del director/AM.
 */
export function classifyProspect(p: Prospect): ClientTabId | null {
  const status = p.status as string;
  if (status === "rechazado") return "rechazados";
  // "Cerrado perdido" no es un rechazo: es un desenlace del cliente, con pestaña propia.
  if (isLostStatus(status)) return "cerrados";
  if (CONDICIONADO_STATUSES.includes(status)) return "condicionado";
  if (CREADO_STATUSES.includes(status)) return "evaluacion_pendiente";
  if ((STEP_STATUSES as readonly string[]).includes(status)) return status as PipelineStepId;
  return null;
}

/** ¿Este prospecto se muestra en esta pestaña? "todos" acepta cualquiera. */
export function prospectMatchesTab(p: Prospect, tab: ClientTabId): boolean {
  if (tab === "todos") return true;
  return classifyProspect(p) === tab;
}

/**
 * Los 8 hitos de la línea, en orden, listos para pintar la botonera.
 * `id` es el estado que representa el hito — el mismo que usa el stepper.
 */
export const PIPELINE_STEPS = STEP_STATUSES.map((status, index) => ({
  id: status as PipelineStepId,
  index,
  label: STEP_DEFS[index].label,
  desc: STEP_DEFS[index].desc,
}));

export interface OffPathTabMeta {
  id: OffPathTabId;
  label: string;
  Icon: typeof XCircle;
  /** Clases de la píldora activa. */
  active: string;
  /** Clases del contador cuando la píldora está activa. */
  badge: string;
  /** Texto del estado vacío. */
  empty: string;
  /** Solo la ven director y account manager. */
  adminOnly?: boolean;
}

// Fila de desvíos, debajo de la línea de tiempo.
export const OFF_PATH_TABS: OffPathTabMeta[] = [
  {
    id: "condicionado",
    label: "Condicionado",
    Icon: AlertTriangle,
    active:
      "bg-amber-50 text-amber-700 ring-1 ring-inset ring-amber-200 dark:bg-amber-950/30 dark:text-amber-300 dark:ring-amber-900/50",
    badge: "bg-amber-100 text-amber-700 dark:bg-amber-900/50 dark:text-amber-300",
    empty: "No hay proyectos condicionados.",
  },
  {
    id: "rechazados",
    label: "Rechazados",
    Icon: XCircle,
    active:
      "bg-rose-50 text-rose-700 ring-1 ring-inset ring-rose-200 dark:bg-rose-950/30 dark:text-rose-300 dark:ring-rose-900/50",
    badge: "bg-rose-100 text-rose-700 dark:bg-rose-900/50 dark:text-rose-300",
    empty: "No hay prospectos rechazados.",
  },
  {
    id: "cerrados",
    label: "Cerrados Perdidos",
    Icon: MinusCircle,
    active:
      "bg-slate-100 text-slate-700 ring-1 ring-inset ring-slate-300 dark:bg-slate-800 dark:text-slate-200 dark:ring-slate-700",
    badge: "bg-slate-200 text-slate-600 dark:bg-slate-700 dark:text-slate-200",
    empty: "No hay clientes cerrados perdidos.",
  },
  {
    id: "papelera",
    label: "Papelera",
    Icon: Trash2,
    active:
      "bg-slate-100 text-slate-700 ring-1 ring-inset ring-slate-300 dark:bg-slate-800 dark:text-slate-200 dark:ring-slate-700",
    badge: "bg-slate-200 text-slate-600 dark:bg-slate-700 dark:text-slate-200",
    empty: "Los expedientes eliminados aparecerán aquí por 7 días.",
    adminOnly: true,
  },
  {
    id: "todos",
    label: "Todos",
    Icon: LayoutGrid,
    active:
      "bg-slate-800 text-white ring-1 ring-inset ring-slate-700 dark:bg-slate-100 dark:text-slate-900 dark:ring-slate-300",
    badge: "bg-white/15 text-white dark:bg-slate-900/10 dark:text-slate-900",
    empty: "No hay prospectos que cumplan los filtros activos.",
    adminOnly: true,
  },
];

/** Etiqueta y texto de vacío de cualquier pestaña, sea hito o desvío. */
export function getTabMeta(tab: ClientTabId): { label: string; empty: string } {
  const off = OFF_PATH_TABS.find((t) => t.id === tab);
  if (off) return { label: off.label, empty: off.empty };
  const step = PIPELINE_STEPS.find((s) => s.id === tab);
  if (step) return { label: step.label, empty: `No hay clientes en "${step.label}".` };
  return { label: "Prospectos", empty: "No hay prospectos que cumplan los filtros activos." };
}
