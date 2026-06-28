const { Client } = require("pg");

const client = new Client({
  host: "aws-1-us-east-1.pooler.supabase.com",
  port: 6543,
  database: "postgres",
  user: "postgres.gxovfywzftiirdpcskbc",
  password: "Villouta2026.",
  ssl: { rejectUnauthorized: false }
});

async function main() {
  try {
    await client.connect();
    console.log("Connected to database!");

    // Query unique constraints and indexes on lider_aliados table
    const res = await client.query(`
      SELECT
        con.conname AS constraint_name,
        pg_get_constraintdef(con.oid) AS constraint_definition
      FROM pg_constraint con
      JOIN pg_class rel ON rel.oid = con.conrelid
      JOIN pg_namespace nsp ON nsp.oid = rel.relnamespace
      WHERE nsp.nspname = 'public' AND rel.relname = 'lider_aliados';
    `);

    console.log("Constraints on public.lider_aliados:");
    res.rows.forEach(row => {
      console.log(` - ${row.constraint_name}: ${row.constraint_definition}`);
    });

  } catch (err) {
    console.error("Error:", err);
  } finally {
    await client.end();
  }
}

main();
