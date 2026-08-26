import { NextResponse } from "next/server";
import { createClient as createServiceClient } from "@supabase/supabase-js";
import { createClient as createUserClient } from "@/utils/supabase/server";
import { cotejarCliente, ghlConfigurado, GhlLimiteError } from "@/utils/ghl/client";
import { alcanzaParaCopiar } from "@/utils/ghlMatch";
import { traerNotasDeGhl } from "@/utils/ghl/importar";

// Barrido de TODA la cartera contra GoHighLevel. Es el que corre de madrugada.
//
// -- Por qué va por tramos y no de una sentada --
//
// Recorrer los ~476 proyectos son unas 2 850 peticiones a GHL, que con el freno
// del cliente (60 por ventana de 10 s, porque el límite de 100 es de la
// SUB-CUENTA y se comparte con las demás integraciones) tarda unos 8 minutos.
// Una petición HTTP de 8 minutos no sobrevive: la corta el hosting, o el
// programador que la llama, o cualquier proxy de por medio. Y si se corta a los
// 7, no hay forma de saber por dónde iba.
//
// Así que cada llamada procesa un TRAMO y devuelve por dónde se quedó. Quien
// llama vuelve a llamar con ese cursor hasta que no haya siguiente. Cada
// petición dura ~20 segundos, cabe en cualquier timeout, y si una falla solo se
// repite ese tramo.
//
// El cursor es el `id` del último proyecto procesado y se avanza con `id > cursor`
// sobre un orden por id. No se usa OFFSET a propósito: si alguien da de alta un
// cliente mientras el barrido corre, el offset desplaza la ventana y se salta
// proyectos sin avisar.
//
// -- Quién puede llamarla --
//
// Dirección con su sesión, o un programador externo con el secreto compartido.
// El AM no: esto recorre la cartera entera, incluida la que no es suya.
export const dynamic = "force-dynamic";

/** Proyectos por llamada. 20 × ~6 peticiones ≈ 120 → unos 20 s con el freno. */
const TRAMO = 20;

const ROLES_DIRECCION = ["admin", "director"];

export async function POST(request: Request) {
  if (!ghlConfigurado()) {
    return NextResponse.json(
      { error: "El servidor no tiene configurado GoHighLevel (faltan GHL_API_TOKEN o GHL_LOCATION_ID)." },
      { status: 501 }
    );
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    return NextResponse.json({ error: "Configuración de Supabase ausente en el servidor." }, { status: 500 });
  }

  let body: { cursor?: unknown };
  try {
    body = await request.json();
  } catch {
    body = {};
  }
  const cursor = typeof body?.cursor === "string" && body.cursor ? body.cursor : null;

  // --- Quién llama ---
  //
  // Dos puertas. La del secreto existe porque el barrido nocturno lo dispara una
  // máquina, que no tiene sesión ni cookies. `CRON_SECRET` NO tiene valor por
  // defecto: si no está configurado, esa puerta sencillamente no existe, en vez
  // de quedarse abierta con un secreto adivinable.
  const secreto = process.env.CRON_SECRET;
  const cabecera = request.headers.get("authorization") || "";
  const conSecreto = !!secreto && cabecera === `Bearer ${secreto}`;

  if (!conSecreto) {
    const userClient = await createUserClient();
    const {
      data: { user: caller },
    } = await userClient.auth.getUser();
    if (!caller) {
      return NextResponse.json({ error: "No autorizado." }, { status: 401 });
    }
    const adminTmp = createServiceClient(url, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const { data: perfil } = await adminTmp.from("profiles").select("role").eq("id", caller.id).maybeSingle();
    if (!perfil || !ROLES_DIRECCION.includes(perfil.role)) {
      return NextResponse.json(
        { error: "Solo la Dirección puede sincronizar la cartera completa." },
        { status: 403 }
      );
    }
  }

  const admin = createServiceClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // --- El tramo ---
  let consulta = admin
    .from("prospects")
    .select("id, full_name, email, phone")
    .order("id", { ascending: true })
    .limit(TRAMO);
  if (cursor) consulta = consulta.gt("id", cursor);

  const { data: clientes, error: errClientes } = await consulta;
  if (errClientes) {
    return NextResponse.json({ error: "No se pudieron leer los clientes." }, { status: 500 });
  }
  if (!clientes || clientes.length === 0) {
    return NextResponse.json({ procesados: 0, notas: 0, proyectos: 0, siguiente: null, fin: true });
  }

  // --- Cotejar y traer ---
  //
  // En serie y no en paralelo: da igual para el reloj (manda el freno de GHL, no
  // la concurrencia) y así, si algo revienta a mitad, el cursor que se devuelve
  // corresponde de verdad a lo último terminado.
  let notas = 0;
  let proyectos = 0;
  let procesados = 0;
  let faltaMigracion = false;
  let ultimoId: string | null = cursor;

  for (const c of clientes) {
    try {
      const cotejo = await cotejarCliente({ nombre: c.full_name, correo: c.email, telefono: c.phone });
      if (cotejo && alcanzaParaCopiar(cotejo.cotejo) && cotejo.notas.length > 0) {
        const r = await traerNotasDeGhl(admin, c.id, cotejo.notas);
        if (r.traidas > 0) {
          notas += r.traidas;
          proyectos++;
        }
        if (r.faltaMigracion) faltaMigracion = true;
      }
      procesados++;
      ultimoId = c.id;
    } catch (e) {
      if (e instanceof GhlLimiteError) {
        // GHL nos está frenando. Se devuelve lo hecho y el cursor donde se quedó:
        // quien llama espera y retoma justo ahí, sin repetir ni saltarse nada.
        return NextResponse.json({
          procesados,
          notas,
          proyectos,
          siguiente: ultimoId,
          fin: false,
          frenado: true,
          error: e.message,
        });
      }
      // Un cliente que falla no detiene el barrido, pero SÍ avanza el cursor:
      // si no, el siguiente tramo empezaría en el mismo y se quedaría en bucle.
      console.error(`[ghl] barrido: falló ${c.full_name}:`, e);
      procesados++;
      ultimoId = c.id;
    }
  }

  // Menos clientes que el tramo = se acabó la cartera.
  const fin = clientes.length < TRAMO;

  return NextResponse.json({
    procesados,
    notas,
    proyectos,
    siguiente: fin ? null : ultimoId,
    fin,
    aviso: faltaMigracion
      ? "Falta aplicar la migración 20260826000000_notas_desde_ghl.sql: las notas no se pudieron guardar."
      : null,
  });
}
