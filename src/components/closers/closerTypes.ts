// Tipos y utilidades compartidas del módulo Closers.
//
// La jerarquía que mide este módulo:
//
//     Dirección → Closer → Aliado → Proyecto (prospects) → Embudo
//
// Un closer prospecta y CIERRA aliados nuevos; lo que se mide es cuántos
// incorporó y, sobre todo, si esos aliados producen clientes y ventas.
//
// Las formas de fila de abajo son el CONTRATO con la base: coinciden columna a
// columna con lo que devuelven las RPC `closers_overview`, `closers_serie` y
// `closer_aliados` de 20260801000000_closers.sql. Si cambia una, cambia la otra.

// ---------------------------------------------------------------------------
// Filas que devuelve la base (o su equivalente calculado en modo demo)
// ---------------------------------------------------------------------------

/** Una fila por closer: su captación y la productividad de sus aliados. */
export interface CloserOverviewRow {
  closer_id: string;
  closer_nombre: string;
  closer_email: string | null;
  closer_telefono: string | null;
  closer_avatar_url: string | null;
  closer_created_at: string | null;

  // Lente A — captación (fecha_incorporacion_closer)
  aliados_total: number;
  aliados_periodo: number;
  aliados_productivos: number;
  aliados_sin_actividad: number;
  /** "Activo" = con al menos un cliente en los últimos 90 días. Ver nota abajo. */
  aliados_activos_90d: number;
  ultimo_aliado_at: string | null;

  // Lente B — productividad comercial (prospects.created_at)
  clientes_total: number;
  ventas_total: number;
  clientes_periodo: number;
  clientes_evaluados: number;
  clientes_aprobados: number;
  clientes_condicionados: number;
  clientes_rechazados: number;
  clientes_perdidos: number;
  ventas_periodo: number;
  ultimo_cliente_at: string | null;
}

/** Una fila por aliado incorporado, con su productividad. */
export interface CloserAliadoRow {
  aliado_id: string;
  aliado_nombre: string;
  aliado_email: string | null;
  aliado_tipo: "aliado" | "lider";
  empresa_id: string | null;
  empresa_nombre: string | null;
  fecha_incorporacion: string | null;
  es_closer_actual: boolean;
  clientes_total: number;
  clientes_periodo: number;
  clientes_en_proceso: number;
  clientes_aprobados: number;
  ventas: number;
  clientes_90d: number;
  ultimo_cliente_at: string | null;
}

/** Un punto del gráfico: aliados que ese closer incorporó en ese cubo temporal. */
export interface CloserSeriePoint {
  closer_id: string;
  /** Inicio del cubo, en formato YYYY-MM-DD. */
  periodo: string;
  aliados: number;
}

/** Fila del historial append-only de atribuciones. */
export interface CloserAsignacion {
  id: string;
  aliado_id: string;
  closer_anterior_id: string | null;
  closer_nuevo_id: string | null;
  closer_origen_id: string | null;
  tipo_movimiento: "asignacion_inicial" | "reasignacion" | "backfill" | "desasignacion";
  motivo: string | null;
  asignado_por: string | null;
  fecha_asignacion: string;
  created_at: string;
}

// ---------------------------------------------------------------------------
// Filtros
// ---------------------------------------------------------------------------

export type Grano = "dia" | "semana" | "mes" | "anio";
export type TipoGrafico = "barras" | "lineas";
/** Tipo de aliado, tal como lo modela el sistema: `aliado_tipo` + empresa. */
export type TipoAliadoFiltro = "todos" | "independiente" | "empresa" | "lider";
/** Sin `profiles.is_active` en producción, "actividad" se deriva de los clientes. */
export type EstadoAliadoFiltro = "todos" | "activos" | "sin_actividad";

export const GRANO_LABEL: Record<Grano, string> = {
  dia: "Día",
  semana: "Semana",
  mes: "Mes",
  anio: "Año",
};

// ---------------------------------------------------------------------------
// Cálculos derivados
// ---------------------------------------------------------------------------

