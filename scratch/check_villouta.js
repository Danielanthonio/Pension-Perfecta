const { Client } = require('/Users/Macbook/Pesion Perfecta 1/node_modules/pg');

const connectionString = 'postgresql://postgres.gxovfywzftiirdpcskbc:Villouta2026.@aws-1-us-east-1.pooler.supabase.com:6543/postgres';

const client = new Client({
  connectionString,
  ssl: { rejectUnauthorized: false }
});

async function run() {
  try {
    await client.connect();
    
    const users = await client.query(`
      SELECT id, email, raw_user_meta_data FROM auth.users 
      WHERE email LIKE '%villouta%' OR email LIKE '%raul%';
    `);
    console.log('Auth users matching "villouta" or "raul":', users.rows);

    const profiles = await client.query(`
      SELECT id, email, role, full_name FROM public.profiles 
      WHERE email LIKE '%villouta%' OR email LIKE '%raul%';
    `);
    console.log('Profiles matching "villouta" or "raul":', profiles.rows);

  } catch (error) {
    console.error('Error:', error);
  } finally {
    await client.end();
  }
}

run();
