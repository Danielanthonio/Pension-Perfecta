import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";

export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = createClient();
    const relationId = params.id;

    // Check if user is authenticated
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
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
      return NextResponse.json({ error: "Solo Account Managers y Directores pueden eliminar asignaciones de líderes" }, { status: 403 });
    }

    // Fetch the relationship details to verify ownership/permission
    const { data: relation, error: relError } = await supabase
      .from("lider_aliados")
      .select("*")
      .eq("id", relationId)
      .single();

    if (relError || !relation) {
      return NextResponse.json({ error: "Asignación no encontrada" }, { status: 404 });
    }

    // If AM, verify that either the leader or ally belongs to them
    if (isAM) {
      // Get the leader profile to check their account_manager_id
      const { data: leader } = await supabase
        .from("profiles")
        .select("account_manager_id")
        .eq("id", relation.lider_id)
        .single();

      if (!leader || leader.account_manager_id !== user.id) {
        return NextResponse.json({
          error: "No tienes permisos para eliminar esta asignación (el líder no está bajo tu gestión)"
        }, { status: 403 });
      }
    }

    // Perform delete
    const { error: deleteError } = await supabase
      .from("lider_aliados")
      .delete()
      .eq("id", relationId);

    if (deleteError) {
      console.error("Error deleting leader relationship:", deleteError);
      return NextResponse.json({ error: deleteError.message }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      message: "Aliado desasignado",
    });
  } catch (err: any) {
    console.error("Internal Server Error in DELETE /api/lider-aliados/:id:", err);
    return NextResponse.json({ error: err.message || "Internal Server Error" }, { status: 500 });
  }
}
