// Copiar a la bitácora del proyecto las notas que el equipo dejó en GoHighLevel.
//
// Vive aparte de las rutas porque lo usan DOS: la de a puñados —el botón
// «Traer notas de GHL» del listado— y la del barrido completo que corre de
// madrugada. Si cada una llevara su copia, tarde o temprano una arreglaría un
// caso que la otra no, y el mismo cliente acabaría con bitácoras distintas
// según por dónde entró.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { CotejoGhl, NotaGhl } from "@/utils/ghl/client";
import { selloDe } from "@/utils/ghlMatch";

/** El tipo que infiere `createClient` sin genéricos: el proyecto no genera tipos de la base. */
export type ClienteServicio = SupabaseClient<any, "public", "public", any, any>;

export interface ResultadoImportacion {
  /** Cuántas notas se añadieron ESTA vez. 0 si ya estaban todas. */
  traidas: number;
  /** La columna `origen` no existe: falta aplicar la migración 20260826000000. */
  faltaMigracion: boolean;
}

/** Tope de la tabla (`prospect_notas_texto_acotado`). */
const MAX_TEXTO = 4000;

/**
 * Copia las notas de GHL que aún no estén en la bitácora de este proyecto.
 *
 * Tres decisiones que no son accidentes:
 *
 *  · **La fecha es la de GHL, no la de hoy.** El trigger `sella_autor_nota`
 *    respeta lo que trae el INSERT cuando `auth.uid()` es NULL, que es el caso
 *    de la `service_role`. Sellar con now() haría que un cliente abandonado tres
 *    semanas apareciera como recién atendido — justo la mentira que la columna
 *    «Último seguimiento» existe para no contar.
 *
 *  · **El autor queda en NULL.** Inventar a alguien de aquí sería falsear la
 *    bitácora, y el autor real no se puede resolver: GHL da un `userId` pero el
 *    token no tiene el scope View Users (401). Se firma «GoHighLevel» hasta que
 *    se añada ese permiso en la integración privada.
 *
 *  · **Se filtra contra lo ya importado ANTES de insertar**, en vez de dejar que
 *    choque el índice único: PostgREST corta el lote entero al primer conflicto,
 *    así que una sola nota repetida impediría entrar a todas las demás.
 */
export async function traerNotasDeGhl(
  admin: ClienteServicio,
  prospectId: string,
  notas: NotaGhl[]
): Promise<ResultadoImportacion> {
  const { data: yaEstan, error: errLectura } = await admin
    .from("prospect_notas")
    .select("ghl_nota_id")
    .eq("prospect_id", prospectId)
    .eq("origen", "ghl");

  // 42703 = la columna no existe. Tiene arreglo conocido —aplicar la migración—
  // y hay que decirlo con esas palabras: si se devolviera como «0 notas», la
  // pantalla diría «sin notas nuevas que traer», que es falso y creíble.
  if (errLectura) {
    return { traidas: 0, faltaMigracion: errLectura.code === "42703" };
  }

  const conocidas = new Set((yaEstan || []).map((n) => n.ghl_nota_id));

  const nuevas = notas
    .filter((n) => n.id && !conocidas.has(n.id))
    .map((n) => ({
      prospect_id: prospectId,
      autor_id: null,
      autor_nombre: "GoHighLevel",
      autor_rol: "ghl",
      // El CHECK exige entre 1 y 4000 caracteres. Una nota de GHL puede venir
      // vacía (un adjunto suelto) o pasarse de largo; ni una ni otra pueden
      // tumbar la importación de las demás.
      texto: n.texto.trim().slice(0, MAX_TEXTO),
      created_at: n.fecha,
      origen: "ghl",
      ghl_nota_id: n.id,
    }))
    .filter((n) => n.texto.length > 0 && !!n.created_at);

  if (nuevas.length === 0) return { traidas: 0, faltaMigracion: false };

  const { error } = await admin.from("prospect_notas").insert(nuevas);
  if (error) {
    // Que falle UN cliente no puede tumbar el lote: lo de los demás ya está
    // calculado y es útil por sí solo.
    console.error(`[ghl] no se pudieron traer las notas de ${prospectId}:`, error.message);
    return { traidas: 0, faltaMigracion: error.code === "42703" };
  }
  return { traidas: nuevas.length, faltaMigracion: false };
}


/**
 * Deja constancia de CÓMO cotejó este proyecto contra GoHighLevel.
 *
 * Antes el sello se calculaba al pulsar el botón y moría en la memoria del
 * navegador: al recargar, desaparecía. Eso lo dejaba inservible para lo que más
 * valía — entrar por la mañana y ver de un vistazo qué expedientes tienen el
 * correo o el teléfono mal capturados.
 *
 * Se guarda SIEMPRE que se coteja, incluidos los dos casos que parecen no
 * merecerlo:
 *
 *   · sello 'revisar' → es justamente la lista de trabajo: un dato suelto que
 *     cuadra suele significar un teléfono de otra persona en el expediente.
 *   · `cotejo` nulo   → «se buscó y no está en GHL», que NO es lo mismo que «no
 *     se ha buscado». Sin la fila no se pueden distinguir, y esa diferencia es
 *     la que dice si el barrido llegó hasta aquí.
 *
 * `cotejado_at` se reescribe en cada pasada aunque el resultado no cambie: un
 * sello de hace tres semanas sobre un cliente cuyo correo se corrigió ayer ya no
 * dice la verdad, y esta marca es lo único que permite notarlo.
 */
export async function guardarCotejo(
  admin: ClienteServicio,
  prospectId: string,
  cotejo: CotejoGhl | null
): Promise<void> {
  const sello = cotejo ? selloDe(cotejo.cotejo) : null;
  const { error } = await admin.from("prospect_ghl_cotejo").upsert(
    {
      prospect_id: prospectId,
      sello: sello?.clave ?? null,
      nivel: cotejo?.cotejo.nivel ?? 0,
      contacto_id: cotejo?.contacto.id ?? null,
      contacto_nombre: cotejo?.contacto.nombre ?? null,
      contacto_correo: cotejo?.contacto.correo ?? null,
      contacto_telefono: cotejo?.contacto.telefono ?? null,
      cotejado_at: new Date().toISOString(),
    },
    { onConflict: "prospect_id" }
  );
  // Que no se pueda anotar el sello no puede tumbar la importación: las notas,
  // que es lo que de verdad importa, ya están dentro. Se avisa por consola y se
  // sigue. Si falta la migración 20260826000002, esto es lo que se verá.
  if (error) {
    console.error(`[ghl] no se pudo guardar el cotejo de ${prospectId}:`, error.message);
  }
}
