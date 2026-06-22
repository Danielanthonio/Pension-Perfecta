const { Client } = require('/Users/Macbook/Pesion Perfecta 1/node_modules/pg');

const connectionString = 'postgresql://postgres.gxovfywzftiirdpcskbc:Villouta2026.@aws-1-us-east-1.pooler.supabase.com:6543/postgres';

const client = new Client({
  connectionString,
  ssl: { rejectUnauthorized: false }
});

async function run() {
  try {
    await client.connect();
    console.log('Connected to database as postgres.');

    console.log(`\n========================================`);
    console.log(`SIMULATING RLS FOR ANONYMOUS USER (anon)`);
    console.log(`========================================`);
    
    try {
      await client.query('BEGIN');
      
      // Set the role to 'anon' and claims to empty
      await client.query(`SET LOCAL role = 'anon'`);
      await client.query(`SELECT set_config('request.jwt.claims', $1, true)`, [
        JSON.stringify({
          sub: null,
          role: 'anon',
          email: null
        })
      ]);

      // Try querying profiles
      console.log('Querying public.profiles...');
      try {
        const profiles = await client.query('SELECT id, email, role, full_name FROM public.profiles');
        console.log(`Profiles found: ${profiles.rows.length}`);
      } catch (err) {
        console.error('Error querying profiles:', err.message);
      }

      // Try querying prospects
      console.log('Querying public.prospects...');
      try {
        const prospects = await client.query('SELECT id, full_name, aliado_id, status FROM public.prospects');
        console.log(`Prospects found: ${prospects.rows.length}`);
      } catch (err) {
        console.error('Error querying prospects:', err.message);
      }

      // Try querying invitation_codes
      console.log('Querying public.invitation_codes...');
      try {
        const codes = await client.query('SELECT id, code, is_used FROM public.invitation_codes');
        console.log(`Invitation codes found: ${codes.rows.length}`);
      } catch (err) {
        console.error('Error querying invitation_codes:', err.message);
      }

      await client.query('ROLLBACK');
    } catch (err) {
      console.error('Transaction error:', err);
      try {
        await client.query('ROLLBACK');
      } catch (e) {}
    }

  } catch (error) {
    console.error('General error:', error);
  } finally {
    await client.end();
  }
}

run();
