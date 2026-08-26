// Copiar a la bitácora del proyecto las notas que el equipo dejó en GoHighLevel.
//
// Vive aparte de las rutas porque lo usan DOS: la de a puñados —el botón
// «Traer notas de GHL» del listado— y la del barrido completo que corre de
// madrugada. Si cada una llevara su copia, tarde o temprano una arreglaría un
// caso que la otra no, y el mismo cliente acabaría con bitácoras distintas
// según por dónde entró.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { NotaGhl } from "@/utils/ghl/client";

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
