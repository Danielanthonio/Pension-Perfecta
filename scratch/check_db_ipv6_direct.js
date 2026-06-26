const { Client } = require('pg');

const client = new Client({
  user: 'postgres',
  host: '2600:1f18:4f06:de00:467c:d637:26cd:c57f',
  database: 'postgres',
  password: 'Villouta2026.',
  port: 5432,
  ssl: { rejectUnauthorized: false }
});

async function run() {
  console.log("Connecting directly to PostgreSQL via direct IPv6 IP...");
  await client.connect();
  console.log("Connected successfully!");

  // Query profiles
  const pRes = await client.query('SELECT * FROM profiles;');
  console.log(`Found ${pRes.rows.length} profiles:`);
  pRes.rows.forEach(p => {
    console.log(`- ID: ${p.id} | Email: ${p.email} | Name: ${p.full_name} | Role: ${p.role}`);
  });

  // Query prospects
  const prRes = await client.query('SELECT id, aliado_id, aliado_name, full_name, curp, status, created_at FROM prospects;');
  console.log(`Found ${prRes.rows.length} prospects:`);
  prRes.rows.forEach(pr => {
    console.log(`- ID: ${pr.id} | Name: ${pr.full_name} | Aliado ID: ${pr.aliado_id} | Aliado Name: ${pr.aliado_name} | CURP: ${pr.curp} | Status: ${pr.status} | Created: ${pr.created_at}`);
  });

  await client.end();
}

run().catch(async (err) => {
  console.error("Connection failed:", err);
  try {
    await client.end();
  } catch(e) {}
});
