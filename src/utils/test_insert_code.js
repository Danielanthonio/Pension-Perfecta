const { createClient } = require('@supabase/supabase-js');
const supabaseUrl = 'https://gxovfywzftiirdpcskbc.supabase.co';
const supabaseKey = 'sb_publishable_FEQYCmqZA5DN6xTfX3R_Ew_lLjcWjli';
const supabase = createClient(supabaseUrl, supabaseKey);

async function test() {
  const { data, error } = await supabase.from('invitation_codes').insert({
    code: 'AL-TEST-1234',
    created_by: null,
    is_used: false
  }).select().single();
  
  console.log("Insert data:", data);
  console.log("Insert error:", error);
}
test();
