const { Client } = require('pg');
const connectionString = 'postgresql://postgres:Villouta2026.@db.gxovfywzftiirdpcskbc.supabase.co:5432/postgres';

async function main() {
  const client = new Client({
    connectionString,
    ssl: { rejectUnauthorized: false }
  });

  try {
    await client.connect();
    console.log('Connected to DB');

    // Query profiles for axel martinez
    const res = await client.query(`
      SELECT * FROM profiles 
      WHERE email ILIKE '%axel%' OR full_name ILIKE '%axel%'
    `);
    console.log('Profiles matching axel:');
    console.log(res.rows);

    if (res.rows.length > 0) {
      const userId = res.rows[0].id;
      // Also query auth.users
      const authRes = await client.query(`
        SELECT id, email, confirmed_at, last_sign_in_at, raw_app_meta_data, raw_user_meta_data 
        FROM auth.users 
        WHERE id = $1
      `, [userId]);
      console.log('Auth user details:');
      console.log(authRes.rows);
    }
  } catch (err) {
    console.error('Error querying DB:', err);
  } finally {
    await client.end();
  }
}

main();
