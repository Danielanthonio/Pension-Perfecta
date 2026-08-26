// Notas de seguimiento de un proyecto: reglas de FECHA y de ROL en un solo sitio.
//
// Las dos puntas que las usan —el panel de la ficha
// (`components/ui/notasSeguimiento`) y la columna «Último seguimiento» de los
// dos listados de clientes— tienen que estar de acuerdo en qué es "un día" y en
// cuándo un proyecto se considera abandonado. Si cada una lo calculara por su
// cuenta, la ficha diría «hace 2 días» y la tabla «hace 3».
//
// La tabla vive en `public.prospect_notas` (migración 20260825000000).

/**
 * Roles que PUEDEN escribir una nota. Es la misma lista que la política de
 * INSERT en la base: aquí solo sirve para no enseñar el formulario a quien la
 * base le va a rechazar la escritura.
 *
 * Closer y finanzas quedan fuera a propósito: no trabajan expedientes (la ficha
 * del proyecto ni siquiera se les abre).
 *
 * ⚠️ El front mapea 'admin' → 'director' al leer el perfil (ver `mapProfileFromDB`
 * en AppContext), así que aquí el rol de Dirección llega SIEMPRE como 'director'.
 */
export const ROLES_QUE_ESCRIBEN_NOTAS = ["aliado", "account_manager", "director"] as const;

export function puedeEscribirNotas(role: string | null | undefined): boolean {
  return !!role && (ROLES_QUE_ESCRIBEN_NOTAS as readonly string[]).includes(role);
}

// ---------------------------------------------------------------------------
// Fechas
// ---------------------------------------------------------------------------
// La base guarda UTC. Si se leyera tal cual, una nota escrita a las 19:00 del
// lunes en México se agruparía bajo el martes y el conteo de «días de
// seguimiento» saldría inflado. Se corre el instante seis horas y se leen los
// campos UTC — el mismo truco que ya usa `utils/actividad.ts`. México no aplica
// horario de verano desde 2022, así que −06:00 es fijo.
//
// Tampoco se usa `toLocaleDateString` a secas: la zona la pondría el navegador
// de quien mira, y un director conectado desde otro país vería días distintos de
// los de su equipo.

const MX_OFFSET_MS = 6 * 60 * 60 * 1000;
const MESES_CORTOS = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
const MESES_LARGOS = [
  "enero", "febrero", "marzo", "abril", "mayo", "junio",
  "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
];
const DIAS_SEMANA = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];

/** Instante ISO → el `Date` corrido a México, para leerle los campos UTC. */
function enMexico(iso: string | null | undefined): Date | null {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  if (isNaN(t)) return null;
  return new Date(t - MX_OFFSET_MS);
}

/** Instante ISO → «2026-08-25» (día de México). Es la clave con la que se agrupa. */
export function diaMx(iso: string | null | undefined): string | null {
  const d = enMexico(iso);
  if (!d) return null;
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(d.getUTCDate()).padStart(2, "0");
  return `${d.getUTCFullYear()}-${mm}-${dd}`;
}

/** El día de México de AHORA. */
export function hoyMx(): string {
  return diaMx(new Date().toISOString()) as string;
}

/** Instante ISO → «15:33» (hora de México). */
export function horaMx(iso: string | null | undefined): string {
  const d = enMexico(iso);
  if (!d) return "—";
  return `${String(d.getUTCHours()).padStart(2, "0")}:${String(d.getUTCMinutes()).padStart(2, "0")}`;
}

/** Instante ISO → «25 ago 2026». Para la columna del listado, que va apretada. */
export function fechaCortaMx(iso: string | null | undefined): string {
  const d = enMexico(iso);
  if (!d) return "—";
  return `${d.getUTCDate()} ${MESES_CORTOS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

/**
 * Instante ISO → «lunes, 25 de agosto de 2026». Es la cabecera de cada grupo de
 * notas del mismo día, que es lo que hace que la bitácora se lea como una
 * agenda de seguimiento y no como una lista de párrafos.
 */
export function fechaLargaMx(iso: string | null | undefined): string {
  const d = enMexico(iso);
  if (!d) return "—";
  return `${DIAS_SEMANA[d.getUTCDay()]}, ${d.getUTCDate()} de ${MESES_LARGOS[d.getUTCMonth()]} de ${d.getUTCFullYear()}`;
}

/**
 * Días COMPLETOS transcurridos entre el día de México de la nota y el de hoy.
 * 0 = hoy, 1 = ayer. Cuenta días de calendario, no periodos de 24 horas: una
 * nota de anoche a las 23:00 es «ayer», aunque hayan pasado nueve horas.
 */
export function diasDesdeMx(iso: string | null | undefined): number | null {
  const dia = diaMx(iso);
  if (!dia) return null;
  const a = Date.parse(`${dia}T00:00:00Z`);
  const b = Date.parse(`${hoyMx()}T00:00:00Z`);
  if (isNaN(a) || isNaN(b)) return null;
  return Math.round((b - a) / 86400000);
}

/** 0 → «hoy», 1 → «ayer», 9 → «hace 9 días». */
export function etiquetaDias(dias: number | null): string {
  if (dias === null) return "Sin seguimiento";
  if (dias <= 0) return "Hoy";
  if (dias === 1) return "Ayer";
  return `Hace ${dias} días`;
}

/**
 * Temperatura del seguimiento, para pintar la columna del listado.
 *
 * Los cortes (3 y 7 días) son los del pipeline comercial que ya usa la casa: un
 * proyecto tocado esta semana está vivo; uno que pasa de la semana sin una sola
 * nota es el que hay que ir a buscar. Se cambian aquí y cambian en las dos
 * pantallas a la vez.
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
