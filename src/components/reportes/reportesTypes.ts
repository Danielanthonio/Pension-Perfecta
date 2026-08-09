// Vocabulario compartido de los reportes de gestión por rol.
//
// El módulo Reportes se divide en cuatro vistas: GENERAL (el panorama que ya
// existía) y una por rol — ALIADOS, ACCOUNT MANAGER y CLOSER. Las tres primeras
// se calculan en el navegador sobre `prospects`, que AppContext ya trae recortado
// por rol; la de CLOSER reutiliza el módulo Closers, que agrega en Postgres.
//
// Las utilidades de fecha NO se reimplementan: se reexportan de `closerTypes`,
// que es donde viven desde el módulo Closers y ya cortan el día en UTC igual que
// el resto de la app. Dos implementaciones del mismo cubo temporal acabarían
// dando dos cifras para el mismo rango.

import type { Prospect, UserProfile } from "@/utils/context/AppContext";
import { isLostStatus } from "@/utils/context/AppContext";
import {
  APPROVED_STAGE,
  CONDITIONED_STAGE,
  EVALUATED_STAGE,
  FIN_OTORGADO_STAGE,
} from "@/app/admin/_pipelineBuckets";
import { getFinanciamientoResuelto } from "@/components/ui/tipoFinanciamiento";
import {
  type Grano,
  bucketFullLabel,
  bucketLabel,
  bucketStart,
  isoDay,
  nextBucket,
} from "@/components/closers/closerTypes";

export type { Grano };
export {
  GRANO_LABEL,
  RANGO_LABEL,
  bucketFullLabel,
  bucketLabel,
  bucketStart,
  conversion,
  fmtNum,
  fmtPct,
  isoDay,
  nextBucket,
  periodoAnterior,
  resolveRango,
  variacion,
} from "@/components/closers/closerTypes";
export type { RangoPreset, TipoGrafico } from "@/components/closers/closerTypes";

// ---------------------------------------------------------------------------
// Ejes del módulo
// ---------------------------------------------------------------------------

/** Las cuatro pestañas de la botonera. `general` es el panorama de siempre. */
export type RolReporte = "general" | "aliados" | "account_managers" | "closers";

export const ROL_LABEL: Record<RolReporte, string> = {
  general: "General",
  aliados: "Aliados",
  account_managers: "Account Manager",
  closers: "Closer",
};

/**
 * Filtro de producto. Colapsa a las MISMAS tres clases que ya usa el badge por
 * cliente (`getFinanciamientoResuelto`): un proyecto pertenece a una y solo una,
 * y "Modalidad 40/10 sin decidir" cae en Modalidad 40, igual que en el resto de
 * la app. Si aquí se clasificara distinto, la dona y el filtro se contradirían.
 */
export type FinFiltro = "todos" | "modalidad_10" | "modalidad_40" | "credito_nomina";

export const FIN_LABEL: Record<Exclude<FinFiltro, "todos">, string> = {
  modalidad_10: "Mod. 10",
  modalidad_40: "Mod. 40",
  credito_nomina: "Créd. nómina",
};

/** Independiente vs. empresa. Se decide por el PERFIL del aliado que capturó. */
export type SegmentoAliado = "todos" | "independiente" | "empresa";

export const SEGMENTO_LABEL: Record<SegmentoAliado, string> = {
  todos: "Todos",
  independiente: "Independientes",
  empresa: "Empresas",
};

// ---------------------------------------------------------------------------
// Métricas
// ---------------------------------------------------------------------------
// Un único sitio donde se decide qué cuenta como cada cosa, para que el gráfico
// de líneas, el ranking y las tasas no puedan divergir entre sí.
//
// ⚠️ "Proyectos" aquí es el UNIVERSO del período: TODOS los capturados, incluidos
// los cerrados perdidos. Es distinto de la tarjeta "Proyectos" del tab GENERAL,
// que los excluye porque alimenta el embudo comercial. Se hace así a propósito:
// estos reportes pintan "Cerrado Perdido" como una serie más, y si el total no
// los contuviera, las líneas dejarían de sumar el total y las tasas se calcularían
// sobre una base que no es la que se ve. Cada gráfico lo dice en su subtítulo.

