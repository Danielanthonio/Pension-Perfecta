import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = createClient();
    const allyId = params.id;

    // Check if user is authenticated
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }

    // El aliado no puede auto-designarse Líder (RT-4 rule 6)
    if (user.id === allyId) {
      return NextResponse.json({ error: "El aliado no puede auto-designarse Líder" }, { status: 403 });
    }

    // Get request body
    const body = await req.json();
    const { aliado_tipo, lider_grupo } = body;

    if (aliado_tipo !== "aliado" && aliado_tipo !== "lider") {
      return NextResponse.json({ error: "Tipo de aliado inválido" }, { status: 400 });
    }

    // Validate leader group (RT-4 rule 1 and 2)
    if (aliado_tipo === "lider") {
      if (!lider_grupo || !lider_grupo.trim()) {
        return NextResponse.json({ error: "Nombre del grupo es obligatorio para tipo 'lider'" }, { status: 400 });
      }
      if (lider_grupo.length > 255) {
        return NextResponse.json({ error: "El nombre del grupo no puede superar los 255 caracteres" }, { status: 400 });
      }
    }

    // Fetch caller user's profile role
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
      return NextResponse.json({ error: "Solo Account Managers y Directores pueden cambiar el tipo de aliado" }, { status: 403 });
    }

    // Fetch the target ally's profile
    const { data: allyProfile, error: allyError } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", allyId)
      .single();

    if (allyError || !allyProfile) {
      return NextResponse.json({ error: "No se encontró el perfil del aliado a modificar" }, { status: 404 });
    }

    // If AM, must be their own ally
    if (isAM && allyProfile.account_manager_id !== user.id) {
      return NextResponse.json({ error: "No tienes permisos para modificar este aliado (no está asignado a ti)" }, { status: 403 });
    }

    // Validation RT-4 rule 3: No permitir cambiar de "lider" a "aliado" si tiene aliados asignados
    if (allyProfile.aliado_tipo === "lider" && aliado_tipo === "aliado") {
      const { data: relations, error: relError } = await supabase
        .from("lider_aliados")
        .select("id")
        .eq("lider_id", allyId)
        .limit(1);

      if (relError) {
        console.error("Error checking leader relations:", relError);
        return NextResponse.json({ error: "Error al validar relaciones del líder" }, { status: 500 });
      }

      if (relations && relations.length > 0) {
        return NextResponse.json({
          error: "No se puede cambiar el tipo de Líder a Aliado porque tiene aliados asignados bajo su cargo"
        }, { status: 400 });
      }
    }

    // Validation RT-4 rule 4: No permitir duplicar nombre de grupo para mismo Account Manager
    if (aliado_tipo === "lider") {
      const { data: duplicateGroups, error: dupError } = await supabase
        .from("profiles")
        .select("id")
        .eq("role", "aliado")
        .eq("aliado_tipo", "lider")
        .eq("account_manager_id", allyProfile.account_manager_id)
        .ilike("lider_grupo", lider_grupo.trim())
        .neq("id", allyId)
        .limit(1);

      if (dupError) {
        console.error("Error checking duplicate groups:", dupError);
        return NextResponse.json({ error: "Error al validar nombre de grupo duplicado" }, { status: 500 });
      }

      if (duplicateGroups && duplicateGroups.length > 0) {
        return NextResponse.json({
          error: `Ya existe un grupo con el nombre '${lider_grupo}' para este Account Manager`
        }, { status: 400 });
      }
    }

    // Perform the update
    const updateData: any = {
      aliado_tipo,
      lider_grupo: aliado_tipo === "lider" ? lider_grupo.trim() : null,
    };

    const { data: updatedProfile, error: updateError } = await supabase
      .from("profiles")
      .update(updateData)
      .eq("id", allyId)
      .select()
      .single();

    if (updateError) {
      console.error("Error updating profile type:", updateError);
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }

    return NextResponse.json({
      id: updatedProfile.id,
      name: updatedProfile.full_name,
      aliado_tipo: updatedProfile.aliado_tipo,
      lider_grupo: updatedProfile.lider_grupo,
      updated_at: new Date().toISOString(),
    });
  } catch (err: any) {
    console.error("Internal Server Error in PATCH /api/aliados/:id/tipo:", err);
    return NextResponse.json({ error: err.message || "Internal Server Error" }, { status: 500 });
  }
}
