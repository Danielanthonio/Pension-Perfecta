import { NextResponse } from "next/server";
import { createClient as createServiceClient, type SupabaseClient } from "@supabase/supabase-js";
import { createClient as createUserClient } from "@/utils/supabase/server";
import { cotejarCliente, ghlConfigurado, GhlLimiteError, type CotejoGhl } from "@/utils/ghl/client";

// Traer a la bitácora del proyecto lo que el equipo dejó en GoHighLevel.
//
// Se le pasan ids de proyectos y por cada uno hace dos cosas:
//
//   1. COTEJA al cliente contra los contactos de GHL y devuelve con qué
//      confianza es el mismo (3, 2 o 1 de 3 datos coincidiendo).
//   2. Si la confianza alcanza (2 de 3 o más), COPIA sus notas de GHL a
//      `prospect_notas`, que es la bitácora que se lee en «Último seguimiento».
//
// El paso 2 es el que pidió el negocio: hasta ahora el expediente decía «Sin
// notas» aunque en GHL hubiera once, y quien lo abría creía que nadie había
// tocado al cliente.
//
// Las notas traídas conservan SU fecha de GHL, no la de la importación. Es
// deliberado: sellarlas con now() haría que un cliente abandonado tres semanas
// apareciera como recién atendido, que es justo la mentira que la columna
// «Último seguimiento» existe para no contar. La puerta es el trigger
// `sella_autor_nota`, que respeta fecha y autor cuando el INSERT entra sin
// sesión — o sea, con la `service_role` de aquí.
//
// Con 1 de 3 NO se copia nada: un homónimo o un teléfono reciclado metería la
// conversación de otra persona en el expediente de este cliente, y una vez
// dentro de la bitácora eso ya no se distingue a simple vista.
//
// Por qué esto vive en el servidor y no en el navegador:
//   1. El token de GHL da lectura sobre 830 000 contactos de la sub-cuenta, que
//      en su mayoría NO son clientes nuestros. Publicarlo sería regalar esa base.
//   2. El correo y el teléfono del cliente son el insumo de la búsqueda, y RLS
//      solo protege nuestra tabla: sin el filtro de rol de aquí, un aliado podría
//      preguntar por los ids de otro y leer las notas ajenas.
//
// Por qué NO se cotejan los 476 proyectos de golpe: cada cliente cuesta hasta
// 4 búsquedas en GHL (correo, teléfono y dos formas del nombre) y el listado
// completo serían ~1 900 peticiones por carga de pantalla. Se cotejan lotes de
// como mucho TOPE_LOTE, a petición explícita del usuario.
export const dynamic = "force-dynamic";

// Cuántos clientes admite una llamada.
//
// Cada cliente cuesta hasta 4 búsquedas (correo, teléfono y dos formas del
// nombre) más 2 lecturas si el cotejo alcanza para traer notas y citas: unas 6
// peticiones en el peor caso. GHL da 100 cada 10 segundos para TODA la
// sub-cuenta —compartidas con las demás integraciones—, así que 12 clientes son
// ~72 peticiones y el cliente de `@/utils/ghl/client` las va soltando con freno
// para no pasar de 60 por ventana. Subir este número no acelera nada: solo hace
// esperar más a quien pulsó el botón.
const TOPE_LOTE = 12;

const ROLES_DIRECCION = ["admin", "director"];

