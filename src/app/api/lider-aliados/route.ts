import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";

export async function POST(req: NextRequest) {
  try {
    const supabase = createClient();

    // Check if user is authenticated
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }

    // Get request body
    const body = await req.json();
    const { lider_ids, aliado_asignado_id } = body;

    if (!Array.isArray(lider_ids) || !aliado_asignado_id) {
      return NextResponse.json({ error: "Faltan lider_ids (array) o aliado_asignado_id" }, { status: 400 });
    }

    if (lider_ids.includes(aliado_asignado_id)) {
      return NextResponse.json({ error: "Un líder no puede asignarse a sí mismo como aliado" }, { status: 400 });
    }

    // Fetch caller's profile to verify permission
    const { data: callerProfile, error: callerError } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single();

    if (callerError || !callerProfile) {
      return NextResponse.json({ error: "No se encontró el perfil del usuario firmante" }, { status: 403 });
    }

    const callerRole = callerProfile.role;
    const isDirector = callerRole === "admin" || callerRole === "director";
    const isAM = callerRole === "account_manager";

    if (!isDirector && !isAM) {
      return NextResponse.json({ error: "Solo Account Managers y Directores pueden realizar asignaciones de líderes" }, { status: 403 });
    }

    // Fetch ally profile
    const { data: ally, error: allyError } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", aliado_asignado_id)
      .single();

    if (allyError || !ally) {
      return NextResponse.json({ error: "Aliado no encontrado" }, { status: 404 });
    }

    if (ally.aliado_tipo !== "aliado") {
      return NextResponse.json({ error: "Solo se pueden asignar aliados de tipo 'aliado' a un Líder" }, { status: 400 });
    }

    // (Cualquier AM puede gestionar asignaciones: la "cartera" del AM ya no
    // existe — el AM se asigna por PROYECTO, no por aliado.)

    // Fetch all requested leader profiles
    let leaders: any[] = [];
    if (lider_ids.length > 0) {
      // Validate that the ally belongs to a company
      if (!ally.empresa_multialiado_id) {
        return NextResponse.json({ error: "No se pueden asignar líderes a un aliado independiente (no pertenece a empresa)" }, { status: 400 });
      }

      const { data: leaderData, error: leaderDataError } = await supabase
        .from("profiles")
        .select("*")
        .in("id", lider_ids);

      if (leaderDataError) {
        return NextResponse.json({ error: "Error consultando líderes" }, { status: 500 });
      }

      leaders = leaderData || [];

      if (leaders.length !== lider_ids.length) {
        return NextResponse.json({ error: "Uno o más líderes especificados no existen" }, { status: 404 });
      }

      for (const leader of leaders) {
        if (leader.aliado_tipo !== "lider") {
          return NextResponse.json({ error: `El usuario ${leader.full_name} no es de tipo 'lider'` }, { status: 400 });
        }
        if (leader.empresa_multialiado_id !== ally.empresa_multialiado_id) {
          return NextResponse.json({ error: `El líder ${leader.full_name} pertenece a una empresa diferente a la del aliado` }, { status: 400 });
        }
        // (Sin gate de cartera: cualquier AM puede asignar líderes de la misma empresa.)
      }
    }

    // To sync correctly: we delete relations that are not in the new list, and insert ones that are new.
    // Or we just delete all and insert the new ones. Deleting all and inserting is easier.
    const { error: deleteError } = await supabase
      .from("lider_aliados")
      .delete()
      .eq("aliado_asignado_id", aliado_asignado_id);

    if (deleteError) {
      console.error("Error clearing old leader relationships:", deleteError);
      return NextResponse.json({ error: "Error al limpiar la relación anterior de líder" }, { status: 500 });
    }

    const newRelations = [];
    if (lider_ids.length > 0) {
      const inserts = leaders.map((leader) => ({
        lider_id: leader.id,
        aliado_asignado_id,
        empresa_multialiado_id: leader.empresa_multialiado_id,
        grupo_nombre: leader.lider_grupo || "Sin Grupo",
      }));

      const { data: insertedRels, error: insertError } = await supabase
        .from("lider_aliados")
        .insert(inserts)
        .select();

      if (insertError) {
        console.error("Error creating leader relationships:", insertError);
        return NextResponse.json({ error: insertError.message }, { status: 500 });
      }
      newRelations.push(...(insertedRels || []));
    }

    return NextResponse.json({
      message: "Asignaciones actualizadas",
      relations: newRelations,
    }, { status: 201 });
  } catch (err: any) {
    console.error("Internal Server Error in POST /api/lider-aliados:", err);
    return NextResponse.json({ error: err.message || "Internal Server Error" }, { status: 500 });
  }
}
