import { NextRequest, NextResponse } from "next/server";
import { Client } from "pg";
import fs from "fs";
import path from "path";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const secret = searchParams.get("secret");

  if (secret !== "Villouta2026.") {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const connectionString = "postgresql://postgres:Villouta2026.@db.gxovfywzftiirdpcskbc.supabase.co:5432/postgres";
  const migrationFile = path.join(process.cwd(), "supabase/migrations/20260626000001_add_empresas_multialiado.sql");

  if (!fs.existsSync(migrationFile)) {
    return NextResponse.json({ error: `Archivo de migración no encontrado en: ${migrationFile}` }, { status: 404 });
  }

  const sql = fs.readFileSync(migrationFile, "utf8");

  const client = new Client({
    connectionString,
    ssl: { rejectUnauthorized: false }
  });

  try {
    await client.connect();
    await client.query(sql);
    
    // Verify count of companies
    const checkRes = await client.query("SELECT COUNT(*) FROM public.empresas_multialiado;");
    const count = parseInt(checkRes.rows[0]?.count || "0", 10);

    return NextResponse.json({
      success: true,
      message: "Migración ejecutada exitosamente en Supabase (desde Hostinger/Servidor)",
      empresas_count: count
    });
  } catch (err: any) {
    console.error("Migration error:", err);
    return NextResponse.json({ error: err.message || "Error al ejecutar la migración" }, { status: 500 });
  } finally {
    await client.end();
  }
}
