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
    const { aliado_tipo, empresa_multialiado_id } = body;

    if (aliado_tipo !== "aliado" && aliado_tipo !== "lider") {
      return NextResponse.json({ error: "Tipo de aliado inválido" }, { status: 400 });
    }

    let empresaNombre: string | null = null;

    // Validate company (empresa_multialiado_id)
    if (aliado_tipo === "lider") {
      if (!empresa_multialiado_id) {
        return NextResponse.json({ error: "Seleccionar una empresa es obligatorio para tipo 'lider'" }, { status: 400 });
      }
      
      const { data: empresa, error: empError } = await supabase
        .from("empresas_multialiado")
        .select("nombre")
        .eq("id", empresa_multialiado_id)
        .single();

      if (empError || !empresa) {
        return NextResponse.json({ error: "La empresa seleccionada no existe" }, { status: 400 });
      }
      empresaNombre = empresa.nombre;
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

    // Perform the update
    const updateData: any = {
      aliado_tipo,
      empresa_multialiado_id: aliado_tipo === "lider" ? empresa_multialiado_id : null,
      lider_grupo: aliado_tipo === "lider" ? empresaNombre : null, // For backward compatibility
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
      empresa_multialiado_id: updatedProfile.empresa_multialiado_id,
      empresa_nombre: updatedProfile.lider_grupo,
      updated_at: new Date().toISOString(),
    });
  } catch (err: any) {
    console.error("Internal Server Error in PATCH /api/aliados/:id/tipo:", err);
    return NextResponse.json({ error: err.message || "Internal Server Error" }, { status: 500 });
  }
}
