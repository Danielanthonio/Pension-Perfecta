const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://gxovfywzftiirdpcskbc.supabase.co';
const supabaseKey = 'sb_publishable_FEQYCmqZA5DN6xTfX3R_Ew_lLjcWjli';

const supabase = createClient(supabaseUrl, supabaseKey);

async function checkAll() {
  console.log("--- Supabase Thorough Check ---");
  
  const tables = ['profiles', 'prospects', 'documents', 'invitation_codes', 'notifications'];
  for (const table of tables) {
    const { data, error } = await supabase.from(table).select('*');
    console.log(`\nTable [${table}]:`);
    if (error) {
      console.error(`Error fetching ${table}:`, error);
    } else {
      console.log(`Count: ${data.length}`);
      console.log(`Data:`, JSON.stringify(data, null, 2));
    }
  }
}

checkAll();
