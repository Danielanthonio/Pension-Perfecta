// Cliente de GoHighLevel. SOLO SERVIDOR.
//
// El token es un Private Integration Token con permiso de lectura sobre TODO el
// padrón de la sub-cuenta: 830 000 contactos que no son nuestros clientes. Si
// esto llegara al navegador, cualquiera con las herramientas de desarrollo se
// lleva la base entera. Por eso nada de aquí se importa desde un componente:
// se consume por la ruta /api/ghl/cotejo, que además exige sesión y rol.
//
// -- Por qué se busca y no se descarga --
//
// La tentación era bajar los contactos y cruzarlos en memoria. Con 830 328
// contactos eso son ~8 300 páginas de 100: ni cabe en memoria ni pasa el límite
// de peticiones. Así que se hace al revés: por cada cliente NUESTRO se lanzan
// búsquedas dirigidas con los datos que sí tenemos, y se cotejan los pocos
// candidatos que vuelven.

import {
  alcanzaParaCopiar,
  cotejarContacto,
  mejorCoincidencia,
  normalizarTelefono,
  normalizarCorreo,
  normalizarTexto,
  type DatosCotejo,
  type ResultadoCotejo,
} from "@/utils/ghlMatch";

// ---------------------------------------------------------------------------
// Configuración
// ---------------------------------------------------------------------------

const BASE = process.env.GHL_API_BASE || "https://services.leadconnectorhq.com";
const VERSION = process.env.GHL_API_VERSION || "2021-07-28";

export function ghlConfigurado(): boolean {
  return !!(process.env.GHL_API_TOKEN && process.env.GHL_LOCATION_ID);
}

// Guardia de servidor sin dependencias. El paquete `server-only` sería lo
// idiomático, pero no está en el proyecto y no se añade una dependencia por un
// aviso: si este módulo llegara a evaluarse en el navegador, revienta aquí y en
// voz alta en vez de fallar callando con un token vacío.
if (typeof window !== "undefined") {
  throw new Error("@/utils/ghl/client es solo de servidor: expondría el token de GoHighLevel.");
}

function cabeceras(): Record<string, string> {
  return {
    Authorization: `Bearer ${process.env.GHL_API_TOKEN}`,
    Version: VERSION,
    Accept: "application/json",
  };
}

// ---------------------------------------------------------------------------
// Tipos de lo que devuelve GHL (solo lo que usamos)
// ---------------------------------------------------------------------------

export interface ContactoGhl {
  id: string;
  nombre: string;
  correo: string | null;
  telefono: string | null;
  /** De qué campaña entró el lead. Útil para saber si es del mismo embudo. */
  origen: string | null;
  creado: string | null;
}

export interface NotaGhl {
  id: string;
  /** Texto plano. GHL guarda el cuerpo en HTML; aquí llega ya limpio. */
  texto: string;
  fecha: string | null;
}

export interface CitaGhl {
  id: string;
  titulo: string | null;
  inicio: string | null;
  /** confirmed / showed / noshow / cancelled … tal cual lo pone GHL. */
  estado: string | null;
  /** Liga de la reunión, cuando la cita es por Meet/Zoom. */
  liga: string | null;
  notas: string | null;
}

export interface CotejoGhl {
  cotejo: ResultadoCotejo;
  contacto: ContactoGhl;
  notas: NotaGhl[];
  citas: CitaGhl[];
}

// ---------------------------------------------------------------------------
// Transporte
// ---------------------------------------------------------------------------

/** GHL agotado: se pidió más rápido de lo que deja. No es «no encontrado». */
export class GhlLimiteError extends Error {
  constructor() {
    super(
      "GoHighLevel está limitando las consultas. Espera unos segundos y cotéjalos otra vez, " +
        "o hazlo en tandas más cortas."
    );
    this.name = "GhlLimiteError";
  }
}

// -- Control de ritmo --
//
// Medido en las cabeceras de la propia API: `x-ratelimit-max: 100` cada
// `x-ratelimit-interval-milliseconds: 10000`, y 200 000 al día. El cupo es de
// la SUB-CUENTA, no de esta integración: el día que se midió ya había ~171 000
// peticiones gastadas por otras cosas conectadas a GHL. O sea que el techo real
// es más bajo que el nominal y no lo controlamos nosotros.
//
// Por eso se pide con freno: nunca más de VENTANA_MAX peticiones por ventana,
// dejando margen para esos otros consumidores. Sin esto, un lote de 25 clientes
// dispara 100 búsquedas de golpe —justo el tope— y basta con que otra
// integración esté trabajando para que empiecen a caer 429.
const VENTANA_MS = 10_000;
const VENTANA_MAX = 60;
let ventana: number[] = [];