export async function POST(request: Request) {
  if (!ghlConfigurado()) {
    return NextResponse.json(
      {
        error:
          "El servidor no tiene configurado GoHighLevel. Falta GHL_API_TOKEN o " +
          "GHL_LOCATION_ID en las variables de entorno del hosting.",
      },
      { status: 501 }
    );
  }

  // --- 1. Body ---
  let body: { prospectIds?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Cuerpo de la solicitud inválido." }, { status: 400 });
  }

  const ids = Array.isArray(body?.prospectIds)
    ? [...new Set((body.prospectIds as unknown[]).filter((x): x is string => typeof x === "string" && !!x))]
    : [];
  if (ids.length === 0) {
    return NextResponse.json({ error: "No se indicó ningún cliente a cotejar." }, { status: 400 });
  }
  if (ids.length > TOPE_LOTE) {
    return NextResponse.json(
      { error: `Demasiados clientes de una vez (máximo ${TOPE_LOTE}).` },
      { status: 400 }
    );
  }

  // --- 2. Autenticar ---
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    return NextResponse.json({ error: "Configuración de Supabase ausente en el servidor." }, { status: 500 });
  }

  const userClient = await createUserClient();
  const {
    data: { user: caller },
  } = await userClient.auth.getUser();
  if (!caller) {
    return NextResponse.json({ error: "No autorizado. Inicia sesión de nuevo." }, { status: 401 });
  }

  const admin = createServiceClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data: perfil } = await admin.from("profiles").select("role").eq("id", caller.id).maybeSingle();
  if (!perfil) {
    return NextResponse.json({ error: "No se pudo verificar tus permisos." }, { status: 500 });
  }

  // --- 3. Qué clientes puede cotejar quien pregunta ---
  //
  // Las notas de GHL son del equipo interno: hablan del cliente delante de él y
  // a veces traen datos de otros (teléfonos de referidos, ligas de carpetas).
  // Por eso el cotejo es de Dirección y del Account Manager que gestiona el
  // proyecto. El aliado NO entra: su portal enseña el avance del expediente, no
  // la conversación interna sobre su cliente.
  const esDireccion = ROLES_DIRECCION.includes(perfil.role);
  const esAm = perfil.role === "account_manager";
  if (!esDireccion && !esAm) {
    return NextResponse.json({ error: "No tienes permiso para consultar GoHighLevel." }, { status: 403 });
  }

  let consulta = admin.from("prospects").select("id, full_name, email, phone").in("id", ids);
  // El AM solo por su propia cartera. Se filtra en el SERVIDOR y no confiando en
  // los ids que llegan: quien llama elige qué pedir, no qué puede ver.
  if (!esDireccion) consulta = consulta.eq("account_manager_id", caller.id);

  const { data: clientes, error: errClientes } = await consulta;
  if (errClientes) {
    return NextResponse.json({ error: "No se pudieron leer los clientes." }, { status: 500 });
  }

  // --- 4. Cotejar ---
  // En paralelo: son llamadas de red independientes. No hay riesgo de inundar a
  // GHL porque el cliente lleva su propio control de ritmo por ventana.
  let resultados: [string, CotejoGhl | null][];
  try {
    resultados = await Promise.all(
      (clientes || []).map(async (c) => {
        const cotejo = await cotejarCliente({ nombre: c.full_name, correo: c.email, telefono: c.phone });
        return [c.id, cotejo] as [string, CotejoGhl | null];
      })
    );
  } catch (e) {
    // Que GHL nos frene NO se puede devolver como un lote de «no encontrados»:
    // el usuario vería sellos de «Sin GHL» en clientes que sí están allá y se
    // fiaría de ellos. Mejor no devolver ningún sello y decir qué pasó.
    if (e instanceof GhlLimiteError) {
      return NextResponse.json({ error: e.message }, { status: 429 });
    }
    return NextResponse.json({ error: "No se pudo consultar GoHighLevel." }, { status: 502 });
  }

  // --- 5. Traer las notas a la bitácora ---
  const importadas: Record<string, number> = {};
  let faltaMigracion = false;
  for (const [id, cotejo] of resultados) {
    if (!cotejo || cotejo.cotejo.nivel < 2 || cotejo.notas.length === 0) continue;
    const r = await traerNotas(admin, id, cotejo.notas);
    importadas[id] = r.traidas;
    if (r.faltaMigracion) faltaMigracion = true;
  }

  // Un cliente sin coincidencia entra como `null` explícito: el frontend
  // necesita distinguir «ya se buscó y no está» de «todavía no se ha buscado».
  const porProyecto: Record<string, CotejoGhl | null> = {};
  for (const [id, cotejo] of resultados) porProyecto[id] = cotejo;

  return NextResponse.json({
    cotejos: porProyecto,
    importadas,
    // Los sellos SÍ son válidos aunque la bitácora no se haya podido escribir:
    // el cotejo no toca la base. Por eso esto viaja como aviso y no como error.
    aviso: faltaMigracion
      ? "Los sellos están calculados, pero las notas no se pudieron guardar: falta aplicar la migración 20260826000000_notas_desde_ghl.sql en la base."
      : null,
  });
}

