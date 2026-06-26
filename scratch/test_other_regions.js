const { Client } = require('pg');

const regions = [
  'eu-north-1',
  'eu-central-2',
  'ap-east-1',
  'me-central-1',
  'me-south-1',
  'af-south-1',
  'us-gov-east-1',
  'us-gov-west-1'
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
    connectionTimeoutMillis: 3000
  });

  try {
    await client.connect();
    console.log(`\n🎉 SUCCESS! Connected to region: ${region}`);
    const res = await client.query('SELECT COUNT(*) FROM profiles;');
    console.log(`Profiles count: ${res.rows[0].count}`);
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
