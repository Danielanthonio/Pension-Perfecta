const { Client } = require('/Users/Macbook/Pesion Perfecta 1/node_modules/pg');

const connectionString = 'postgresql://postgres.gxovfywzftiirdpcskbc:Villouta2026.@aws-1-us-east-1.pooler.supabase.com:6543/postgres';

const client = new Client({
  connectionString,
  ssl: { rejectUnauthorized: false }
});

async function run() {
  try {
    await client.connect();
    
    // Query profiles assigned to Axel Martinez
    const res = await client.query(`
      SELECT id, email, role, full_name, account_manager_id FROM public.profiles 
      WHERE account_manager_id = '6720af82-26c8-4ea3-9cb0-3338dc3bbee0';
    `);
    console.log('Profiles assigned to Axel Martinez:');
    console.log(res.rows);

  } catch (error) {
    console.error('Error:', error);
  } finally {
    await client.end();
  }
}

run();
