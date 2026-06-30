import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";

export async function GET(
  req: NextRequest,
  { params }: { params: { lider_id: string } }
) {
  try {
    const supabase = createClient();
    const liderId = params.lider_id;

    // Check if user is authenticated
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }

    // Fetch the leader profile
    const { data: leader, error: leaderError } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", liderId)
      .single();

    if (leaderError || !leader) {
      return NextResponse.json({ error: "Líder no encontrado" }, { status: 404 });
    }

    if (leader.aliado_tipo !== "lider") {
      return NextResponse.json({ error: "El usuario especificado no es de tipo 'lider'" }, { status: 400 });
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
    const isSelf = user.id === liderId;

    // Check permissions: self (lider), Director, or Account Manager managing this leader
    const hasPermission = isSelf || isDirector || (isAM && leader.account_manager_id === user.id);
    if (!hasPermission) {
      return NextResponse.json({ error: "No tienes permisos para ver los aliados de este líder" }, { status: 403 });
    }

    // Fetch allies assigned to this leader
    const { data: relations, error: relError } = await supabase
      .from("lider_aliados")
      .select(`
        id,
        created_at,
        profiles!lider_aliados_aliado_asignado_id_fkey (
          id,
          full_name,
          email,
          lider_grupo,
          empresa_multialiado_id,
          account_manager_id
        )
      `)
      .eq("lider_id", liderId);

    if (relError) {
      console.error("Error fetching leader relations:", relError);
      return NextResponse.json({ error: relError.message }, { status: 500 });
    }

    // Format list of assigned allies and calculate prospect count
    const aliados_asignados = [];
    let total_prospectos = 0;

    for (const r of (relations || [])) {
      const ally = r.profiles as any;
      if (!ally) continue;

      // Count active prospects for this ally (ignoring deleted/purged ones)
      const { data: prospects, error: prospectsError } = await supabase
        .from("prospects")
        .select("notes_director")
        .eq("aliado_id", ally.id);

      let activeProspectsCount = 0;
      if (prospects) {
        activeProspectsCount = prospects.filter((p: any) => {
          const notesDir = p.notes_director || "";
          return !notesDir.startsWith("[DELETED:") && !notesDir.startsWith("[PURGED:");
        }).length;
      }

      total_prospectos += activeProspectsCount;

      // Look up Account Manager name
      let accountManagerName = "Mesa de Operaciones";
      if (ally.account_manager_id) {
        const { data: amProfile } = await supabase
          .from("profiles")
          .select("full_name")
          .eq("id", ally.account_manager_id)
          .maybeSingle();
        if (amProfile) {
          accountManagerName = amProfile.full_name;
        }
      }

      aliados_asignados.push({
        id: ally.id,
        name: ally.full_name,
        email: ally.email,
        prospectos_activos: activeProspectsCount,
        assigned_at: new Date(r.created_at).toISOString().split("T")[0],
        empresa_nombre: ally.lider_grupo || leader.lider_grupo || "Sin Empresa",
        account_manager_name: accountManagerName,
        lider_nombre: leader.full_name,
      });
    }

    return NextResponse.json({
      lider_id: leader.id,
      lider_nombre: leader.full_name,
      grupo_nombre: leader.lider_grupo || "Sin Grupo",
      aliados_asignados,
      totales: {
        total_aliados: aliados_asignados.length,
        total_prospectos,
      },
    });
  } catch (err: any) {
    console.error("Internal Server Error in GET /api/lideres/:lider_id/aliados:", err);
    return NextResponse.json({ error: err.message || "Internal Server Error" }, { status: 500 });
  }
}
