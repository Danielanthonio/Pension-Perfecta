const { Client } = require('/Users/Macbook/Pesion Perfecta 1/node_modules/pg');
const { createClient } = require('@supabase/supabase-js');

const connectionString = 'postgresql://postgres.gxovfywzftiirdpcskbc:Villouta2026.@aws-1-us-east-1.pooler.supabase.com:6543/postgres';
const supabaseUrl = 'https://gxovfywzftiirdpcskbc.supabase.co';
const supabaseKey = 'sb_publishable_FEQYCmqZA5DN6xTfX3R_Ew_lLjcWjli';

async function run() {
  const pgClient = new Client({
    connectionString,
    ssl: { rejectUnauthorized: false }
  });

  try {
    await pgClient.connect();
    console.log('Connected to PG.');

    // 1. Create the user in auth.users and public.profiles
    console.log('Inserting test director into auth.users and profiles...');
    await pgClient.query(`
      INSERT INTO auth.users (id, instance_id, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, is_super_admin, role, aud)
      VALUES (
        '11111111-1111-1111-1111-111111111111',
        '00000000-0000-0000-0000-000000000000',
        'test_director@pensionflow.com',
        extensions.crypt('Director.aliados2026', extensions.gen_salt('bf')),
        now(),
        '{"provider":"email","providers":["email"]}'::jsonb,
        '{"role":"admin","full_name":"Test Director"}'::jsonb,
        false,
        'authenticated',
        'authenticated'
      )
      ON CONFLICT (id) DO UPDATE SET 
        encrypted_password = extensions.crypt('Director.aliados2026', extensions.gen_salt('bf')),
        email_confirmed_at = now(),
        raw_user_meta_data = '{"role":"admin","full_name":"Test Director"}'::jsonb;
    `);

    await pgClient.query(`
      INSERT INTO public.profiles (id, full_name, email, role)
      VALUES ('11111111-1111-1111-1111-111111111111', 'Test Director', 'test_director@pensionflow.com', 'admin')
      ON CONFLICT (id) DO UPDATE SET role = 'admin', full_name = 'Test Director';
    `);

    console.log('Test director created in PG successfully!');
    await pgClient.end();

    // 2. Log in using the Supabase client
    console.log('\nLogging in via Supabase REST API as test_director@pensionflow.com...');
    const supabase = createClient(supabaseUrl, supabaseKey);
    const { data: authData, error: loginError } = await supabase.auth.signInWithPassword({
      email: 'test_director@pensionflow.com',
      password: 'Director.aliados2026'
    });

    if (loginError) {
      console.error('Login failed:', loginError);
      return;
    }

    console.log('Login successful. User ID:', authData.user.id);
    
    // 3. Query profiles and prospects
    const authSupabase = createClient(supabaseUrl, supabaseKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false
      },
      global: {
        headers: {
          Authorization: `Bearer ${authData.session.access_token}`
        }
      }
    });

    console.log('\nFetching profiles as test_director...');
    const { data: profiles, error: profilesError } = await authSupabase.from('profiles').select('*');
    if (profilesError) {
      console.error('Error fetching profiles:', profilesError);
    } else {
      console.log(`Profiles fetched: ${profiles.length}`);
    }

    console.log('\nFetching prospects as test_director...');
    const { data: prospects, error: prospectsError } = await authSupabase.from('prospects').select('*');
    if (prospectsError) {
      console.error('Error fetching prospects:', prospectsError);
    } else {
      console.log(`Prospects fetched: ${prospects.length}`);
    }

  } catch (error) {
    console.error('Error:', error);
    try {
      await pgClient.end();
    } catch (e) {}
  }
}

run();
