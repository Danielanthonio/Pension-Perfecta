const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://gxovfywzftiirdpcskbc.supabase.co';
const supabaseAnonKey = 'sb_publishable_FEQYCmqZA5DN6xTfX3R_Ew_lLjcWjli';

const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function run() {
  try {
    console.log('Attempting to sign in Axel Martinez...');
    const { data, error } = await supabase.auth.signInWithPassword({
      email: 'axelmartinezflores64@gmail.com',
      password: 'Mipass.2026'
    });

    if (error) {
      console.error('Sign in error:', error);
    } else {
      console.log('Sign in success! User:', data.user);
      console.log('Session:', data.session ? 'Active' : 'None');
    }
  } catch (err) {
    console.error('Catch error:', err);
  }
}

run();
