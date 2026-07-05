import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";

export async function GET(
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

    // Get company details
    const { data: company, error: compError } = await supabase
      .from("empresas_multialiado")
      .select("id, nombre")
      .eq("id", empresaId)
      .single();

    if (compError || !company) {
      return NextResponse.json({ error: "Empresa no encontrada" }, { status: 404 });
    }

    // Fetch profiles associated to this company that are leaders
    const { data: leaders, error: leadError } = await supabase
      .from("profiles")
      .select("id, full_name, email, phone")
      .eq("empresa_multialiado_id", empresaId)
      .eq("role", "aliado")
      .eq("aliado_tipo", "lider");

    if (leadError) {
      console.error("Error fetching leaders for company:", leadError);
      return NextResponse.json({ error: leadError.message }, { status: 500 });
    }

    const formattedLeaders = (leaders || []).map((l: any) => ({
      id: l.id,
      nombre: l.full_name,
      email: l.email,
      phone: l.phone
    }));

    return NextResponse.json({
      empresa_id: company.id,
      empresa_nombre: company.nombre,
      lideres: formattedLeaders
    });
  } catch (err: any) {
    console.error("Internal Server Error in GET /api/empresas-multialiado/:id/lideres:", err);
    return NextResponse.json({ error: err.message || "Internal Server Error" }, { status: 500 });
  }
}
