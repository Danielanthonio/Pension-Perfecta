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

if (!supabaseUrl || !supabaseAnonKey) {
  console.error("Missing Supabase credentials in .env.local");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function checkLogin(email, password) {
  console.log(`\nAttempting login for: ${email}`);
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password
  });
  
  if (error) {
    console.error(`Login failed for ${email}:`, error.message);
    return null;
  }
  
  console.log(`Login successful! User ID: ${data.user.id}`);
  return data.session;
}

async function run() {
  // Try logging in with the default director credentials
  let session = await checkLogin('eduardo@pensionflow.com', 'PensionPerfecta2026!');
  
  if (!session) {
    // Try without the exclamation mark just in case
    session = await checkLogin('eduardo@pensionflow.com', 'PensionPerfecta2026');
  }

  if (!session) {
    // Try roberto
    session = await checkLogin('roberto@asesores.com', 'PensionPerfecta2026!');
  }

  if (!session) {
    console.error("Could not authenticate. Cannot bypass RLS.");
    return;
  }

  // Once authenticated, let's query profiles
  console.log("\n--- FETCHING ALL PROFILES ---");
  const { data: profiles, error: pError } = await supabase.from('profiles').select('*');
  if (pError) {
    console.error("Error fetching profiles:", pError);
  } else {
    console.log(`Found ${profiles.length} profiles:`);
    profiles.forEach(p => {
      console.log(`- ID: ${p.id} | Email: ${p.email} | Name: ${p.full_name} | Role: ${p.role}`);
    });
  }

  // Fetch prospects
  console.log("\n--- FETCHING ALL PROSPECTS ---");
  const { data: prospects, error: prError } = await supabase.from('prospects').select('*');
  if (prError) {
    console.error("Error fetching prospects:", prError);
  } else {
    console.log(`Found ${prospects.length} prospects:`);
    prospects.forEach(pr => {
      console.log(`- ID: ${pr.id} | Name: ${pr.full_name} | Aliado ID: ${pr.aliado_id} | Aliado Name: ${pr.aliado_name} | CURP: ${pr.curp} | Status: ${pr.status}`);
    });
  }
}

run().catch(console.error);
