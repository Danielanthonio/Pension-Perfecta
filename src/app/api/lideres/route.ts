import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";

export async function GET(req: NextRequest) {
  try {
    const supabase = createClient();
    
    // Check if user is authenticated
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }

    // Get search params
    const { searchParams } = new URL(req.url);
    const accountManagerId = searchParams.get("account_manager_id");

    let query = supabase
      .from("profiles")
      .select("id, full_name, lider_grupo")
      .eq("role", "aliado")
      .eq("aliado_tipo", "lider");

    if (accountManagerId) {
      query = query.eq("account_manager_id", accountManagerId);
    }

    const { data: dbLideres, error } = await query;

    if (error) {
      console.error("Error fetching leaders:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Format output
    const lideres = (dbLideres || []).map((l: any) => ({
      id: l.id,
      nombre: l.full_name,
      grupo_nombre: l.lider_grupo || "Sin Grupo",
      alias: `Líder ${l.lider_grupo || "Sin Grupo"}`,
    }));

    return NextResponse.json({ lideres });
  } catch (err: any) {
    console.error("Internal Server Error in GET /api/lideres:", err);
    return NextResponse.json({ error: err.message || "Internal Server Error" }, { status: 500 });
  }
}