/** Ventas ÷ clientes × 100. Sin clientes no hay conversión que reportar. */
export function conversion(ventas: number, clientes: number): number | null {
  if (!clientes) return null;
  return (ventas / clientes) * 100;
}

export function fmtPct(v: number | null, decimales = 1): string {
  if (v === null || !isFinite(v)) return "—";
  return `${v.toFixed(decimales).replace(".", ",")} %`;
}

export function promedio(total: number, entre: number): number | null {
  if (!entre) return null;
  return total / entre;
}

export function fmtNum(v: number | null, decimales = 1): string {
  if (v === null || !isFinite(v)) return "—";
  return v.toFixed(decimales).replace(".", ",");
}

/**
 * Variación contra el período anterior (§13).
 * Devuelve `null` cuando la base es cero: dividir entre cero daría Infinity y la
 * UI debe decir "Sin base de comparación" en vez de pintar un +∞ %.
 */
export function variacion(actual: number, anterior: number): number | null {
  if (!anterior) return null;
  return ((actual - anterior) / anterior) * 100;
}

// ---------------------------------------------------------------------------
// Fechas
// ---------------------------------------------------------------------------
// Todo se guarda en UTC. El corte de día se hace también en UTC, igual que el
// resto de la app (Reportes y Gestión de Clientes comparan `created_at` recortado
// a 10 caracteres). Si aquí se agrupara en hora de México, un proyecto creado a
// las 19:00 caería en un día distinto al que muestra Reportes y la Dirección
// vería dos cifras para el mismo rango. Ver la nota del §6 de la migración.

/** Fecha UTC en formato YYYY-MM-DD, sin pasar por el huso del navegador. */
export function isoDay(value: string | Date | null | undefined): string | null {
  if (!value) return null;
  const s = typeof value === "string" ? value : value.toISOString();
  return s.length >= 10 ? s.substring(0, 10) : null;
}

export function inRange(value: string | null | undefined, desde: string, hasta: string): boolean {
  const d = isoDay(value);
  if (!d) return false;
  if (desde && d < desde) return false;
  if (hasta && d > hasta) return false;
  return true;
}

/** Inicio del cubo temporal al que pertenece una fecha (UTC), como YYYY-MM-DD. */
export function bucketStart(value: string, grano: Grano): string {
  const d = new Date(value);
  if (isNaN(d.getTime())) return value.substring(0, 10);
  const y = d.getUTCFullYear();
  const m = d.getUTCMonth();
  const day = d.getUTCDate();
  if (grano === "anio") return `${y}-01-01`;
  if (grano === "mes") return `${y}-${pad(m + 1)}-01`;
  if (grano === "semana") {
    // Semana ISO: arranca en lunes. getUTCDay() da 0 para domingo.
    const dow = (d.getUTCDay() + 6) % 7;
    const monday = new Date(Date.UTC(y, m, day - dow));
    return monday.toISOString().substring(0, 10);
  }
  return `${y}-${pad(m + 1)}-${pad(day)}`;
}

const pad = (n: number) => String(n).padStart(2, "0");

const MESES_CORTOS = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

/** Etiqueta corta para el eje X del gráfico. */
export function bucketLabel(iso: string, grano: Grano): string {
  const [y, m, d] = iso.split("-").map(Number);
  if (grano === "anio") return String(y);
  if (grano === "mes") return `${MESES_CORTOS[m - 1]} ${String(y).slice(2)}`;
  if (grano === "semana") return `${d} ${MESES_CORTOS[m - 1]}`;
  return `${d} ${MESES_CORTOS[m - 1]}`;
}

/** Etiqueta larga para el tooltip. */
export function bucketFullLabel(iso: string, grano: Grano): string {
  const [y, m, d] = iso.split("-").map(Number);
  if (grano === "anio") return String(y);
  if (grano === "mes") return `${MESES_CORTOS[m - 1]} ${y}`;
  if (grano === "semana") return `Semana del ${d} ${MESES_CORTOS[m - 1]} ${y}`;
  return `${d} ${MESES_CORTOS[m - 1]} ${y}`;
}

