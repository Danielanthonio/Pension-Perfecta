const { Client } = require('/Users/Macbook/Pesion Perfecta 1/node_modules/pg');

const connectionString = 'postgresql://postgres:Villouta2026.@db.gxovfywzftiirdpcskbc.supabase.co:5432/postgres';

const client = new Client({
  connectionString,
  ssl: { rejectUnauthorized: false }
});

async function run() {
  try {
    console.log('Connecting to database...');
    await client.connect();
    console.log('Connected!');

    // 1. Inspect user accounts in auth.users matching the director's email or others
    console.log('\n--- AUTH.USERS ---');
    const authUsersRes = await client.query(`
      SELECT id, email, raw_user_meta_data, email_confirmed_at 
      FROM auth.users 
      ORDER BY email;
    `);
    console.log(JSON.stringify(authUsersRes.rows, null, 2));

    // 2. Inspect profiles in public.profiles
    console.log('\n--- PUBLIC.PROFILES ---');
    const profilesRes = await client.query(`
      SELECT id, full_name, email, role, is_active, account_manager_id 
      FROM public.profiles 
      ORDER BY email;
    `);
    console.log(JSON.stringify(profilesRes.rows, null, 2));

    // 3. Check the profiles table definition and check constraints
    console.log('\n--- CHECK CONSTRAINTS ON PROFILES TABLE ---');
    const constraintsRes = await client.query(`
      SELECT conname, pg_get_constraintdef(c.oid) as constraint_def
      FROM pg_constraint c
      JOIN pg_namespace n ON n.oid = c.connamespace
      WHERE conrelid = 'public.profiles'::regclass;
    `);
    console.log(JSON.stringify(constraintsRes.rows, null, 2));

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