export type MetricaId =
  | "proyectos"
  | "evaluados"
  | "aprobados"
  | "condicionados"
  | "otorgados"
  | "perdidos"
  | "agenda_futura"
  | "rechazados";

export interface MetricaDef {
  id: MetricaId;
  label: string;
  /** Etiqueta corta para botoneras apretadas. */
  short: string;
  /** Slot de color categórico (índice en `VIZ_SERIES_VARS`). */
  slot: number;
  match: (p: Prospect) => boolean;
}

const inSet = (set: readonly string[]) => (p: Prospect) => set.includes(p.status);

export const METRICAS: Record<MetricaId, MetricaDef> = {
  proyectos: { id: "proyectos", label: "Proyectos", short: "Proyectos", slot: 0, match: () => true },
  evaluados: { id: "evaluados", label: "Evaluados", short: "Evaluados", slot: 1, match: inSet(EVALUATED_STAGE) },
  aprobados: { id: "aprobados", label: "Aprobados", short: "Aprobados", slot: 2, match: inSet(APPROVED_STAGE) },
  condicionados: { id: "condicionados", label: "Condicionados", short: "Condic.", slot: 3, match: inSet(CONDITIONED_STAGE) },
  otorgados: { id: "otorgados", label: "Fin. Otorgado", short: "Otorgado", slot: 4, match: inSet(FIN_OTORGADO_STAGE) },
  perdidos: { id: "perdidos", label: "Cerrado Perdido", short: "Perdido", slot: 5, match: (p) => isLostStatus(p.status) },
  // Subconjunto de Condicionados (`agenda_futura` está dentro de CONDITIONED_STAGE):
  // se saca aparte porque la Dirección lo sigue como cola propia.
  agenda_futura: { id: "agenda_futura", label: "Agenda Futura", short: "Ag. Futura", slot: 6, match: (p) => p.status === "agenda_futura" },
  rechazados: { id: "rechazados", label: "Rechazados", short: "Rechaz.", slot: 7, match: (p) => p.status === "rechazado" },
};

/** Series del reporte de productividad de ALIADOS (boceto: 4 líneas). */
export const SERIES_ALIADOS: MetricaId[] = ["proyectos", "evaluados", "aprobados", "otorgados"];

/** Series del reporte de productividad diaria de AM (boceto: 6 líneas). */
export const SERIES_AM: MetricaId[] = [
  "proyectos",
  "aprobados",
  "condicionados",
  "otorgados",
  "perdidos",
  "agenda_futura",
];

/** Métricas ordenables en los rankings. */
export const METRICAS_RANKING: MetricaId[] = [
  "proyectos",
  "evaluados",
  "aprobados",
  "condicionados",
  "otorgados",
];

// ---------------------------------------------------------------------------
// Tasas
// ---------------------------------------------------------------------------
// Las tres se calculan SOBRE EL TOTAL DE PROYECTOS del conjunto que se está
// mirando, no sobre la etapa anterior. Es lo que hace comparables a dos AM con
// volúmenes distintos, y es la lectura que dan los chips del boceto
// ("tasa aprob general 50%", "tasa cierre general 3%").

export interface Tasas {
  proyectos: number;
  aprobacion: number | null;
  condicionamiento: number | null;
  cierre: number | null;
}

export function calcTasas(items: Prospect[]): Tasas {
  const total = items.length;
  if (total === 0) return { proyectos: 0, aprobacion: null, condicionamiento: null, cierre: null };
  // Un proyecto ya otorgado pasó por la aprobación: si no se sumara, la tasa
  // bajaría justo cuando el equipo cierra, que es exactamente al revés.
  const aprobados = items.filter((p) => METRICAS.aprobados.match(p) || METRICAS.otorgados.match(p)).length;
  const condicionados = items.filter(METRICAS.condicionados.match).length;
  const otorgados = items.filter(METRICAS.otorgados.match).length;
  return {
    proyectos: total,
    aprobacion: (aprobados / total) * 100,
    condicionamiento: (condicionados / total) * 100,
    cierre: (otorgados / total) * 100,
  };
}