/**
 * Copia a `prospect_notas` las notas de GHL que aún no estén.
 *
 * Devuelve cuántas se añadieron ESTA vez (0 si ya estaban todas, que es el caso
 * normal a partir de la segunda pulsación).
 *
 * Se filtra contra lo ya importado ANTES de insertar en vez de dejar que choque
 * el índice único: PostgREST corta el lote entero al primer conflicto, así que
 * una sola nota repetida impediría entrar a las demás.
 *
 * DECISIÓN DE PRODUCTO (Daniel, 2026-08-26): lo ya traído NO se vuelve a tocar.
 * Si alguien corrige una nota en GHL, la copia de aquí se queda como estaba; si
 * la borra allá, la de aquí sobrevive. La bitácora es el antecedente del
 * CLIENTE y no se reescribe a posteriori — el mismo criterio que ya rige para
 * las notas que teclea el equipo, que solo su autor puede corregir. La
 * alternativa (que GHL pise el historial en cada sincronizado) se descartó a
 * propósito: dejaría la prueba de gestión a merced de quien limpie el CRM.
 *
 * Si algún día se quisiera lo contrario, el sitio es este: comparar `texto`
 * contra la nota conocida y hacer UPDATE. Ojo con `protege_nota_editada`, que
 * congela todo salvo el texto cuando hay sesión (por `service_role` no aplica).
 */
async function traerNotas(
  // El tipo que infiere `createServiceClient` sin genéricos: el proyecto no
  // genera tipos de la base, así que las filas viajan sin forma y se validan
  // contra los CHECK de la tabla, no contra TypeScript.
  admin: SupabaseClient<any, "public", "public", any, any>,
  prospectId: string,
  notas: CotejoGhl["notas"]
): Promise<{ traidas: number; faltaMigracion: boolean }> {
  const { data: yaEstan, error: errLectura } = await admin
    .from("prospect_notas")
    .select("ghl_nota_id")
    .eq("prospect_id", prospectId)
    .eq("origen", "ghl");

  // 42703 = la columna no existe: la migración 20260826000000 todavía no se ha
  // aplicado. Se distingue de cualquier otro fallo porque tiene arreglo conocido
  // y hay que decirlo con esas palabras, no dejar que parezca «no había notas».
  if (errLectura) {
    return { traidas: 0, faltaMigracion: errLectura.code === "42703" };
  }

  const conocidas = new Set((yaEstan || []).map((n) => n.ghl_nota_id));

  const nuevas = notas
    .filter((n) => n.id && !conocidas.has(n.id))
    .map((n) => ({
      prospect_id: prospectId,
      // La nota es de GHL, no de una persona de aquí. `autor_id` queda en NULL
      // a propósito: inventar un autor nuestro sería falsear la bitácora. El
      // autor REAL tampoco se puede poner — GHL da un `userId` pero el token no
      // tiene el scope View Users (401), así que hoy no hay forma de resolverlo
      // a un nombre. Se añade el scope en GHL y esto empieza a firmarlas.
      autor_id: null,
      autor_nombre: "GoHighLevel",
      autor_rol: "ghl",
      // El CHECK de la tabla exige entre 1 y 4000 caracteres. Una nota de GHL
      // puede venir vacía (adjuntos sueltos) o pasarse de largo; ni una ni otra
      // pueden tumbar la importación de las demás.
      texto: n.texto.trim().slice(0, 4000),
      created_at: n.fecha,
      origen: "ghl",
      ghl_nota_id: n.id,
    }))
    .filter((n) => n.texto.length > 0 && !!n.created_at);

  if (nuevas.length === 0) return { traidas: 0, faltaMigracion: false };

  const { error } = await admin.from("prospect_notas").insert(nuevas);
  if (error) {
    // Que falle traer las notas de UN cliente no puede tumbar el lote: los
    // sellos de los demás ya están calculados y son útiles por sí solos.
    console.error(`[ghl] no se pudieron traer las notas de ${prospectId}:`, error.message);
    return { traidas: 0, faltaMigracion: error.code === "42703" };
  }
  return { traidas: nuevas.length, faltaMigracion: false };
}
