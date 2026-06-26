const { Client } = require('pg');

const connectionString = 'postgresql://postgres:Villouta2026.@db.gxovfywzftiirdpcskbc.supabase.co:5432/postgres';

const client = new Client({
  connectionString,
  ssl: { rejectUnauthorized: false }
});

async function run() {
  console.log("Connecting directly to Supabase PostgreSQL...");
  await client.connect();
  console.log("Connected successfully!");

  // 1. Fetch profiles
  console.log("\n--- REGISTRY: ALL PROFILES ---");
  const pRes = await client.query('SELECT id, email, full_name, role, created_at FROM profiles;');
  console.log(`Found ${pRes.rows.length} profiles:`);
  pRes.rows.forEach(p => {
    console.log(`- ID: ${p.id} | Email: ${p.email} | Name: ${p.full_name} | Role: ${p.role}`);
  });

  // 2. Fetch prospects
  console.log("\n--- REGISTRY: ALL PROSPECTS (CLIENTS) ---");
  const prRes = await client.query('SELECT id, aliado_id, aliado_name, full_name, curp, status, created_at FROM prospects;');
  console.log(`Found ${prRes.rows.length} prospects:`);
  prRes.rows.forEach(pr => {
    console.log(`- ID: ${pr.id} | Name: ${pr.full_name} | Aliado ID: ${pr.aliado_id} | Aliado Name: ${pr.aliado_name} | CURP: ${pr.curp} | Status: ${pr.status} | Created: ${pr.created_at}`);
  });

  // 3. Fetch auth users
  console.log("\n--- REGISTRY: AUTH USERS ---");
  try {
    const authRes = await client.query('SELECT id, email, raw_user_meta_data, email_confirmed_at, last_sign_in_at FROM auth.users;');
    console.log(`Found ${authRes.rows.length} auth users:`);
    authRes.rows.forEach(u => {
      console.log(`- ID: ${u.id} | Email: ${u.email} | Metadata: ${JSON.stringify(u.raw_user_meta_data)} | Confirmed: ${u.email_confirmed_at}`);
    });
  } catch (err) {
    console.error("Could not query auth.users:", err.message);
  }

  await client.end();
}

run().catch(async (err) => {
  console.error("Connection failed:", err);
  try {
    await client.end();
  } catch(e) {}
});
