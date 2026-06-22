const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://gxovfywzftiirdpcskbc.supabase.co';
const supabaseKey = 'sb_publishable_FEQYCmqZA5DN6xTfX3R_Ew_lLjcWjli';

const supabase = createClient(supabaseUrl, supabaseKey);

async function run() {
  try {
    console.log('Querying Supabase REST API as ANONYMOUS...');

    // 1. Fetch profiles
    console.log('\nFetching profiles...');
    const { data: profiles, error: profilesError } = await supabase.from('profiles').select('*');
    if (profilesError) {
      console.error('Error fetching profiles:', profilesError);
    } else {
      console.log(`Profiles fetched: ${profiles.length}`);
      if (profiles.length > 0) {
        console.log('Sample profiles (first 3):', profiles.slice(0, 3).map(p => ({ email: p.email, role: p.role })));
      }
    }

    // 2. Fetch prospects
    console.log('\nFetching prospects...');
    const { data: prospects, error: prospectsError } = await supabase.from('prospects').select('*, documents(*)');
    if (prospectsError) {
      console.error('Error fetching prospects:', prospectsError);
    } else {
      console.log(`Prospects fetched: ${prospects.length}`);
    }

  } catch (error) {
    console.error('Exception:', error);
  }
}

run();
