import { NextResponse } from "next/server";
import { createClient as createServiceClient } from "@supabase/supabase-js";
import { createClient as createUserClient } from "@/utils/supabase/server";

// Borrado PERMANENTE de un usuario (director → aliado / account_manager / otro).
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
  let body: { userId?: string; reassignToAliadoId?: string | null; reassignToAmId?: string | null };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Cuerpo de la solicitud inválido." }, { status: 400 });
  }

  const userId = body?.userId;
  const reassignToAliadoId = body?.reassignToAliadoId || null;
  const reassignToAmId = body?.reassignToAmId || null;
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
  if (!callerProfile || !DIRECTOR_ROLES.includes(callerProfile.role)) {
    return NextResponse.json({ error: "Solo la Dirección puede eliminar usuarios." }, { status: 403 });
  }

  // --- 5. Salvaguardas básicas ---
  if (userId === caller.id) {
    return NextResponse.json({ error: "No puedes eliminar tu propia cuenta." }, { status: 400 });
  }

  const { data: target, error: targetErr } = await admin
    .from("profiles")
    .select("id, role, full_name, email")
    .eq("id", userId)
    .maybeSingle();
  if (targetErr) {
    return NextResponse.json({ error: "No se pudo leer el usuario a eliminar." }, { status: 500 });
  }
  if (!target) {
    return NextResponse.json({ error: "El usuario ya no existe." }, { status: 404 });
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
  }
  // Si no se indicó reassignToAmId, la FK ON DELETE SET NULL deja sus proyectos
  // sin AM automáticamente al eliminar la cuenta (estado válido).

  // --- 7. Desligar códigos de invitación (created_by / used_by → NULL) ---
  // Ambas columnas son nullable; sin esto la FK bloquea el borrado del perfil.
  await admin.from("invitation_codes").update({ created_by: null }).eq("created_by", userId);
  await admin.from("invitation_codes").update({ used_by: null }).eq("used_by", userId);

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
