const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://gxovfywzftiirdpcskbc.supabase.co';
const supabaseKey = 'sb_publishable_FEQYCmqZA5DN6xTfX3R_Ew_lLjcWjli';

const supabase = createClient(supabaseUrl, supabaseKey);

async function test() {
  console.log("--- Supabase DB Check ---");
  console.log("URL:", supabaseUrl);
  
  const { data: profiles, error: pError } = await supabase.from('profiles').select('*');
  console.log("\nProfiles:", profiles);
  console.log("Profiles Error:", pError);

  const { data: codes, error: cError } = await supabase.from('invitation_codes').select('*');
  console.log("\nInvitation Codes:", codes);
  console.log("Invitation Codes Error:", cError);
}

test();
