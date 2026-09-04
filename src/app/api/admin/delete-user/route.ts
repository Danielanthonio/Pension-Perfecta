import { NextResponse } from "next/server";
import { createClient as createServiceClient } from "@supabase/supabase-js";
import { createClient as createUserClient } from "@/utils/supabase/server";

// Borrado PERMANENTE de un usuario.
//
// Quién puede llamar:
//   · Dirección (admin/director) → cualquier usuario, reasignando antes lo que
//     quede colgando (proyectos del aliado, cartera del AM).
//   · Closer → SOLO las cuentas de aliado que él mismo abrió (`created_by`) y
//     solo mientras no tengan clientes registrados. Es el §8 de la
//     especificación del 2026-08-04; hasta entonces el borrado era exclusivo de
//     Dirección. Repartir una cartera de clientes sigue siéndolo.
//
// El frontend NO puede borrar de verdad: la tabla `profiles` no tiene política
// RLS de DELETE, la FK `prospects.aliado_id` bloquea el borrado, y aunque se
// borrara el perfil la cuenta de `auth.users` sobreviviría y la app la
// re-crearía al siguiente login. Por eso este borrado real vive en el servidor
// y usa la SERVICE_ROLE key (que NUNCA debe exponerse al navegador).
//
// Flujo:
//  1. Autentica al que llama con su sesión (cookies) y exige rol director/admin.
//  2. Con la service_role: reasigna los proyectos del aliado al destino elegido
//     (obligatorio si tiene proyectos), desliga sus códigos de invitación
//     (created_by / used_by → NULL para no chocar con sus FKs) y finalmente
//     elimina la cuenta de auth.users, lo que borra el perfil por cascada.
export async function POST(request: Request) {
  // --- 1. Body ---
  let body: {
    userId?: string;
    reassignToAliadoId?: string | null;
    reassignToAmId?: string | null;
    motivo?: string | null;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Cuerpo de la solicitud inválido." }, { status: 400 });
  }

  const userId = body?.userId;
  const reassignToAliadoId = body?.reassignToAliadoId || null;
  const reassignToAmId = body?.reassignToAmId || null;
  // Motivo de la baja (§14). Opcional para Dirección; la pantalla del closer sí
  // lo pide, porque una eliminación suya no la revisa nadie más.
  const motivo = (body?.motivo || "").trim() || null;
  if (!userId) {
    return NextResponse.json({ error: "Falta el usuario a eliminar." }, { status: 400 });
  }

  // --- 2. Variables de entorno ---
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url) {
    return NextResponse.json({ error: "Configuración de Supabase ausente en el servidor." }, { status: 500 });
  }
  if (!serviceKey) {
    // El código está listo, pero falta la llave de servicio en el hosting.
    return NextResponse.json(
      {
        error:
          "El servidor no tiene configurada la llave SUPABASE_SERVICE_ROLE_KEY. " +
          "Agrégala en las variables de entorno para poder eliminar usuarios.",
      },
      { status: 501 }
    );
  }

  // --- 3. Autenticar al solicitante ---
  const userClient = await createUserClient();
  const {
    data: { user: caller },
    error: authError,
  } = await userClient.auth.getUser();
  if (authError || !caller) {
    return NextResponse.json({ error: "No autorizado. Inicia sesión de nuevo." }, { status: 401 });
  }

  // Cliente con privilegios (bypass RLS). Solo del lado servidor.
  const admin = createServiceClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // --- 4. Exigir rol director ---
  // OJO: en la BD conviven DOS variantes para la Dirección: 'admin' (la que usa
  // el frontend al crear) y 'director' (registros antiguos). Se aceptan ambas.
  const DIRECTOR_ROLES = ["admin", "director"];
  const { data: callerProfile, error: callerErr } = await admin
    .from("profiles")
    .select("role")
    .eq("id", caller.id)
    .maybeSingle();
  if (callerErr) {
    return NextResponse.json({ error: "No se pudo verificar tus permisos." }, { status: 500 });
  }
  if (!callerProfile) {
    return NextResponse.json({ error: "No se pudo verificar tus permisos." }, { status: 500 });
  }
  const esDireccion = DIRECTOR_ROLES.includes(callerProfile.role);
  const esCloser = callerProfile.role === "closer";
  if (!esDireccion && !esCloser) {
    return NextResponse.json({ error: "No tienes permiso para eliminar usuarios." }, { status: 403 });
  }

  // --- 5. Salvaguardas básicas ---
  if (userId === caller.id) {
    return NextResponse.json({ error: "No puedes eliminar tu propia cuenta." }, { status: 400 });
  }

  const { data: target, error: targetErr } = await admin
    .from("profiles")
    .select("id, role, full_name, email, created_by, closer_origen_id")
    .eq("id", userId)
    .maybeSingle();
  if (targetErr) {
    return NextResponse.json({ error: "No se pudo leer el usuario a eliminar." }, { status: 500 });
  }
  if (!target) {
    return NextResponse.json({ error: "El usuario ya no existe." }, { status: 404 });
  }

  // --- 5.b Alcance del closer (§8 de la especificación del 2026-08-04) ---
  // El closer elimina ÚNICAMENTE las cuentas de aliado que él mismo abrió. Un
  // aliado que le atribuyeron pero que dio de alta otra persona lo ve y le
  // trabaja el proceso comercial, y ahí se acaba (§9). `created_by` en NULL —los
  // aliados anteriores al registro de autoría— no concede nada: se comprueba
  // contra un valor presente, nunca contra la ausencia de dato.
  if (esCloser) {
    if (target.role !== "aliado") {
      return NextResponse.json(
        { error: "Un closer solo puede eliminar cuentas de aliado." },
        { status: 403 }
      );
    }
    if (!target.created_by || target.created_by !== caller.id) {
      return NextResponse.json(
        {
          error:
            "Solo puedes eliminar los aliados que tú diste de alta. Este lo abrió otra persona: pídeselo a Dirección.",
        },
        { status: 403 }
      );
    }
  }

  // --- 6. Proyectos del aliado (FK bloqueante) ---
  const { data: ownedProspects, error: ownedErr } = await admin
    .from("prospects")
    .select("id")
    .eq("aliado_id", userId);
  if (ownedErr) {
    return NextResponse.json({ error: "Error consultando sus proyectos." }, { status: 500 });
  }
  const ownedCount = ownedProspects?.length ?? 0;

  // Un closer no reparte carteras de clientes. Si el aliado ya tiene proyectos,
  // moverlos a otro aliado es una decisión comercial que no le corresponde (y su
  // RLS ni siquiera le deja ver los aliados destino), así que aquí se para.
  if (esCloser && ownedCount > 0) {
    return NextResponse.json(
      {
        error: `Este aliado ya tiene ${ownedCount} cliente(s) registrado(s). Reasignarlos es cosa de Dirección: pídele a ella la baja.`,
        projectCount: ownedCount,
      },
      { status: 409 }
    );
  }

  if (ownedCount > 0) {
    if (!reassignToAliadoId) {
      // El frontend usa esto para forzar la elección del aliado destino.
      return NextResponse.json(
        {
          error: `Este aliado tiene ${ownedCount} proyecto(s). Reasígnalos a otro aliado para poder eliminarlo.`,
          needsReassign: true,
          projectCount: ownedCount,
        },
        { status: 409 }
      );
    }
    if (reassignToAliadoId === userId) {
      return NextResponse.json(
        { error: "No puedes reasignar los proyectos al mismo usuario que vas a eliminar." },
        { status: 400 }
      );
    }

    const { data: destAliado, error: destErr } = await admin
      .from("profiles")
      .select("id, full_name, empresa_multialiado_id")
      .eq("id", reassignToAliadoId)
      .maybeSingle();
    if (destErr || !destAliado) {
      return NextResponse.json({ error: "El aliado destino no existe." }, { status: 400 });
    }

    const { error: reassignErr } = await admin
      .from("prospects")
      .update({
        aliado_id: destAliado.id,
        aliado_name: destAliado.full_name,
        empresa_multialiado_id: destAliado.empresa_multialiado_id || null,
        updated_at: new Date().toISOString(),
      })
      .eq("aliado_id", userId);
    if (reassignErr) {
      return NextResponse.json(
        { error: "No se pudieron reasignar los proyectos: " + reassignErr.message },
        { status: 500 }
      );
    }
  }

  // --- 6a-bis. Aliados atribuidos a este usuario como CLOSER ---
  // `profiles.closer_origen_id` es ON DELETE SET NULL: borrar a un closer con
  // aliados a su nombre BORRARÍA EN SILENCIO el mérito histórico de todas sus
  // captaciones, y ese dato no se puede reconstruir. Se bloquea el borrado y se
  // exige reatribuir antes, igual que con los proyectos de un aliado.
  const { data: aliadosDelCloser, error: closerErr } = await admin
    .from("profiles")
    .select("id")
    .eq("closer_origen_id", userId);
  // Si la migración de closers todavía no está aplicada, la columna no existe:
  // el error se ignora y el borrado sigue como antes.
  if (!closerErr && (aliadosDelCloser?.length ?? 0) > 0) {
    return NextResponse.json(
      {
        error: `Este closer tiene ${aliadosDelCloser!.length} aliado(s) atribuido(s). Reasígnalos a otro closer desde el módulo Closers antes de eliminarlo: al borrarlo se perdería el histórico de su captación.`,
        needsCloserReassign: true,
        aliadoCount: aliadosDelCloser!.length,
      },
      { status: 409 }
    );
  }

  // --- 6b. Proyectos donde este usuario es el ACCOUNT MANAGER ---
  // La FK `prospects.account_manager_id` es ON DELETE SET NULL, así que al
  // borrar la cuenta esos proyectos quedarían SIN AM. Si el director indicó un
  // AM destino, transferimos la cartera a ese AM antes de borrar.
  if (reassignToAmId) {
    if (reassignToAmId === userId) {
      return NextResponse.json(
        { error: "No puedes reasignar la cartera al mismo Account Manager que vas a eliminar." },
        { status: 400 }
      );
    }
    const { data: destAm, error: destAmErr } = await admin
      .from("profiles")
      .select("id, role")
      .eq("id", reassignToAmId)
      .maybeSingle();
    if (destAmErr || !destAm) {
      return NextResponse.json({ error: "El Account Manager destino no existe." }, { status: 400 });
    }
    if (destAm.role !== "account_manager") {
      return NextResponse.json(
        { error: "El destino de la cartera debe ser un Account Manager." },
        { status: 400 }
      );
    }
    const { error: amReassignErr } = await admin
      .from("prospects")
      .update({ account_manager_id: reassignToAmId, updated_at: new Date().toISOString() })
      .eq("account_manager_id", userId);
    if (amReassignErr) {
      return NextResponse.json(
        { error: "No se pudo reasignar la cartera del Account Manager: " + amReassignErr.message },
        { status: 500 }
      );
    }

    // Y la CARTERA DE ALIADOS, que es otra cosa: decide de quién serán los
    // proyectos que capturen a partir de ahora (20260904000000). Su FK también
    // es ON DELETE SET NULL, así que sin esto los aliados del AM borrado
    // volverían en silencio a repartirse por la ruleta.
    const { error: aliadosReassignErr } = await admin
      .from("profiles")
      .update({ account_manager_id: reassignToAmId })
      .eq("account_manager_id", userId)
      .eq("role", "aliado");
    if (aliadosReassignErr) {
      return NextResponse.json(
        { error: "No se pudo reasignar la cartera de aliados: " + aliadosReassignErr.message },
        { status: 500 }
      );
    }
  }
  // Si no se indicó reassignToAmId, la FK ON DELETE SET NULL deja sus proyectos
  // sin AM y sus aliados sin cartera al eliminar la cuenta: los proyectos van a
  // la mesa de dirección y lo que capturen esos aliados pasa a repartirlo la
  // ruleta. Es un estado válido, pero conviene saberlo.

  // --- 7. Desligar códigos de invitación (created_by / used_by → NULL) ---
  // Ambas columnas son nullable; sin esto la FK bloquea el borrado del perfil.
  await admin.from("invitation_codes").update({ created_by: null }).eq("created_by", userId);
  await admin.from("invitation_codes").update({ used_by: null }).eq("used_by", userId);

  // --- 7.b Historial de atribución a closers ---
  // `closer_aliado_asignaciones.aliado_id` NO tiene FK a propósito (ver
  // 20260801000000_closers.sql): así el registro sobrevive a la ruta de
  // auto-recuperación de createProfile, en la que el perfil todavía no existe.
  // El precio de esa decisión se paga aquí: al borrar de verdad a un usuario,
  // hay que limpiar sus filas a mano o el historial acumula huérfanos.
  // Las columnas de closer sí son FK con ON DELETE SET NULL, así que borrar a un
  // CLOSER no destruye la historia de sus aliados: solo deja de nombrarlo.
  const { error: histDelErr } = await admin
    .from("closer_aliado_asignaciones")
    .delete()
    .eq("aliado_id", userId);
  if (histDelErr) {
    // No es motivo para abortar el borrado: es auditoría, no integridad.
    console.warn("No se pudo limpiar el historial de closers del usuario:", histDelErr.message);
  }

  // --- 7.c Auditoría de la baja (§14) ---
  // Se escribe ANTES de borrar, que es cuando todavía se puede leer lo que se va
  // a perder. `aliado_auditoria.aliado_id` tampoco tiene FK, así que el renglón
  // sobrevive a la desaparición del perfil — que es justo lo que se quiere de un
  // historial de eliminaciones. Va con la service_role, de modo que el actor se
  // escribe explícitamente: aquí no hay `auth.uid()` que valga.
  if (target.role === "aliado") {
    const { error: audErr } = await admin.from("aliado_auditoria").insert({
      aliado_id: userId,
      actor_id: caller.id,
      actor_rol: callerProfile.role,
      accion: "eliminacion",
      datos_antes: {
        full_name: target.full_name,
        email: target.email,
        created_by: target.created_by,
        closer_origen_id: target.closer_origen_id,
        proyectos: ownedCount,
        reasignados_a: reassignToAliadoId,
      },
      datos_despues: null,
      motivo: motivo,
    });
    if (audErr) console.warn("No se pudo auditar la eliminación:", audErr.message);
  }

  // --- 8. Eliminar la cuenta de auth (el perfil cae por cascada) ---
  const { error: deleteAuthErr } = await admin.auth.admin.deleteUser(userId);
  if (deleteAuthErr) {
    // Puede que el perfil no tenga cuenta real de auth (p. ej. sesión
    // provisional). En ese caso borramos la fila del perfil directamente.
    const { error: profileDelErr } = await admin.from("profiles").delete().eq("id", userId);
    if (profileDelErr) {
      return NextResponse.json(
        { error: "No se pudo eliminar la cuenta: " + deleteAuthErr.message },
        { status: 500 }
      );
    }
  }

  return NextResponse.json({
    ok: true,
    reassignedCount: ownedCount,
    fullName: target.full_name,
    email: target.email,
  });
}