// ---------------------------------------------------------------------------
// Subetapas (boceto «SUB ESTADOS PROYECTOS»)
// ---------------------------------------------------------------------------
// Los `status` van explícitos y en el orden real del avance. Las etiquetas son
// las de `SUB_STAGES_BY_STAGE`, para que un mismo proyecto no se llame de dos
// formas según la pantalla.

export interface SubEtapa {
  status: string;
  label: string;
}

export const SUB_APROBADOS: SubEtapa[] = [
  { status: "aprobado_listo", label: "Listo para Presentar" },
  { status: "asesoria_agendada", label: "Agenda de Asesoría" },
  { status: "doc_proceso", label: "Firma Carta Compromiso" },
  { status: "analisis_riesgo", label: "Análisis de Riesgo" },
  { status: "firma_contrato", label: "Firma de Contrato" },
  { status: "firma_programada", label: "Cerrada Ganada" },
  { status: "pagado_comision", label: "Pagada Cerrada" },
];

export const SUB_CONDICIONADOS: SubEtapa[] = [
  { status: "aportacion", label: "Aportación" },
  { status: "falta_semanas", label: "Falta detallado de semanas" },
  { status: "falta_afore_cuenta", label: "Falta estado de cuenta AFORE" },
  { status: "posible_simulacion", label: "Posible simulación laboral" },
  { status: "agenda_futura", label: "Agenda futura" },
];

/**
 * Condicionados con `status` legacy: existen en datos viejos y `CONDITIONED_STAGE`
 * los cuenta, pero no tienen subetapa propia en el modelo actual. Si se omitieran,
 * la suma de la columna no cuadraría con la tarjeta "Condicionados" y nadie sabría
 * por qué. Solo se muestran cuando hay alguno.
 */
export const SUB_CONDICIONADOS_LEGACY: SubEtapa[] = [
  { status: "falta_reporte", label: "Falta reporte (heredado)" },
  { status: "falta_afore", label: "Falta AFORE (heredado)" },
  { status: "pendiente_documentos", label: "Pendiente documentos (heredado)" },
];

// ---------------------------------------------------------------------------
// Filtrado
// ---------------------------------------------------------------------------

/** Clase de financiamiento resuelta de un proyecto, o `null` si no tiene. */
export function finKindOf(p: Prospect): FinFiltro | null {
  const meta = getFinanciamientoResuelto(p.tipo_financiamiento, p.modalidad);
  if (!meta) return null;
  return meta.kind as FinFiltro;
}

/** Independiente / empresa según el perfil del aliado que capturó el proyecto. */
export function segmentoDe(p: Prospect, perfilPorId: Map<string, UserProfile>): SegmentoAliado {
  const empresaEnProyecto = p.empresa_multialiado_id;
  const empresaEnPerfil = perfilPorId.get(p.aliado_id)?.empresa_multialiado_id;
  return empresaEnProyecto || empresaEnPerfil ? "empresa" : "independiente";
}

export interface FiltroBase {
  desde: string;
  hasta: string;
  fin: FinFiltro;
  segmento: SegmentoAliado;
}

/**
 * Un solo colador para todos los reportes de rol: rango de fechas por
 * `created_at`, producto y segmento. La papelera se descarta antes de llamar.
 */
export function aplicaFiltros(
  prospects: Prospect[],
  { desde, hasta, fin, segmento }: FiltroBase,
  perfilPorId: Map<string, UserProfile>
): Prospect[] {
  return prospects.filter((p) => {
    const d = isoDay(p.created_at);
    if (d) {
      if (desde && d < desde) return false;
      if (hasta && d > hasta) return false;
    }
    if (fin !== "todos" && finKindOf(p) !== fin) return false;
    if (segmento !== "todos" && segmentoDe(p, perfilPorId) !== segmento) return false;
    return true;
  });
}

// ---------------------------------------------------------------------------
// Cubos temporales
// ---------------------------------------------------------------------------

export interface Cubo {
  iso: string;
  label: string;
  full: string;
}

