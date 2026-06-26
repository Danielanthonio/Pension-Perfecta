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
    const { lider_id, aliado_asignado_id } = body;

    if (!lider_id || !aliado_asignado_id) {
      return NextResponse.json({ error: "Faltan lider_id o aliado_asignado_id" }, { status: 400 });
    }

    if (lider_id === aliado_asignado_id) {
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

    // Fetch leader profile
    const { data: leader, error: leaderError } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", lider_id)
      .single();

    if (leaderError || !leader) {
      return NextResponse.json({ error: "Líder no encontrado" }, { status: 404 });
    }

    if (leader.aliado_tipo !== "lider") {
      return NextResponse.json({ error: "El usuario especificado como líder no es de tipo 'lider'" }, { status: 400 });
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

    // Verify AM permission for both profiles (they must belong to the AM)
    if (isAM) {
      if (leader.account_manager_id !== user.id || ally.account_manager_id !== user.id) {
        return NextResponse.json({
          error: "No tienes permisos para gestionar asignaciones entre estos usuarios (no están bajo tu gestión)"
        }, { status: 403 });
      }
    }

    // Since an ally can only be assigned to one leader, delete any existing relationship
    const { error: deleteError } = await supabase
      .from("lider_aliados")
      .delete()
      .eq("aliado_asignado_id", aliado_asignado_id);

    if (deleteError) {
      console.error("Error clearing old leader relationship:", deleteError);
      return NextResponse.json({ error: "Error al limpiar la relación anterior de líder" }, { status: 500 });
    }

    // Create the relationship
    const { data: newRelation, error: insertError } = await supabase
      .from("lider_aliados")
      .insert({
        lider_id,
        aliado_asignado_id,
        empresa_multialiado_id: leader.empresa_multialiado_id,
        grupo_nombre: leader.lider_grupo || "Sin Grupo",
      })
      .select()
      .single();

    if (insertError) {
      console.error("Error creating leader relationship:", insertError);
      return NextResponse.json({ error: insertError.message }, { status: 500 });
    }

    return NextResponse.json({
      id: newRelation.id,
      lider_id: newRelation.lider_id,
      aliado_asignado_id: newRelation.aliado_asignado_id,
      empresa_multialiado_id: newRelation.empresa_multialiado_id,
      grupo_nombre: newRelation.grupo_nombre,
      created_at: newRelation.created_at,
    }, { status: 201 });
  } catch (err: any) {
    console.error("Internal Server Error in POST /api/lider-aliados:", err);
    return NextResponse.json({ error: err.message || "Internal Server Error" }, { status: 500 });
  }
}
