const { Client } = require('pg');

const regions = [
  'us-east-1',
  'us-east-2',
  'us-west-1',
  'us-west-2',
  'ca-central-1',
  'sa-east-1',
  'eu-west-1',
  'eu-west-2',
  'eu-west-3',
  'eu-central-1',
  'ap-southeast-1',
  'ap-southeast-2',
  'ap-northeast-1',
  'ap-northeast-2',
  'ap-south-1'
];

async function testRegion(region) {
  const host = `aws-0-${region}.pooler.supabase.com`;
  console.log(`Testing region: ${region} (${host})...`);
  
  const client = new Client({
    user: 'postgres.gxovfywzftiirdpcskbc',
    host: host,
    database: 'postgres',
    password: 'Villouta2026.',
    port: 6543,
    ssl: { rejectUnauthorized: false },
    connectionTimeoutMillis: 3000 // fail fast
  });

  try {
    await client.connect();
    console.log(`\n🎉 SUCCESS! Connected to region: ${region}`);
    
    // Query data
    const pRes = await client.query('SELECT * FROM profiles;');
    console.log(`\n--- PROFILES (${pRes.rows.length}) ---`);
    pRes.rows.forEach(p => {
      console.log(`- ID: ${p.id} | Email: ${p.email} | Name: ${p.full_name} | Role: ${p.role}`);
    });

    const prRes = await client.query('SELECT id, aliado_id, aliado_name, full_name, curp, status, created_at FROM prospects;');
    console.log(`\n--- PROSPECTS (${prRes.rows.length}) ---`);
    prRes.rows.forEach(pr => {
      console.log(`- ID: ${pr.id} | Name: ${pr.full_name} | Aliado ID: ${pr.aliado_id} | Aliado Name: ${pr.aliado_name} | CURP: ${pr.curp} | Status: ${pr.status} | Created: ${pr.created_at}`);
    });

    // Check auth users
    try {
      const authRes = await client.query('SELECT id, email, raw_user_meta_data, email_confirmed_at FROM auth.users;');
      console.log(`\n--- AUTH USERS (${authRes.rows.length}) ---`);
      authRes.rows.forEach(u => {
        console.log(`- ID: ${u.id} | Email: ${u.email} | Metadata: ${JSON.stringify(u.raw_user_meta_data)} | Confirmed: ${u.email_confirmed_at}`);
      });
    } catch (err) {
      console.log("Could not query auth.users:", err.message);
    }

    await client.end();
    return true;
  } catch (err) {
    if (err.message.includes('tenant/user') && err.message.includes('not found')) {
      console.log(`❌ Region ${region}: Tenant not found (wrong region)`);
    } else {
      console.log(`❌ Region ${region}: Error: ${err.message}`);
    }
    try {
      await client.end();
    } catch(e) {}
    return false;
  }
}

async function run() {
  for (const region of regions) {
    const success = await testRegion(region);
    if (success) {
      console.log("\nFinished successfully.");
      break;
    }
  }
}

run().catch(console.error);