/**
 * Cubos continuos del período: se rellenan los tramos SIN movimiento, que
 * también son información. El rango arranca en el filtro si lo hay; si no, en el
 * primer y último dato. El guard de 400 evita que "Histórico + Día" intente
 * dibujar años de columnas.
 *
 * El final NUNCA pasa de hoy. Los presets de rango llegan hasta fin de mes o de
 * año ("Año actual" = 31 de diciembre), y sin este tope la curva se desplomaba a
 * cero en los meses que todavía no han ocurrido: se leía como un derrumbe de
 * producción cuando lo único que pasa es que el futuro aún no tiene datos.
 */
export function construyeCubos(fechas: string[], desde: string, hasta: string, grano: Grano): Cubo[] {
  const isos = fechas.map((f) => isoDay(f)).filter(Boolean) as string[];
  if (isos.length === 0 && !desde) return [];
  isos.sort();

  const hoy = new Date().toISOString().substring(0, 10);
  const primerDato = isos[0];
  const ultimoDato = isos[isos.length - 1];
  const inicio = bucketStart(`${desde || primerDato}T00:00:00Z`, grano);
  const finPedido = bucketStart(`${hasta || ultimoDato || desde}T00:00:00Z`, grano);
  const finHoy = bucketStart(`${hoy}T00:00:00Z`, grano);
  const fin = finPedido > finHoy ? finHoy : finPedido;
  if (!inicio || !fin || fin < inicio) return [];

  const out: Cubo[] = [];
  let cur = inicio;
  let guard = 0;
  while (cur <= fin && guard < 400) {
    out.push({ iso: cur, label: bucketLabel(cur, grano), full: bucketFullLabel(cur, grano) });
    cur = nextBucket(cur, grano);
    guard++;
  }
  return out;
}

/**
 * Serie de una métrica sobre los cubos. `acumulado` convierte la curva en un
 * total corrido; el boceto de AM pide explícitamente la cantidad del período
 * ("no acumulada"), así que cada reporte elige.
 */
export function serieDe(
  items: Prospect[],
  cubos: Cubo[],
  grano: Grano,
  match: (p: Prospect) => boolean,
  acumulado: boolean
): number[] {
  const idx = new Map(cubos.map((c, i) => [c.iso, i]));
  const vals = new Array(cubos.length).fill(0);
  for (const p of items) {
    if (!match(p)) continue;
    const d = isoDay(p.created_at);
    if (!d) continue;
    const i = idx.get(bucketStart(`${d}T00:00:00Z`, grano));
    if (i !== undefined) vals[i]++;
  }
  if (!acumulado) return vals;
  let acc = 0;
  return vals.map((v) => (acc += v));
}

// ---------------------------------------------------------------------------
// Agrupación por entidad (aliado / empresa / account manager)
// ---------------------------------------------------------------------------

export interface GrupoEntidad {
  id: string;
  nombre: string;
  items: Prospect[];
}

/**
 * Agrupa por una clave del proyecto. `sinAsignar` nombra el cubo de los que no
 * tienen esa clave (proyectos sin AM = mesa de dirección), que se muestra igual:
 * esconderlo haría que las barras no sumaran el total.
 */
export function agrupaPor(
  items: Prospect[],
  clave: (p: Prospect) => string | null,
  nombre: (id: string) => string,
  sinAsignar: string
): GrupoEntidad[] {
  const map = new Map<string, Prospect[]>();
  for (const p of items) {
    const k = clave(p) || "__sin__";
    const prev = map.get(k);
    if (prev) prev.push(p);
    else map.set(k, [p]);
  }
  return Array.from(map.entries()).map(([id, list]) => ({
    id,
    nombre: id === "__sin__" ? sinAsignar : nombre(id),
    items: list,
  }));
}

/** Mes 'YYYY-MM' de una fecha ISO; hoy si no hay. Clave de `am_objetivos`. */
export function mesDe(iso: string | null | undefined): string {
  const d = iso && iso.length >= 7 ? iso : new Date().toISOString();
  return d.substring(0, 7);
}

export function mesLabel(periodo: string): string {
  const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
  const [y, m] = periodo.split("-").map(Number);
  if (!y || !m || m < 1 || m > 12) return periodo;
  return `${MESES[m - 1]} ${y}`;
}
