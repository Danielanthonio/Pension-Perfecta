const { Client } = require("pg");
const dns = require("dns");
const fs = require("fs");
const path = require("path");

// Set DNS to nat64.net DNS64 resolvers
console.log("Setting DNS servers to nat64.net...");
dns.setServers(["193.110.157.147", "193.110.157.148"]);

const connectionString = "postgresql://postgres:Villouta2026.@db.gxovfywzftiirdpcskbc.supabase.co:5432/postgres";

async function run() {
  console.log("Resolving database host using NAT64...");
  dns.resolve4("db.gxovfywzftiirdpcskbc.supabase.co", async (err, addresses) => {
    if (err) {
      console.error("DNS64 Resolution failed:", err);
      return;
    }
    console.log("Resolved IPv4-synthesized addresses:", addresses);

    const client = new Client({
      connectionString,
      ssl: { rejectUnauthorized: false }
    });

    try {
      console.log("Connecting to Supabase via NAT64...");
      await client.connect();
      console.log("🎉 Connected successfully to Supabase!");

      // Load migrations in order
      const migrationsDir = path.join(__dirname, "../supabase/migrations");
      const files = fs.readdirSync(migrationsDir)
        .filter(f => f.endsWith(".sql"))
        .sort();

      console.log("Found migration files:", files);

      await client.query("BEGIN;");

      for (const file of files) {
        console.log(`Executing migration: ${file}`);
        const sql = fs.readFileSync(path.join(migrationsDir, file), "utf8");
        await client.query(sql);
      }

      await client.query("COMMIT;");
      console.log("🚀 All migrations executed successfully in Supabase!");

      // Verify table exists and count
      const res = await client.query("SELECT COUNT(*) FROM public.empresas_multialiado;");
      console.log("Verification - Number of companies in DB:", res.rows[0].count);

    } catch (dbErr) {
      console.error("Database error:", dbErr);
      try {
        await client.query("ROLLBACK;");
      } catch (rErr) {}
    } finally {
      await client.end();
      console.log("Connection closed.");
    }
  });
}

run();
