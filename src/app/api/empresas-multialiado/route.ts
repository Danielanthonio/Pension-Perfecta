import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";

export async function GET(req: NextRequest) {
  try {
    const supabase = await createClient();

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

    // Fetch all companies
    const { data: companies, error: compError } = await supabase
      .from("empresas_multialiado")
      .select(`
        *,
        creator:profiles!empresas_multialiado_created_by_fkey(full_name)
      `)
      .order("nombre", { ascending: true });

    if (compError) {
      console.error("Error fetching companies:", compError);
      return NextResponse.json({ error: compError.message }, { status: 500 });
    }

    // Fetch count of leaders for each company (profiles where role = 'aliado' and aliado_tipo = 'lider')
    const { data: leaders, error: leadError } = await supabase
      .from("profiles")
      .select("empresa_multialiado_id")
      .eq("role", "aliado")
      .eq("aliado_tipo", "lider");

    if (leadError) {
      console.error("Error fetching leaders for counts:", leadError);
      return NextResponse.json({ error: leadError.message }, { status: 500 });
    }

    // Aggregate counts
    const countMap: Record<string, number> = {};
    (leaders || []).forEach((l: any) => {
      if (l.empresa_multialiado_id) {
        countMap[l.empresa_multialiado_id] = (countMap[l.empresa_multialiado_id] || 0) + 1;
      }
    });

    const formattedCompanies = (companies || []).map((c: any) => ({
      id: c.id,
      nombre: c.nombre,
      created_by: c.creator?.full_name || "Sistema",
      created_at: c.created_at,
      updated_at: c.updated_at,
      lideres_count: countMap[c.id] || 0
    }));

    return NextResponse.json({ empresas: formattedCompanies });
  } catch (err: any) {
    console.error("Internal Server Error in GET /api/empresas-multialiado:", err);
    return NextResponse.json({ error: err.message || "Internal Server Error" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();

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
      return NextResponse.json({ error: "Solo Account Managers y Directores pueden crear empresas" }, { status: 403 });
    }

    const body = await req.json();
    const { nombre } = body;

    if (!nombre || !nombre.trim()) {
      return NextResponse.json({ error: "El nombre de la empresa es obligatorio" }, { status: 400 });
    }

    // Check for duplicate name
    const { data: existing, error: existError } = await supabase
      .from("empresas_multialiado")
      .select("id")
      .ilike("nombre", nombre.trim())
      .limit(1);

    if (existError) {
      console.error("Error checking existing company name:", existError);
      return NextResponse.json({ error: existError.message }, { status: 500 });
    }

    if (existing && existing.length > 0) {
      return NextResponse.json({ error: `La empresa '${nombre.trim()}' ya existe` }, { status: 400 });
    }

    // Insert new company
    const { data: newCompany, error: insertError } = await supabase
      .from("empresas_multialiado")
      .insert({
        nombre: nombre.trim(),
        created_by: user.id
      })
      .select(`
        *,
        creator:profiles!empresas_multialiado_created_by_fkey(full_name)
      `)
      .single();

    if (insertError) {
      console.error("Error creating company:", insertError);
      return NextResponse.json({ error: insertError.message }, { status: 500 });
    }

    return NextResponse.json({
      id: newCompany.id,
      nombre: newCompany.nombre,
      created_by: newCompany.creator?.full_name || "Usuario",
      created_at: newCompany.created_at,
      updated_at: newCompany.updated_at,
      lideres_count: 0
    }, { status: 201 });
  } catch (err: any) {
    console.error("Internal Server Error in POST /api/empresas-multialiado:", err);
    return NextResponse.json({ error: err.message || "Internal Server Error" }, { status: 500 });
  }
}
