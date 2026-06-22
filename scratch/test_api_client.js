const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://gxovfywzftiirdpcskbc.supabase.co';
const supabaseKey = 'sb_publishable_FEQYCmqZA5DN6xTfX3R_Ew_lLjcWjli';

const supabase = createClient(supabaseUrl, supabaseKey);

async function run() {
  try {
    console.log('Logging in as Account Manager...');
    const { data: authData, error: loginError } = await supabase.auth.signInWithPassword({
      email: 'axelmartinezflores64@gmail.com',
      password: 'Mipass.2026'
    });

    if (loginError) {
      console.error('Login failed:', loginError);
      return;
    }

    console.log('Login successful. User ID:', authData.user.id);
    
    // Now instantiate a client authenticated with the user's token
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

    // 1. Fetch profiles
    console.log('\nFetching profiles...');
    const { data: profiles, error: profilesError } = await authSupabase.from('profiles').select('*');
    if (profilesError) {
      console.error('Error fetching profiles:', profilesError);
    } else {
      console.log(`Profiles fetched: ${profiles.length}`);
      if (profiles.length > 0) {
        console.log('Sample profiles:', profiles.slice(0, 3).map(p => ({ email: p.email, role: p.role })));
      }
    }

    // 2. Fetch prospects
    console.log('\nFetching prospects...');
    const { data: prospects, error: prospectsError } = await authSupabase.from('prospects').select('*, documents(*)');
    if (prospectsError) {
      console.error('Error fetching prospects:', prospectsError);
    } else {
      console.log(`Prospects fetched: ${prospects.length}`);
      if (prospects.length > 0) {
        console.log('Sample prospects:', prospects.slice(0, 3).map(p => ({ name: p.full_name, status: p.status })));
      }
    }

  } catch (error) {
    console.error('Exception:', error);
  }
}

run();
