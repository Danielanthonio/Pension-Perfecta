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

    // (Se eliminó el filtro ?account_manager_id=: los líderes no pertenecen a la
    // cartera de un AM ni siquiera ahora que el aliado sí, ver 20260831000001.)
    const { data: dbLideres, error } = await supabase
      .from("profiles")
      .select("id, full_name, lider_grupo")
      .eq("role", "aliado")
      .eq("aliado_tipo", "lider");

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
