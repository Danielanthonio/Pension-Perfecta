const { Client } = require("pg");
const fs = require("fs");
const path = require("path");

const connectionString = "postgresql://postgres:Villouta2026.@db.gxovfywzftiirdpcskbc.supabase.co:5432/postgres";
const migrationFile = path.join(__dirname, "../supabase/migrations/20260626000001_add_empresas_multialiado.sql");

async function main() {
  console.log("Reading migration SQL...");
  if (!fs.existsSync(migrationFile)) {
    console.error("Migration file not found at:", migrationFile);
    process.exit(1);
  }

  const sql = fs.readFileSync(migrationFile, "utf8");
  console.log("Connecting to Supabase PostgreSQL...");

  const client = new Client({
    connectionString,
    ssl: { rejectUnauthorized: false }
  });

  try {
    await client.connect();
    console.log("Connected successfully!");

    console.log("Executing migration SQL...");
    await client.query(sql);
    console.log("Migration executed successfully!");

    // Check if the table now exists
    const res = await client.query("SELECT * FROM public.empresas_multialiado LIMIT 1;");
    console.log("Verification check - public.empresas_multialiado exists:", res.rows !== undefined);

  } catch (err) {
    console.error("Error executing migration:", err);
  } finally {
    await client.end();
    console.log("Connection closed.");
  }
}

main();
