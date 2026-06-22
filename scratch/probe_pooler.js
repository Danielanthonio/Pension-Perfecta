const { Client } = require('/Users/Macbook/Pesion Perfecta 1/node_modules/pg');

const projectRef = 'gxovfywzftiirdpcskbc';
const dbPassword = 'Villouta2026.';
const prefixes = ['aws-0', 'aws-1'];
const regions = [
  'sa-east-1', 'us-east-1', 'us-east-2', 'us-west-1', 'us-west-2',
  'ap-southeast-1', 'ap-northeast-1', 'ap-northeast-2', 'ap-southeast-2',
  'ap-south-1', 'eu-central-1', 'eu-west-1', 'eu-west-2', 'eu-west-3', 'ca-central-1'
];

async function probe() {
  for (const prefix of prefixes) {
    for (const region of regions) {
      const host = `${prefix}-${region}.pooler.supabase.com`;
      const connectionString = `postgresql://postgres.${projectRef}:${dbPassword}@${host}:6543/postgres`;
      
      const client = new Client({
        connectionString,
        ssl: { rejectUnauthorized: false },
        connectionTimeoutMillis: 2000
      });

      try {
        await client.connect();
        console.log(`\n========================================`);
        console.log(`FOUND WORKING CONNECTION!`);
        console.log(`Host: ${host}`);
        console.log(`Connection string: postgresql://postgres.${projectRef}:****@${host}:6543/postgres`);
        console.log(`========================================\n`);
        
        // Run check query to verify
        const res = await client.query('SELECT current_database(), current_user');
        console.log('Query result:', res.rows[0]);
        
        await client.end();
        return; // Stop after first successful connection
      } catch (err) {
        if (!err.message.includes('tenant/user postgres') && !err.message.includes('ENOTFOUND')) {
          console.log(`Host ${host} responded but error was: ${err.message}`);
        } else {
          // Silent or print prefix
          process.stdout.write('.');
        }
        try {
          await client.end();
        } catch (e) {}
      }
    }
  }
  console.log('\nDone probing. No connection succeeded.');
}

probe();
