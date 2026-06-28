const { Client } = require("pg");
const fs = require("fs");
const path = require("path");

const client = new Client({
  host: "aws-1-us-east-1.pooler.supabase.com",
  port: 6543,
  database: "postgres",
  user: "postgres.gxovfywzftiirdpcskbc",
  password: "Villouta2026.",
  ssl: { rejectUnauthorized: false }
});

async function main() {
  const migrationsDir = path.join(__dirname, "../supabase/migrations");
  
  if (!fs.existsSync(migrationsDir)) {
    console.error("Migrations directory not found!");
    process.exit(1);
  }

  const files = fs.readdirSync(migrationsDir)
    .filter(f => f.endsWith(".sql"))
    .sort();

  if (files.length === 0) {
    console.log("No migration files found.");
    process.exit(0);
  }

  console.log("Found migration files in order:", files);

  try {
    console.log("Connecting directly to Supabase Connection Pooler...");
    await client.connect();
    console.log("Connected successfully!");

    console.log("Beginning migration transaction...");
    await client.query("BEGIN;");

    for (const file of files) {
      console.log(`Executing migration: ${file}`);
      const sql = fs.readFileSync(path.join(migrationsDir, file), "utf8");
      await client.query(sql);
    }

    await client.query("COMMIT;");
    console.log("🎉 All migrations executed successfully in the production database!");

    // Verification check
    const checkRes = await client.query("SELECT COUNT(*) FROM public.empresas_multialiado;");
    console.log("Verification - Number of companies in DB:", checkRes.rows[0].count);

    // List the companies to verify the initial inserts
    const listRes = await client.query("SELECT id, nombre FROM public.empresas_multialiado;");
    console.log("Initial Companies registered:");
    listRes.rows.forEach(row => {
      console.log(` - ID: ${row.id} | Name: ${row.nombre}`);
    });

  } catch (err) {
    console.error("Migration execution failed:", err);
    try {
      await client.query("ROLLBACK;");
      console.log("Transaction rolled back successfully.");
    } catch (rErr) {
      console.error("Rollback failed:", rErr);
    }
    process.exit(1);
  } finally {
    await client.end();
    console.log("Connection closed.");
  }
}

main();
