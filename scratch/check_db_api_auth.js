const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

// Parse .env.local file
const envPath = path.join(__dirname, '../.env.local');
const envContent = fs.readFileSync(envPath, 'utf8');
const env = {};
envContent.split('\n').forEach(line => {
  const match = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/);
  if (match) {
    const key = match[1];
    let value = match[2] || '';
    if (value.startsWith('"') && value.endsWith('"')) {
      value = value.slice(1, -1);
    }
    env[key] = value;
  }
});

const supabaseUrl = env['NEXT_PUBLIC_SUPABASE_URL'];
const supabaseAnonKey = env['NEXT_PUBLIC_SUPABASE_ANON_KEY'];

const supabase = createClient(supabaseUrl, supabaseAnonKey);

const admins = [
  'villoutaschellr@gmail.com',
  'danielanthonio@gmail.com'
];

const passwords = [
  'Villouta2026.',
  'Villouta2026',
  'villouta2026.',
  'villouta2026'
];

async function run() {
  for (const email of admins) {
    for (const pass of passwords) {
      console.log(`Trying ${email} with password: ${pass}...`);
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password: pass
      });

      if (!error) {
        console.log(`\n🎉 SUCCESS! Logged in as ${email} (ID: ${data.user.id})`);
        
        // Let's query profiles and prospects
        const { data: profiles } = await supabase.from('profiles').select('*');
        console.log(`\n--- PROFILES (${profiles ? profiles.length : 0}) ---`);
        if (profiles) {
          profiles.forEach(p => console.log(`- ID: ${p.id} | Email: ${p.email} | Name: ${p.full_name} | Role: ${p.role}`));
        }

        const { data: prospects } = await supabase.from('prospects').select('*');
        console.log(`\n--- PROSPECTS (${prospects ? prospects.length : 0}) ---`);
        if (prospects) {
          prospects.forEach(pr => console.log(`- ID: ${pr.id} | Name: ${pr.full_name} | Aliado ID: ${pr.aliado_id} | Aliado Name: ${pr.aliado_name} | CURP: ${pr.curp} | Status: ${pr.status}`));
        }
        
        await supabase.auth.signOut();
        return;
      } else {
        console.log(`❌ Failed: ${error.message}`);
      }
    }
  }
}

run().catch(console.error);