async function esperarTurno(): Promise<void> {
  for (;;) {
    const ahora = Date.now();
    ventana = ventana.filter((t) => ahora - t < VENTANA_MS);
    if (ventana.length < VENTANA_MAX) {
      ventana.push(ahora);
      return;
    }
    // Dormir justo hasta que la más vieja salga de la ventana.
    const espera = VENTANA_MS - (ahora - ventana[0]) + 25;
    await new Promise((r) => setTimeout(r, espera));
  }
}

/**
 * GET a la API de GHL.
 *
 * Distingue tres desenlaces, y la distinción es lo importante:
 *
 *   · Respuesta buena          → los datos.
 *   · GHL no tiene nada / 4xx  → `null`, que el cotejo lee como «no está allá».
 *   · GHL nos está frenando    → `GhlLimiteError`, que SÍ revienta.
 *
 * El tercer caso tiene que reventar. Si un 429 se devolviera como `null`, el
 * cliente aparecería en pantalla como «Sin GHL» —una afirmación falsa y
 * creíble— cuando lo cierto es que no se llegó a preguntar. Vale mil veces más
 * un aviso de «vuelve a intentarlo» que un sello equivocado.
 *
 * Un fallo de red o un 5xx se reintentan un par de veces antes de rendirse a
 * `null`: que GHL parpadee no puede tumbar el listado de clientes, que es la
 * pantalla principal de trabajo del equipo.
 */