/** Avanza un cubo. Se usa para rellenar los períodos SIN incorporaciones (§13). */
export function nextBucket(iso: string, grano: Grano): string {
  const [y, m, d] = iso.split("-").map(Number);
  if (grano === "anio") return `${y + 1}-01-01`;
  if (grano === "mes") return m === 12 ? `${y + 1}-01-01` : `${y}-${pad(m + 1)}-01`;
  const step = grano === "semana" ? 7 : 1;
  const next = new Date(Date.UTC(y, m - 1, d + step));
  return next.toISOString().substring(0, 10);
}

/** Fecha corta legible (dd/mm/aaaa) para tablas. */
export function fmtFecha(value: string | null | undefined): string {
  const d = isoDay(value);
  if (!d) return "—";
  const [y, m, day] = d.split("-");
  return `${day}/${m}/${y}`;
}

/**
 * Rangos predefinidos del §10. Devuelven fechas UTC YYYY-MM-DD.
 * `hoy` se pasa como parámetro para que la función sea pura y testeable.
 */
export type RangoPreset =
  | "hoy"
  | "7d"
  | "30d"
  | "mes_actual"
  | "mes_anterior"
  | "anio_actual"
  | "anio_anterior"
  | "todo"
  | "personalizado";

export const RANGO_LABEL: Record<RangoPreset, string> = {
  hoy: "Hoy",
  "7d": "Últimos 7 días",
  "30d": "Últimos 30 días",
  mes_actual: "Mes actual",
  mes_anterior: "Mes anterior",
  anio_actual: "Año actual",
  anio_anterior: "Año anterior",
  todo: "Histórico",
  personalizado: "Rango…",
};

export function resolveRango(preset: RangoPreset, hoy: Date): { desde: string; hasta: string } {
  const y = hoy.getUTCFullYear();
  const m = hoy.getUTCMonth();
  const d = hoy.getUTCDate();
  const iso = (dt: Date) => dt.toISOString().substring(0, 10);
  const today = iso(hoy);

  switch (preset) {
    case "hoy":
      return { desde: today, hasta: today };
    case "7d":
      return { desde: iso(new Date(Date.UTC(y, m, d - 6))), hasta: today };
    case "30d":
      return { desde: iso(new Date(Date.UTC(y, m, d - 29))), hasta: today };
    case "mes_actual":
      return { desde: iso(new Date(Date.UTC(y, m, 1))), hasta: iso(new Date(Date.UTC(y, m + 1, 0))) };
    case "mes_anterior":
      return { desde: iso(new Date(Date.UTC(y, m - 1, 1))), hasta: iso(new Date(Date.UTC(y, m, 0))) };
    case "anio_actual":
      return { desde: `${y}-01-01`, hasta: `${y}-12-31` };
    case "anio_anterior":
      return { desde: `${y - 1}-01-01`, hasta: `${y - 1}-12-31` };
    default:
      return { desde: "", hasta: "" };
  }
}

/**
 * Ventana inmediatamente anterior y del MISMO largo, para la comparativa del §13.
 * Sin rango (histórico) no hay período anterior con el que comparar.
 */
export function periodoAnterior(desde: string, hasta: string): { desde: string; hasta: string } | null {
  if (!desde || !hasta) return null;
  const a = new Date(`${desde}T00:00:00Z`).getTime();
  const b = new Date(`${hasta}T00:00:00Z`).getTime();
  if (isNaN(a) || isNaN(b) || b < a) return null;
  const dias = Math.round((b - a) / 86400000) + 1;
  const finPrevio = new Date(a - 86400000);
  const iniPrevio = new Date(a - dias * 86400000);
  return { desde: iniPrevio.toISOString().substring(0, 10), hasta: finPrevio.toISOString().substring(0, 10) };
}
