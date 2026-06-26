import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";

export async function PUT(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = createClient();
    const empresaId = params.id;

    // Check if user is authenticated
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
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
      return NextResponse.json({ error: "Solo Account Managers y Directores pueden editar empresas" }, { status: 403 });
    }

    const body = await req.json();
    const { nombre } = body;

    if (!nombre || !nombre.trim()) {
      return NextResponse.json({ error: "El nombre de la empresa es obligatorio" }, { status: 400 });
    }

    // Check for duplicate name (excluding current company)
    const { data: existing, error: existError } = await supabase
      .from("empresas_multialiado")
      .select("id")
      .ilike("nombre", nombre.trim())
      .neq("id", empresaId)
      .limit(1);

    if (existError) {
      console.error("Error checking duplicate name on edit:", existError);
      return NextResponse.json({ error: existError.message }, { status: 500 });
    }

    if (existing && existing.length > 0) {
      return NextResponse.json({ error: `La empresa '${nombre.trim()}' ya existe` }, { status: 400 });
    }

    // Update company
    const { data: updatedCompany, error: updateError } = await supabase
      .from("empresas_multialiado")
      .update({
        nombre: nombre.trim(),
        updated_at: new Date().toISOString()
      })
      .eq("id", empresaId)
      .select(`
        *,
        creator:profiles!empresas_multialiado_created_by_fkey(full_name)
      `)
      .single();

    if (updateError) {
      console.error("Error updating company:", updateError);
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }

    return NextResponse.json({
      id: updatedCompany.id,
      nombre: updatedCompany.nombre,
      created_by: updatedCompany.creator?.full_name || "Usuario",
      created_at: updatedCompany.created_at,
      updated_at: updatedCompany.updated_at
    });
  } catch (err: any) {
    console.error("Internal Server Error in PUT /api/empresas-multialiado/:id:", err);
    return NextResponse.json({ error: err.message || "Internal Server Error" }, { status: 500 });
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = createClient();
    const empresaId = params.id;

    // Check if user is authenticated
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
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
      return NextResponse.json({ error: "Solo Account Managers y Directores pueden eliminar empresas" }, { status: 403 });
    }

    // CRITICAL VALIDATION: Do not delete if there are leaders assigned to it
    const { data: leaders, error: leadError } = await supabase
      .from("profiles")
      .select("id")
      .eq("empresa_multialiado_id", empresaId)
      .limit(1);

    if (leadError) {
      console.error("Error checking assigned leaders before delete:", leadError);
      return NextResponse.json({ error: leadError.message }, { status: 500 });
    }

    if (leaders && leaders.length > 0) {
      return NextResponse.json({
        error: "No se puede eliminar la empresa porque tiene líderes asignados"
      }, { status: 400 });
    }

    // Perform delete
    const { error: deleteError } = await supabase
      .from("empresas_multialiado")
      .delete()
      .eq("id", empresaId);

    if (deleteError) {
      console.error("Error deleting company:", deleteError);
      return NextResponse.json({ error: deleteError.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, message: "Empresa eliminada con éxito" });
  } catch (err: any) {
    console.error("Internal Server Error in DELETE /api/empresas-multialiado/:id:", err);
    return NextResponse.json({ error: err.message || "Internal Server Error" }, { status: 500 });
  }
}