async function pedir<T>(ruta: string): Promise<T | null> {
  const INTENTOS = 3;
  for (let intento = 0; intento < INTENTOS; intento++) {
    await esperarTurno();
    try {
      const r = await fetch(`${BASE}${ruta}`, { headers: cabeceras(), cache: "no-store" });

      if (r.status === 429) {
        if (intento === INTENTOS - 1) throw new GhlLimiteError();
        // GHL cuenta por ventanas de 10 s: se espera a que se abra la siguiente.
        const retry = Number(r.headers.get("retry-after"));
        await new Promise((res) => setTimeout(res, Number.isFinite(retry) && retry > 0 ? retry * 1000 : VENTANA_MS));
        continue;
      }

      if (r.status >= 500) {
        if (intento === INTENTOS - 1) return null;
        await new Promise((res) => setTimeout(res, 400 * (intento + 1)));
        continue;
      }

      if (!r.ok) return null;
      return (await r.json()) as T;
    } catch (e) {
      if (e instanceof GhlLimiteError) throw e;
      if (intento === INTENTOS - 1) return null;
      await new Promise((res) => setTimeout(res, 400 * (intento + 1)));
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// Cómo se pregunta por un cliente
// ---------------------------------------------------------------------------

/**
 * Teléfono en el formato que GHL entiende para buscar: E.164 mexicano.
 *
 * Comprobado contra la API: `?query=4442935416` devuelve CERO resultados y
 * `?query=+524442935416` devuelve el contacto. La búsqueda es literal sobre el
 * teléfono guardado, y GHL lo guarda siempre con lada país.
 */
function telefonoBuscable(telefono: string | null | undefined): string | null {
  const diez = normalizarTelefono(telefono);
  return diez ? `+52${diez}` : null;
}

/**
 * Las formas del nombre con las que vale la pena preguntar.
 *
 * Aquí el cliente se captura como lo pide el IMSS —«ORTEGA AGUILAR IRMA»,
 * apellidos primero— y en GHL entra como se presenta el cliente —«irma ortega
 * aguilar»—. La búsqueda de GHL es ORDENADA: casa por el principio del nombre,
 * no por bolsa de palabras. Comprobado: «ORTEGA AGUILAR IRMA» y «ZUÑIGA RAUL»
 * devuelven cero; «IRMA ORTEGA AGUILAR» y «RAUL ZUÑIGA» devuelven al cliente.
 *
 * De ahí las dos variantes, en este orden:
 *   1. nombres + los dos apellidos → «JOSE LUIS LOPEZ PEÑA»
 *   2. nombres + solo el paterno   → «RAUL ZUÑIGA»
 *
 * La segunda no sobra: hay contactos capturados en GHL con un solo apellido, y
 * para esos la variante larga no casa por el principio y devuelve cero.
 */
function nombresBuscables(nombre: string | null | undefined): string[] {
  const partes = normalizarTexto(nombre).split(" ").filter(Boolean);
  if (partes.length < 3) {
    // Sin los dos apellidos no hay nada que rotar: se pregunta tal cual.
    return partes.length >= 2 ? [partes.join(" ")] : [];
  }
  const [paterno, materno, ...nombres] = partes;
  const largo = [...nombres, paterno, materno].join(" ");
  const corto = [...nombres, paterno].join(" ");
  return largo === corto ? [largo] : [largo, corto];
}

function aContacto(c: Record<string, unknown>): ContactoGhl {
  const nombre =
    (c.contactName as string) ||
    [c.firstName, c.lastName].filter(Boolean).join(" ") ||
    "";
  return {
    id: String(c.id || ""),
    nombre,
    correo: (c.email as string) || null,
    telefono: (c.phone as string) || null,
    origen: (c.source as string) || null,
    creado: (c.dateAdded as string) || null,
  };
}

/**
 * Todos los contactos de GHL que PODRÍAN ser este cliente.
 *
 * Son hasta cuatro preguntas —correo, teléfono y las dos formas del nombre— y
 * se lanzan juntas porque son independientes. El resultado se deduplica por id:
 * el mismo contacto suele volver por varias vías, y esa es justamente la señal
 * de que es el bueno.
 */
async function candidatos(local: DatosCotejo): Promise<ContactoGhl[]> {
  const loc = process.env.GHL_LOCATION_ID!;
  const consultas: string[] = [];

  const correo = normalizarCorreo(local.correo);
  if (correo) consultas.push(correo);

  const tel = telefonoBuscable(local.telefono);
  if (tel) consultas.push(tel);

  consultas.push(...nombresBuscables(local.nombre));

  const respuestas = await Promise.all(
    consultas.map((q) =>
      pedir<{ contacts?: Record<string, unknown>[] }>(
        `/contacts/?locationId=${encodeURIComponent(loc)}&limit=10&query=${encodeURIComponent(q)}`
      )
    )
  );

  const porId = new Map<string, ContactoGhl>();
  for (const r of respuestas) {
    for (const c of r?.contacts || []) {
      const contacto = aContacto(c);
      if (contacto.id && !porId.has(contacto.id)) porId.set(contacto.id, contacto);
    }
  }
  return [...porId.values()];
}

// ---------------------------------------------------------------------------
// Notas y citas
// ---------------------------------------------------------------------------

/** GHL guarda la nota en HTML; el portal la enseña como texto. */
function aTextoPlano(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/**
 * Las notas que el equipo dejó en el portal de GHL.
 *
 * No se puede decir QUIÉN la escribió: la nota trae un `userId`, pero el token
 * no tiene permiso sobre `/users/` (401 «token is not authorized for this
 * scope»). Para poner el nombre del autor haría falta añadir el scope View
 * Users a la integración privada. Mientras tanto se enseña la nota y su fecha.
 */
export async function notasDeContacto(contactoId: string): Promise<NotaGhl[]> {
  const r = await pedir<{ notes?: Record<string, unknown>[] }>(`/contacts/${contactoId}/notes`);
  const notas = (r?.notes || []).map((n) => ({
    id: String(n.id || ""),
    texto: (n.bodyText as string) || aTextoPlano((n.body as string) || ""),
    fecha: (n.dateAdded as string) || null,
  }));
  // Lo último que se dijo del cliente es lo que importa: primero lo reciente.
  return notas.sort((a, b) => (b.fecha || "").localeCompare(a.fecha || ""));
}

/** Las citas agendadas del contacto, la más próxima primero. */
export async function citasDeContacto(contactoId: string): Promise<CitaGhl[]> {
  const r = await pedir<{ events?: Record<string, unknown>[] }>(`/contacts/${contactoId}/appointments`);
  const citas = (r?.events || [])
    .filter((e) => !e.deleted)
    .map((e) => ({
      id: String(e.id || ""),
      titulo: (e.title as string) || null,
      inicio: (e.startTime as string) || null,
      estado: (e.appointmentStatus as string) || null,
      liga: (e.address as string) || null,
      notas: (e.notes as string) || null,
    }));
  return citas.sort((a, b) => (b.inicio || "").localeCompare(a.inicio || ""));
}

// ---------------------------------------------------------------------------
// El cotejo completo
// ---------------------------------------------------------------------------

/**
 * Busca a UN cliente nuestro en GHL y, si lo encuentra, se trae sus notas y sus
 * citas.
 *
 * `null` = no está en GHL (ningún candidato coincidió ni en un solo campo). No
 * se devuelve un sello gris de «no encontrado»: el listado ya tiene bastante
 * ruido y una ausencia no es un dato.
 *
 * Las notas y las citas solo se piden si el cotejo ALCANZA: dos de tres datos, o
 * el nombre completo idéntico (ver `alcanzaParaCopiar`). Con una coincidencia
 * suelta el contacto es una CONJETURA —un homónimo parcial, un teléfono
 * reciclado— y traerse las notas de otra persona a la ficha de este cliente es
 * peor que no traer nada.
 */
export async function cotejarCliente(local: DatosCotejo): Promise<CotejoGhl | null> {
  if (!ghlConfigurado()) return null;

  const posibles = await candidatos(local);
  const mejor = mejorCoincidencia(local, posibles);
  if (!mejor) return null;

  const fiable = alcanzaParaCopiar(mejor.cotejo);
  const [notas, citas] = fiable
    ? await Promise.all([notasDeContacto(mejor.contacto.id), citasDeContacto(mejor.contacto.id)])
    : [[], []];

  return { cotejo: mejor.cotejo, contacto: mejor.contacto, notas, citas };
}

export { cotejarContacto };
