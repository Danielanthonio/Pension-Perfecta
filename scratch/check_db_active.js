const { Client } = require('/Users/Macbook/Pesion Perfecta 1/node_modules/pg');

const connectionString = 'postgresql://postgres.gxovfywzftiirdpcskbc:Villouta2026.@aws-1-us-east-1.pooler.supabase.com:6543/postgres';

const client = new Client({
  connectionString,
  ssl: { rejectUnauthorized: false }
});

async function run() {
  try {
    console.log('Connecting to database...');
    await client.connect();
    console.log('Connected!');

    // 1. Inspect profiles in public.profiles (without is_active)
    console.log('\n--- PUBLIC.PROFILES ---');
    const profilesRes = await client.query(`
      SELECT id, full_name, email, role, account_manager_id 
      FROM public.profiles 
      ORDER BY email;
    `);
    console.log(JSON.stringify(profilesRes.rows, null, 2));

    // 2. Check the profiles table definition and check constraints
    console.log('\n--- CHECK CONSTRAINTS ON PROFILES TABLE ---');
    const constraintsRes = await client.query(`
      SELECT conname, pg_get_constraintdef(c.oid) as constraint_def
      FROM pg_constraint c
      JOIN pg_namespace n ON n.oid = c.connamespace
      WHERE conrelid = 'public.profiles'::regclass;
    `);
    console.log(JSON.stringify(constraintsRes.rows, null, 2));

    // 3. Verify RLS policies on profiles, prospects, invitation_codes
    console.log('\n--- RLS POLICIES ---');
    const policiesRes = await client.query(`
      SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check
      FROM pg_policies
      WHERE tablename IN ('profiles', 'prospects', 'documents', 'invitation_codes');
    `);
    console.log(JSON.stringify(policiesRes.rows, null, 2));

    // 4. Verify what roles are returned by the public.get_user_role function
    console.log('\n--- EVALUATING public.get_user_role ---');
    const rolesCheckRes = await client.query(`
      SELECT id, email, role, public.get_user_role(id) as function_role 
      FROM public.profiles;
    `);
    console.log(JSON.stringify(rolesCheckRes.rows, null, 2));

  } catch (error) {
    console.error('Error executing query:', error);
  } finally {
    await client.end();
    console.log('\nDatabase connection closed.');
  }
}

run();
