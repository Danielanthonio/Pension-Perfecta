import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await createClient();
    const relationId = (await params).id;

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

    // (Sin gate de cartera: cualquier AM puede eliminar asignaciones. Desde el
    // 2026-08-31 el AM volvió a tener cartera de aliados (20260831000001), pero este gate
    // sigue siendo deliberadamente amplio: la estructura de líderes y empresas
    // es del sistema, no de una cartera, y acotarla dejaría huecos sin dueño.)

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
