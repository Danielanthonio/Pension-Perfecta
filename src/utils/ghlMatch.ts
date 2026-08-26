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
  /**
   * El nombre coincide ENTERO: las mismas palabras a ambos lados, ni una de
   * más ni una de menos, y al menos tres (nombre + los dos apellidos).
   *
   * Es una señal aparte de `nombre` —que se conforma con que el corto esté
   * contenido en el largo— y mucho más fuerte: «RODRIGUEZ NOELIA» dentro de
   * «RODRIGUEZ GONZALEZ NOELIA» es plausible; «SERGIO OCAMPO SANCHEZ» idéntico
   * a «OCAMPO SANCHEZ SERGIO» es, a efectos prácticos, la misma persona.
   */
  nombreExacto: boolean;
  /** Cuántos de los tres campos coincidieron. */
  nivel: NivelCoincidencia;
  /** Qué campos coincidieron, en orden de lectura. Para el tooltip del sello. */
  camposCoincididos: string[];
}

// ---------------------------------------------------------------------------
// Normalización
// ---------------------------------------------------------------------------

/**
 * Minúsculas y sin espacios. El correo no distingue mayúsculas en la práctica.
 *
 * Devuelve `null` para todo lo que no sea un correo DE VERDAD, y eso es lo que
 * hace el trabajo aquí. Medido sobre los 476 proyectos: 175 traen un relleno que
 * alguien tecleó para pasar el formulario —`@`, `aa@`, `qq@`, `a@gmail.com`—, y
 * 64 comparten literalmente el mismo `@`.
 *
 * La versión anterior solo exigía que hubiera una arroba, así que esos rellenos
 * contaban como coincidencia: dos clientes sin ninguna relación «cuadraban por
 * correo» con el mismo contacto de GHL, porque los tres tenían `a@gmail.com`.
 * Con un solo dato falso el sello se queda en amarillo y no pasa nada; pero un
 * cliente con el correo Y el teléfono de relleno llegaría a 2 de 3 contra un
 * desconocido, y a 2 de 3 SE COPIAN LAS NOTAS. Es decir: la conversación de otra
 * persona metida en el expediente, con fecha y sin forma de distinguirla.
 *
 * Un dato de relleno no es un dato: es la ausencia de dato disfrazada. Se trata
 * como lo que es.
 */
export function normalizarCorreo(valor: string | null | undefined): string | null {
  const v = (valor || "").trim().toLowerCase();
  // Estructura mínima de un correo real: algo@algo.tld, con al menos dos
  // caracteres antes de la arroba y un dominio con extensión de letras.
  // Rechaza `@`, `aa@`, `qq@` y `a@gmail.com` (los cuatro rellenos que aparecen
  // en la base) sin tocar ningún correo legítimo.
  //
  // El dominio admite VARIOS niveles —`(\.[^@\s.]+)*`— porque si no,
  // `hquilantan@prodrigy.net.mx` se caería por tener dos puntos, y los dominios
  // mexicanos `.com.mx` / `.net.mx` son de lo más normal en esta cartera.
  if (!/^[^@\s]{2,}@[^@\s.]+(\.[^@\s.]+)*\.[a-z]{2,}$/i.test(v)) return null;
  return v;
}

/**
 * ¿Es este número un relleno en vez de un teléfono?
 *
 * Los que hay en la base: `1111111111` (21 clientes), `1231231231` (11),
 * `5512345678` (11), `1234567890` (6). Todos pasarían el filtro de «diez
 * dígitos» y todos identifican a nadie.
 */
