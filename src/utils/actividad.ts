// Catálogo de actividad de los Account Managers.
//
// Un único sitio donde se decide QUÉ se registra y CÓMO se llama, compartido por
// las dos puntas: el vigilante que graba (`components/ActividadTracker`, más las
// llamadas repartidas por AppContext) y el panel que lo lee
// (`components/reportes/ActividadAMPanel`). Si cada punta tuviera su lista, el
// reporte acabaría enseñando slugs crudos para actividades que sí sabemos nombrar.
//
// El slug NO vive en la base como enum ni como CHECK (ver la migración
// 20260809000000): añadir una actividad es tocar este fichero y nada más. A
// cambio, el panel tiene que saber rotular un slug desconocido — ahí está
// `etiquetaTipo`, que ante lo que no conoce devuelve el propio slug en vez de
// esconder el renglón.

/** Slugs que graba la app hoy. Es una lista abierta: la base acepta cualquiera. */
export const TIPO_VISTA_MODULO = "vista_modulo";
export const TIPO_ABRE_EXPEDIENTE = "abre_expediente";

export interface TipoActividad {
  id: string;
  /** Etiqueta larga: tablas, CSV y tooltips. */
  label: string;
  /** Etiqueta corta para la botonera de filtro. */
  short: string;
  /** Qué significa esta actividad. Se enseña como `title` en el filtro. */
  ayuda: string;
}

/**
 * En orden de lectura, no de frecuencia: primero lo que dice si el AM ENTRA y
 * MIRA, después lo que dice si TRABAJA el expediente. Es la pregunta que trae a
 * este reporte: si un AM no cierra, ¿es porque no le llegan clientes o porque no
 * los toca?
 */
export const TIPOS_ACTIVIDAD: TipoActividad[] = [
  { id: TIPO_VISTA_MODULO, label: "Entra a un módulo", short: "Módulos", ayuda: "Abrió una sección de la plataforma (Clientes, Agenda, Reportes…)." },
  { id: TIPO_ABRE_EXPEDIENTE, label: "Abre el expediente de un cliente", short: "Expedientes", ayuda: "Entró a la ficha de un cliente concreto. Es el seguimiento: mide si revisa su cartera." },
  { id: "cambia_etapa", label: "Cambia la etapa de un proyecto", short: "Etapas", ayuda: "Movió un proyecto de etapa o subetapa, con o sin comentario." },
  { id: "agenda_asesoria", label: "Agenda una asesoría", short: "Agendas", ayuda: "Grabó la fecha de la reunión de asesoría." },
  { id: "simulacion", label: "Guarda una simulación", short: "Simulaciones", ayuda: "Guardó el cálculo de pensión y financiamiento del cliente." },
  { id: "sube_documento", label: "Sube un documento", short: "Documentos", ayuda: "Añadió un documento al expediente." },
  { id: "borra_documento", label: "Borra un documento", short: "Borra doc.", ayuda: "Quitó un documento del expediente." },
  { id: "crea_proyecto", label: "Da de alta un proyecto", short: "Altas", ayuda: "Capturó un cliente nuevo." },
  { id: "edita_cliente", label: "Edita los datos del cliente", short: "Ediciones", ayuda: "Corrigió nombre, NSS, CURP, teléfono o correo." },
  { id: "modalidad", label: "Fija la modalidad de aprobación", short: "Modalidad", ayuda: "Marcó el proyecto como Modalidad 40 o 10." },
  { id: "reasigna", label: "Reasigna un proyecto", short: "Reasigna", ayuda: "Cambió el aliado o el account manager de un proyecto." },
  { id: "papelera", label: "Manda un proyecto a la papelera", short: "Papelera", ayuda: "Retiró un proyecto de la cartera activa." },
];

const TIPO_POR_ID = new Map(TIPOS_ACTIVIDAD.map((t) => [t.id, t]));

/** Etiqueta larga de un slug. Lo que no está en el catálogo se rotula consigo mismo. */
export function etiquetaTipo(id: string): string {
  return TIPO_POR_ID.get(id)?.label ?? id;
}

export function etiquetaTipoCorta(id: string): string {
  return TIPO_POR_ID.get(id)?.short ?? id;
}

export function ayudaTipo(id: string): string | undefined {
  return TIPO_POR_ID.get(id)?.ayuda;
}

/** Orden del catálogo; lo desconocido va al final, no se pierde. */
export function ordenTipo(id: string): number {
  const i = TIPOS_ACTIVIDAD.findIndex((t) => t.id === id);
  return i === -1 ? TIPOS_ACTIVIDAD.length : i;
}

