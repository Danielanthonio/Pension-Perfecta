const { Client } = require('/Users/Macbook/Pesion Perfecta 1/node_modules/pg');

const connectionString = 'postgresql://postgres.gxovfywzftiirdpcskbc:Villouta2026.@aws-1-us-east-1.pooler.supabase.com:6543/postgres';

const client = new Client({
  connectionString,
  ssl: { rejectUnauthorized: false }
});

async function run() {
  try {
    await client.connect();
    const res = await client.query('SELECT id, email, full_name, role FROM public.profiles WHERE full_name IS NULL');
    console.log('Profiles with NULL full_name:', res.rows);
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await client.end();
  }
}

run();
