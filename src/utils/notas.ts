// Notas de seguimiento de un proyecto: reglas de FECHA y de ROL en un solo sitio.
//
// Las puntas que las usan —el panel de la ficha, el cajón lateral de los
// listados y la columna «Último seguimiento»— tienen que estar de acuerdo en qué
// es "un día" y en cuándo un proyecto se considera abandonado. Si cada una lo
// calculara por su cuenta, la ficha diría «hace 2 días» y la tabla «hace 3».
//
// La tabla vive en `public.prospect_notas` (migración 20260825000000).

/**
 * Roles que PUEDEN escribir una nota. Es la misma lista que la política de
 * INSERT en la base: aquí solo sirve para no enseñar el formulario a quien la
 * base le va a rechazar la escritura.
 *
 * Closer y finanzas quedan fuera a propósito: no trabajan expedientes.
 *
 * ⚠️ El front mapea 'admin' → 'director' al leer el perfil (ver `mapProfileFromDB`
 * en AppContext), así que aquí el rol de Dirección llega SIEMPRE como 'director'.
 */
export const ROLES_QUE_ESCRIBEN_NOTAS = ["aliado", "account_manager", "director"] as const;

export function puedeEscribirNotas(role: string | null | undefined): boolean {
  return !!role && (ROLES_QUE_ESCRIBEN_NOTAS as readonly string[]).includes(role);
}

// ---------------------------------------------------------------------------
// Fechas — en la hora de QUIEN MIRA
// ---------------------------------------------------------------------------
// La base guarda el instante en UTC (`timestamptz`), que es lo correcto: un
// instante es un instante. Lo que cambia es cómo se ROTULA, y eso se hace en el
// huso del navegador que lo abre — es lo que pidió Daniel: «la hora y el día del
// lugar donde se ve».
//
// Por eso aquí se leen los campos LOCALES del `Date` (`getHours`, `getDate`, …)
// y no los UTC. Un aliado en Tijuana y su account manager en Monterrey verán la
// misma nota con la hora de su reloj, cada uno el suyo.
//
// (El resto de la plataforma —el reporte de actividad del AM— sí fija −06:00 de
// México a propósito, porque ahí se COMPARAN personas entre sí y las horas
// tienen que estar en la misma regla. Son dos problemas distintos.)

const MESES_CORTOS = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

function aFecha(iso: string | null | undefined): Date | null {
  if (!iso) return null;
  const d = new Date(iso);
  return isNaN(d.getTime()) ? null : d;
}

function dosDigitos(n: number): string {
  return String(n).padStart(2, "0");
}

/** Instante → «2026-08-25» en el huso de quien mira. Clave para contar días. */
export function diaLocal(iso: string | null | undefined): string | null {
  const d = aFecha(iso);
  if (!d) return null;
  return `${d.getFullYear()}-${dosDigitos(d.getMonth() + 1)}-${dosDigitos(d.getDate())}`;
}

/** El día de hoy, en el huso de quien mira. */
export function hoyLocal(): string {
  return diaLocal(new Date().toISOString()) as string;
}

/** Instante → «18:36». */
export function horaLocal(iso: string | null | undefined): string {
  const d = aFecha(iso);
  if (!d) return "—";
  return `${dosDigitos(d.getHours())}:${dosDigitos(d.getMinutes())}`;
}

/** Instante → «25 ago 2026». Para la columna del listado, que va apretada. */
export function fechaCortaLocal(iso: string | null | undefined): string {
  const d = aFecha(iso);
  if (!d) return "—";
  return `${d.getDate()} ${MESES_CORTOS[d.getMonth()]} ${d.getFullYear()}`;
}

/**
 * Instante → «25 ago 2026 · 18:36».
 *
 * Cada nota lleva SU fecha y SU hora completas, sin agrupar por día: dos notas
 * del mismo martes son dos notas, y cada una dice a qué hora se escribió. Esa es
 * la unidad del seguimiento.
 */
export function fechaHoraLocal(iso: string | null | undefined): string {
  const d = aFecha(iso);
  if (!d) return "—";
  return `${fechaCortaLocal(iso)} · ${horaLocal(iso)}`;
}

/**
 * Días COMPLETOS de calendario entre la nota y hoy, en el huso de quien mira.
 * 0 = hoy, 1 = ayer. No son periodos de 24 horas: una nota de anoche a las 23:00
 * es «ayer», aunque hayan pasado nueve horas.
 */
export function diasDesde(iso: string | null | undefined): number | null {
  const dia = diaLocal(iso);
  if (!dia) return null;
  const a = Date.parse(`${dia}T00:00:00Z`);
  const b = Date.parse(`${hoyLocal()}T00:00:00Z`);
  if (isNaN(a) || isNaN(b)) return null;
  return Math.round((b - a) / 86400000);
}

/** 0 → «Hoy», 1 → «Ayer», 9 → «Hace 9 días». */
export function etiquetaDias(dias: number | null): string {
  if (dias === null) return "Sin seguimiento";
  if (dias <= 0) return "Hoy";
  if (dias === 1) return "Ayer";
  return `Hace ${dias} días`;
}

/**
 * Temperatura del seguimiento, para pintar la columna del listado.
 *
 * Los cortes (3 y 7 días) son los del pipeline comercial de la casa: un proyecto
 * tocado esta semana está vivo; uno que pasa de la semana sin una sola nota es el
 * que hay que ir a buscar. Se cambian aquí y cambian en todas las pantallas.
 */
export type TonoSeguimiento = "sin" | "fresco" | "tibio" | "frio";

export function tonoSeguimiento(dias: number | null): TonoSeguimiento {
  if (dias === null) return "sin";
  if (dias <= 3) return "fresco";
  if (dias <= 7) return "tibio";
  return "frio";
}

/** Clases del chip de la columna «Último seguimiento», claro y oscuro. */
export const CLASES_TONO: Record<TonoSeguimiento, string> = {
  sin: "bg-slate-100 text-slate-500 border-slate-200 dark:bg-slate-800/60 dark:text-slate-400 dark:border-slate-700",
  fresco: "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-900",
  tibio: "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-900",
  frio: "bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/40 dark:text-rose-300 dark:border-rose-900",
};

/**
 * Iniciales del autor para el avatar de la nota. Dos letras como mucho: con más
 * el círculo se convierte en una mancha.
 */
export function inicialesAutor(nombre: string | null | undefined): string {
  const partes = (nombre || "").trim().split(/\s+/).filter(Boolean);
  if (partes.length === 0) return "?";
  if (partes.length === 1) return partes[0].slice(0, 2).toUpperCase();
  return `${partes[0][0]}${partes[1][0]}`.toUpperCase();
}