function telefonoDeRelleno(digitos: string): boolean {
  // Seis o más veces el mismo dígito seguido: 1111111111, 0000000000.
  if (/(\d)\1{5,}/.test(digitos)) return true;
  // Un bloque corto repetido hasta llenar: 1231231231, 1212121212.
  if (/^(\d{2,4})\1+\d*$/.test(digitos)) return true;
  // Una tirada de seis o más dígitos consecutivos, subiendo o bajando, en
  // cualquier posición: atrapa 1234567890 y también 5512345678.
  const ASCENDENTE = "01234567890";
  const DESCENDENTE = "09876543210";
  for (let i = 0; i + 6 <= digitos.length; i++) {
    const tramo = digitos.slice(i, i + 6);
    if (ASCENDENTE.includes(tramo) || DESCENDENTE.includes(tramo)) return true;
  }
  return false;
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
  const diez = digitos.slice(-10);
  // Mismo criterio que con el correo: un relleno no es evidencia de nada, y
  // dejarlo pasar es lo que convertiría a dos desconocidos en «2 de 3».
  if (telefonoDeRelleno(diez)) return null;
  return diez;
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

/**
 * ¿Es EXACTAMENTE el mismo nombre completo?
 *
 * Las mismas palabras significativas a ambos lados, sin sobras, y al menos tres
 * —que en un nombre mexicano es nombre + apellido paterno + apellido materno—.
 *
 * Por qué hace falta como señal aparte: en esta cartera el correo y el teléfono
 * son basura en buena parte de los expedientes (rellenos como `@` o
 * `1111111111` que alguien tecleó para pasar el formulario). Para esos clientes
 * el nombre es el ÚNICO dato real que hay, y exigir «2 de 3» los condena a no
 * cruzarse nunca, aunque en GHL esté el mismo señor con las tres palabras
 * idénticas.
 *
 * El riesgo que se acepta a cambio: dos personas distintas con el nombre y LOS
 * DOS apellidos iguales. Existe, pero es raro, y por eso este caso lleva sello
 * propio en vez de disfrazarse de coincidencia verificada.
 */
export function mismoNombreExacto(a: string | null | undefined, b: string | null | undefined): boolean {
  const pa = palabrasNombre(a);
  const pb = palabrasNombre(b);
  if (pa.length < 3 || pa.length !== pb.length) return false;
  const sa = new Set(pa);
  const sb = new Set(pb);
  if (sa.size !== sb.size) return false;
  for (const p of sa) if (!sb.has(p)) return false;
  return true;
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
  const nombreExacto = mismoNombreExacto(local.nombre, ghl.nombre);

  const camposCoincididos: string[] = [];
  if (nombre) camposCoincididos.push("nombre");
  if (correo) camposCoincididos.push("correo");
  if (telefono) camposCoincididos.push("teléfono");

  return {
    correo,
    telefono,
    nombre,
    nombreExacto,
    nivel: camposCoincididos.length as NivelCoincidencia,
    camposCoincididos,
  };
}

/**
 * ¿Hay bastante para traerse sus notas a la bitácora?
 *
 * Dos puertas, y una sola respuesta: dos de tres datos, O el nombre completo
 * idéntico. Con menos que eso no se copia nada — un homónimo parcial o un
 * teléfono reciclado metería la conversación de otra persona en el expediente,
 * y una vez dentro ya no se distingue a simple vista.
 *
 * Vive aquí, junto a la regla de cotejo, y no en la ruta: es la misma decisión
 * que pinta el sello y no puede contarse de dos maneras distintas.
 */
export function alcanzaParaCopiar(cotejo: ResultadoCotejo): boolean {
  return cotejo.nivel >= 2 || cotejo.nombreExacto;
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

  // Cuánto vale una coincidencia. El nombre completo idéntico pesa más que
  // cualquier otro dato suelto: entre un contacto que solo comparte un teléfono
  // y otro que se llama exactamente igual, el segundo es el bueno — y sin este
  // desempate ganaría el primero por orden de llegada.
  const peso = (c: ResultadoCotejo) => c.nivel * 10 + (c.nombreExacto ? 5 : 0);

  for (const contacto of contactos) {
    const cotejo = cotejarContacto(local, contacto);
    if (cotejo.nivel === 0) continue;
    if (!mejor || peso(cotejo) > peso(mejor.cotejo)) {
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
  clave: ClaveSello;
  label: string;
  /** Qué significa, para el tooltip. */
  ayuda: string;
  /** Clases del chip (claro + oscuro). */
  badge: string;
  /** El punto de color. */
  punto: string;
  /** ¿Este sello implica que las notas de GHL se copiaron a la bitácora? */
  copia: boolean;
}

/**
 * Los cuatro desenlaces posibles. Son cuatro y no tres porque hay cuatro cosas
 * distintas que decir, y meter dos en el mismo color sería mentir:
 *
 *   verificado → cuadra todo
 *   probable   → cuadran dos de tres          } de aquí para arriba SE COPIAN
 *   nombre     → cuadra el nombre completo    } las notas de GHL
 *   revisar    → cuadra un dato suelto, y con eso no se copia nada
 */
export type ClaveSello = "verificado" | "probable" | "nombre" | "revisar";

export const SELLOS: Record<ClaveSello, SelloCoincidencia> = {
  verificado: {
    clave: "verificado",
    label: "Verificado",
    ayuda: "Coinciden el nombre, el correo y el teléfono con el contacto de GoHighLevel.",
    badge:
      "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-900",
    punto: "bg-emerald-500",
    copia: true,
  },
  probable: {
    clave: "probable",
    label: "Probable",
    ayuda: "Coinciden dos de los tres datos con el contacto de GoHighLevel. Falta uno por cuadrar.",
    badge: "bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/40 dark:text-blue-300 dark:border-blue-900",
    punto: "bg-blue-500",
    copia: true,
  },
  nombre: {
    clave: "nombre",
    label: "Nombre exacto",
    ayuda:
      "El nombre completo es idéntico —nombre y los dos apellidos— pero el correo y el teléfono del expediente no sirven para cotejar. Se traen sus notas porque un nombre completo repetido entero es un identificador fuerte; aun así, conviene aprovechar y corregir aquí el dato de contacto que falte.",
    badge: "bg-teal-50 text-teal-700 border-teal-200 dark:bg-teal-950/40 dark:text-teal-300 dark:border-teal-900",
    punto: "bg-teal-500",
    copia: true,
  },
  revisar: {
    clave: "revisar",
    label: "Por revisar",
    ayuda:
      "Solo coincide un dato suelto con el contacto de GoHighLevel. No se traen sus notas: podría ser un homónimo o un teléfono reciclado, y serían las de otra persona.",
    badge: "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-900",
    punto: "bg-amber-500",
    copia: false,
  },
};

/** Qué sello le toca a este cotejo. `null` = no coincide en nada, no se pinta. */
export function selloDe(cotejo: ResultadoCotejo): SelloCoincidencia | null {
  if (cotejo.nivel === 3) return SELLOS.verificado;
  if (cotejo.nivel === 2) return SELLOS.probable;
  // El orden importa: un 1 de 3 con el nombre completo idéntico es «nombre»,
  // no «revisar». Si se comprobara al revés, el sello diría que no se copió
  // nada mientras las notas ya estarían dentro.
  if (cotejo.nombreExacto) return SELLOS.nombre;
  if (cotejo.nivel === 1) return SELLOS.revisar;
  return null;
}
