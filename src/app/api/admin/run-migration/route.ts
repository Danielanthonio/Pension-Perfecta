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
  const migrationsDir = path.join(process.cwd(), "supabase/migrations");

  if (!fs.existsSync(migrationsDir)) {
    return NextResponse.json({ error: `Directorio de migraciones no encontrado: ${migrationsDir}` }, { status: 404 });
  }

  // Get and sort all .sql files
  const files = fs.readdirSync(migrationsDir)
    .filter(f => f.endsWith(".sql"))
    .sort();

  if (files.length === 0) {
    return NextResponse.json({ message: "No se encontraron archivos de migración." });
  }

  const client = new Client({
    connectionString,
    ssl: { rejectUnauthorized: false }
  });

  const executed: string[] = [];

  try {
    await client.connect();
    
    // Begin transaction
    await client.query("BEGIN;");

    for (const file of files) {
      const filePath = path.join(migrationsDir, file);
      const sql = fs.readFileSync(filePath, "utf8");
      
      console.log(`Running migration: ${file}`);
      await client.query(sql);
      executed.push(file);
    }

    // Commit transaction
    await client.query("COMMIT;");

    // Verify count of companies if table exists
    let companiesCount = 0;
    try {
      const checkRes = await client.query("SELECT COUNT(*) FROM public.empresas_multialiado;");
      companiesCount = parseInt(checkRes.rows[0]?.count || "0", 10);
    } catch (e) {
      console.log("empresas_multialiado table does not exist yet or count query failed");
    }

    return NextResponse.json({
      success: true,
      message: "Todas las migraciones se ejecutaron exitosamente en Supabase (desde Hostinger)",
      executed,
      empresas_count: companiesCount
    });
  } catch (err: any) {
    // Rollback transaction in case of error
    try {
      await client.query("ROLLBACK;");
    } catch (rollbackErr) {
      console.error("Rollback failed:", rollbackErr);
    }
    console.error("Migration error:", err);
    return NextResponse.json({ 
      error: err.message || "Error al ejecutar la migración",
      executed_before_failure: executed 
    }, { status: 500 });
  } finally {
    await client.end();
  }
}

