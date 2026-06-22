const { Client } = require('/Users/Macbook/Pesion Perfecta 1/node_modules/pg');

const projectRef = 'gxovfywzftiirdpcskbc';
const dbPassword = 'Villouta2026.';
const regions = ['sa-east-1', 'us-east-1', 'us-east-2', 'us-west-1', 'us-west-2'];

async function testRegion(region) {
  const host = `aws-0-${region}.pooler.supabase.com`;
  // Use transaction mode port 6543 (or session mode 5432)
  const connectionString = `postgresql://postgres.${projectRef}:${dbPassword}@${host}:6543/postgres`;
  
  console.log(`Trying connection to pooler in region: ${region} (${host})...`);
  const client = new Client({
    connectionString,
    ssl: { rejectUnauthorized: false },
    connectionTimeoutMillis: 5000 // 5 seconds timeout
  });

  try {
    await client.connect();
    console.log(`SUCCESS connected to region: ${region}`);
    
    // Run diagnostics
    console.log('\n--- AUTH.USERS ---');
    const authUsersRes = await client.query(`
      SELECT id, email, raw_user_meta_data, email_confirmed_at 
      FROM auth.users 
      ORDER BY email;
    `);
    console.log(JSON.stringify(authUsersRes.rows, null, 2));

    console.log('\n--- PUBLIC.PROFILES ---');
    const profilesRes = await client.query(`
      SELECT id, full_name, email, role, is_active, account_manager_id 
      FROM public.profiles 
      ORDER BY email;
    `);
    console.log(JSON.stringify(profilesRes.rows, null, 2));

    console.log('\n--- CHECK CONSTRAINTS ON PROFILES TABLE ---');
    const constraintsRes = await client.query(`
      SELECT conname, pg_get_constraintdef(c.oid) as constraint_def
      FROM pg_constraint c
      JOIN pg_namespace n ON n.oid = c.connamespace
      WHERE conrelid = 'public.profiles'::regclass;
    `);
    console.log(JSON.stringify(constraintsRes.rows, null, 2));

    console.log('\n--- EVALUATING public.get_user_role ---');
    const rolesCheckRes = await client.query(`
      SELECT id, email, role, public.get_user_role(id) as function_role 
      FROM public.profiles;
    `);
    console.log(JSON.stringify(rolesCheckRes.rows, null, 2));

    await client.end();
    return true;
  } catch (err) {
    console.error(`FAILED connection to region ${region}:`, err.message);
    try {
      await client.end();
    } catch (e) {}
    return false;
  }
}

async function run() {
  for (const region of regions) {
    const success = await testRegion(region);
    if (success) {
      console.log('\nDiagnostics complete!');
      break;
    }
  }
}

run();