// ---------------------------------------------------------------------------
// Rutas → módulo
// ---------------------------------------------------------------------------
// El vigilante deduce de la URL a qué módulo entró el usuario, así que ninguna
// pantalla tiene que acordarse de avisar. El precio es que esta tabla hay que
// tocarla al añadir una ruta nueva; el default («Otra sección») evita que una
// ruta olvidada deje de contar como visita.
//
// ⚠️ De más específica a más general: `/admin/asignacion-closer` tiene que
// mirarse ANTES que `/admin/asignacion`, o se rotularía mal.
const MODULOS: { prefijo: string; label: string }[] = [
  { prefijo: "/admin/account-managers", label: "Account managers" },
  { prefijo: "/admin/agenda-futura", label: "Agenda futura" },
  { prefijo: "/admin/asignacion-closer", label: "Asignación de closers" },
  { prefijo: "/admin/asignacion", label: "Asignación de aliados" },
  { prefijo: "/admin/empresas-multialiado", label: "Empresas multialiado" },
  { prefijo: "/admin/classroom", label: "Classroom" },
  { prefijo: "/admin/clientes", label: "Gestión de clientes" },
  { prefijo: "/admin/closers", label: "Closers" },
  // La ruta es la misma para todos, pero solo se registra la actividad de los
  // Account Managers, y lo que ellos encuentran ahí es su propia liquidación
  // (20260810000000). Rotularlo «Finanzas» a secas haría leer al reporte que el
  // AM entró al libro mayor de la empresa, que es justo lo que no puede ver.
  { prefijo: "/admin/finanzas", label: "Mis comisiones" },
  { prefijo: "/admin/aliados", label: "Aliados" },
  { prefijo: "/admin/nuevo", label: "Alta de proyecto" },
  { prefijo: "/admin/reportes", label: "Reportes" },
  { prefijo: "/admin/usuarios", label: "Usuarios" },
  { prefijo: "/dashboard/clientes", label: "Gestión de clientes" },
  { prefijo: "/dashboard/classroom", label: "Classroom" },
  { prefijo: "/dashboard/aliados", label: "Aliados" },
  { prefijo: "/dashboard/nuevo", label: "Alta de proyecto" },
  { prefijo: "/admin", label: "Panel de dirección" },
  { prefijo: "/dashboard", label: "Panel" },
];

export interface ActividadDeRuta {
  tipo: string;
  detalle?: string;
  entidadId?: string;
}

/**
 * Qué actividad representa estar en esta URL.
 *
 * `/prospectos/<id>` es el caso que de verdad importa —abrir la ficha de un
 * cliente es el seguimiento— y se graba con el id del proyecto, de modo que el
 * reporte puede decir a cuántos clientes DISTINTOS entró y no solo cuántas veces
 * hizo clic. El resto de rutas son visitas de módulo.
 *
 * Devuelve `null` para lo que no es trabajo: login, registro, cambio de
 * contraseña y la portada. Contarlas ensuciaría el ranking con actividades que
 * no dicen nada de la gestión.
 */
export function actividadDeRuta(pathname: string): ActividadDeRuta | null {
  if (!pathname) return null;
  const ruta = pathname.length > 1 && pathname.endsWith("/") ? pathname.slice(0, -1) : pathname;

  const expediente = /^\/prospectos\/([^/]+)$/.exec(ruta);
  if (expediente) return { tipo: TIPO_ABRE_EXPEDIENTE, entidadId: expediente[1] };

  const modulo = MODULOS.find((m) => ruta === m.prefijo || ruta.startsWith(`${m.prefijo}/`));
  if (modulo) return { tipo: TIPO_VISTA_MODULO, detalle: modulo.label };

  return null;
}

// ---------------------------------------------------------------------------
// Formato de duración
// ---------------------------------------------------------------------------

/**
 * Segundos → «5 h 20 m». Los minutos sueltos se leen mucho peor en decimales
 * («3,42 h» obliga a multiplicar mentalmente por 60), y este panel se mira de
 * un vistazo para comparar a unas personas con otras.
 *
 * Por debajo de un minuto no se dice «0 m» a secas: se dice «< 1 m», que es la
 * diferencia entre «entró un momento» y «no entró».
 */
export function formatDuracion(segundos: number): string {
  const s = Math.max(0, Math.round(segundos || 0));
  if (s === 0) return "—";
  if (s < 60) return "< 1 m";
  const min = Math.floor(s / 60);
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (h === 0) return `${m} m`;
  return m === 0 ? `${h} h` : `${h} h ${m} m`;
}

/** Horas con dos decimales, para el CSV: una hoja de cálculo suma esto, no «5 h 20 m». */
export function horasDecimales(segundos: number): string {
  return (Math.max(0, segundos || 0) / 3600).toFixed(2);
}

const MESES_CORTOS = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

/**
 * Instante ISO → «9 ago 15:33», en hora de México.
 *
 * La base devuelve UTC. Enseñarlo tal cual pondría la última conexión seis horas
 * en el futuro y haría dudar del reporte entero, así que se corre el instante y
 * se leen los campos UTC — el mismo truco que usa `diaDeCita` con la hora de la
 * asesoría. México no aplica horario de verano desde 2022, así que −06:00 es fijo.
 *
 * No se usa `toLocaleString`: la zona la pone el navegador de quien mira, y un
 * director conectado desde otro país vería horas distintas de las de su equipo.
 */
export function fechaHoraMx(iso: string | null | undefined): string {
  if (!iso) return "—";
  const t = new Date(iso).getTime();
  if (isNaN(t)) return "—";
  const d = new Date(t - 6 * 60 * 60 * 1000);
  const hh = String(d.getUTCHours()).padStart(2, "0");
  const mm = String(d.getUTCMinutes()).padStart(2, "0");
  return `${d.getUTCDate()} ${MESES_CORTOS[d.getUTCMonth()]} ${hh}:${mm}`;
}
