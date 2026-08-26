// Cotejo de un cliente nuestro contra un contacto de GoHighLevel.
//
// GHL es donde se agenda al cliente y donde el equipo deja sus notas, pero los
// dos sistemas no comparten identificador: allá no existe ni el NSS ni la CURP,
// y aquí no existe el id de contacto de GHL. Lo único que se puede cruzar son
// los tres datos que un humano teclea en ambos lados: CORREO, TELÉFONO y NOMBRE.
//
// Ninguno de los tres es fiable por sí solo —el correo se escribe mal, el
// teléfono cambia, el nombre se captura en otro orden— así que no se decide
// "es o no es": se cuenta CUÁNTOS de los tres coinciden y se enseña con qué
// confianza:
//
//   3 de 3 → verde   · verificado, es el mismo cliente sin discusión
//   2 de 3 → azul    · casi seguro, pero un dato no cuadra
//   1 de 3 → amarillo· posible, hay que mirarlo a ojo
//   0 de 3 → sin sello, no se enseña nada
//
// La comparación NO es literal en ningún campo: se normaliza primero, porque si
// se comparara el texto crudo casi nada casaría y el sello verde no saldría
// nunca.

export type NivelCoincidencia = 0 | 1 | 2 | 3;

export interface DatosCotejo {
  nombre?: string | null;
  correo?: string | null;
  telefono?: string | null;
}

export interface ResultadoCotejo {
  correo: boolean;
  telefono: boolean;
  nombre: boolean;
  /** Cuántos de los tres campos coincidieron. */
  nivel: NivelCoincidencia;
  /** Qué campos coincidieron, en orden de lectura. Para el tooltip del sello. */
  camposCoincididos: string[];
}

// ---------------------------------------------------------------------------
// Normalización
// ---------------------------------------------------------------------------

/** Minúsculas y sin espacios. El correo no distingue mayúsculas en la práctica. */
export function normalizarCorreo(valor: string | null | undefined): string | null {
  const v = (valor || "").trim().toLowerCase();
  // Un correo sin arroba no es un correo: mejor NADA que un falso positivo entre
  // dos celdas vacías o dos guiones.
  if (!v || !v.includes("@")) return null;
  return v;
}

/**
 * Teléfono → los últimos 10 dígitos.
 *
 * En México el número nacional son 10 dígitos, pero el mismo cliente aparece
 * como `8991012449`, `+52 899 101 2449`, `52 899 101 2449` o con guiones según
 * quién lo capturó y si pasó por WhatsApp. Quedarse con los últimos 10 dígitos
 * hace que todas esas formas sean la misma, sin tener que adivinar el país.
 */
export function normalizarTelefono(valor: string | null | undefined): string | null {
  const digitos = (valor || "").replace(/\D+/g, "");
  if (digitos.length < 10) return null;
  return digitos.slice(-10);
}

/** Quita acentos, signos y espacios de más; deja MAYÚSCULAS. */
export function normalizarTexto(valor: string | null | undefined): string {
  return (valor || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // acentos, ya separados por NFD
    .replace(/[^a-zA-Z0-9ñÑ\s]/g, " ") // puntos, comas, guiones
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase();
}

// Partículas que no identifican a nadie y que aparecen o desaparecen según quien
// capture: "MARIA DE LA LUZ" vs "MARIA LUZ", "DEL ANGEL" vs "ANGEL".
const PARTICULAS = new Set(["DE", "DEL", "LA", "LAS", "LOS", "Y", "SAN", "DA", "DOS"]);

/** Nombre → conjunto de palabras significativas, sin orden. */
export function palabrasNombre(valor: string | null | undefined): string[] {
  return normalizarTexto(valor)
    .split(" ")
    .filter((p) => p.length > 1 && !PARTICULAS.has(p));
}

/**
 * ¿Son el mismo nombre?
 *
 * Comparar cadenas enteras no sirve: aquí el cliente se captura «RODRIGUEZ
 * GONZALEZ NOELIA» (apellidos primero, como en el IMSS) y en GHL entra «Noelia
 * Rodriguez» (como se presenta el cliente). Son la misma persona y una
 * comparación literal diría que no.
 *
 * La regla: se comparan CONJUNTOS de palabras y basta con que el nombre más
 * corto esté contenido en el más largo. Así «Noelia Rodriguez» casa con
 * «RODRIGUEZ GONZALEZ NOELIA» (falta el segundo apellido, no importa) pero NO
 * con «Noelia Martinez».
 *
 * Se exigen 2 palabras como mínimo: con una sola, cualquier «MARIA» casaría con
 * cualquier otra «MARIA» y el sello dejaría de significar nada.
 */
export function mismoNombre(a: string | null | undefined, b: string | null | undefined): boolean {
  const pa = palabrasNombre(a);
  const pb = palabrasNombre(b);
  if (pa.length < 2 || pb.length < 2) return false;

  const [corto, largo] = pa.length <= pb.length ? [pa, pb] : [pb, pa];
  const enLargo = new Set(largo);
  return corto.every((p) => enLargo.has(p));
}

// ---------------------------------------------------------------------------
// El cotejo
// ---------------------------------------------------------------------------

/**
 * Cuenta cuántos de los tres datos coinciden entre nuestro cliente y un contacto
 * de GHL.
 *
 * Un campo que falta en cualquiera de los dos lados NO cuenta como coincidencia
 * (dos vacíos no se parecen: sencillamente no se sabe).
 */
export function cotejarContacto(local: DatosCotejo, ghl: DatosCotejo): ResultadoCotejo {
  const correoLocal = normalizarCorreo(local.correo);
  const correoGhl = normalizarCorreo(ghl.correo);
  const correo = !!correoLocal && correoLocal === correoGhl;

  const telLocal = normalizarTelefono(local.telefono);
  const telGhl = normalizarTelefono(ghl.telefono);
  const telefono = !!telLocal && telLocal === telGhl;

  const nombre = mismoNombre(local.nombre, ghl.nombre);

  const camposCoincididos: string[] = [];
  if (nombre) camposCoincididos.push("nombre");
  if (correo) camposCoincididos.push("correo");
  if (telefono) camposCoincididos.push("teléfono");

  return {
    correo,
    telefono,
    nombre,
    nivel: camposCoincididos.length as NivelCoincidencia,
    camposCoincididos,
  };
}

/**
 * De todos los contactos de GHL, el que mejor casa con nuestro cliente.
 *
 * Devuelve `null` si ninguno coincide en NADA — un cliente que no está en GHL no
 * se marca con nada, no se le inventa un sello gris.
 */
export function mejorCoincidencia<T extends DatosCotejo>(
  local: DatosCotejo,
  contactos: T[]
): { contacto: T; cotejo: ResultadoCotejo } | null {
  let mejor: { contacto: T; cotejo: ResultadoCotejo } | null = null;

  for (const contacto of contactos) {
    const cotejo = cotejarContacto(local, contacto);
    if (cotejo.nivel === 0) continue;
    if (!mejor || cotejo.nivel > mejor.cotejo.nivel) {
      mejor = { contacto, cotejo };
      if (cotejo.nivel === 3) break; // no hay nada mejor que 3 de 3
    }
  }

  return mejor;
}

// ---------------------------------------------------------------------------
// Cómo se enseña
// ---------------------------------------------------------------------------

export interface SelloCoincidencia {
  nivel: NivelCoincidencia;
  label: string;
  /** Qué significa, para el tooltip. */
  ayuda: string;
  /** Clases del chip (claro + oscuro). */
  badge: string;
}

export const SELLOS: Record<Exclude<NivelCoincidencia, 0>, SelloCoincidencia> = {
  3: {
    nivel: 3,
    label: "Verificado",
    ayuda: "Coinciden el nombre, el correo y el teléfono con el contacto de GoHighLevel.",
    badge:
      "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-900",
  },
  2: {
    nivel: 2,
    label: "Probable",
    ayuda: "Coinciden dos de los tres datos con el contacto de GoHighLevel. Falta uno por cuadrar.",
    badge: "bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/40 dark:text-blue-300 dark:border-blue-900",
  },
  1: {
    nivel: 1,
    label: "Por revisar",
    ayuda: "Solo coincide uno de los tres datos con el contacto de GoHighLevel. Conviene mirarlo a ojo.",
    badge: "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-900",
  },
};

export function selloDe(nivel: NivelCoincidencia): SelloCoincidencia | null {
  return nivel === 0 ? null : SELLOS[nivel];
}
