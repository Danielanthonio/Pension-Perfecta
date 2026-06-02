const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://gxovfywzftiirdpcskbc.supabase.co';
const supabaseKey = 'sb_publishable_FEQYCmqZA5DN6xTfX3R_Ew_lLjcWjli';

const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
  }
});

async function testCreate() {
  console.log("--- Testing Auth SignUp ---");
  const randomEmail = `testuser_${Math.floor(Math.random() * 100000)}@gmail.com`;
  const password = "PensionPerfecta2026!";
  
  console.log("Attempting to sign up email:", randomEmail);
  const { data, error } = await supabase.auth.signUp({
    email: randomEmail,
    password: password
  });

  console.log("data:", JSON.stringify(data, null, 2));
  console.log("error:", error);

  if (error) {
    console.error("SignUp Error:", error);
    return;
  }

  
  if (!data || !data.user) {
    console.log("No user object returned from signUp.");
    return;
  }

  // Try to insert profile
  console.log("\nAttempting to insert profile into profiles table...");
  const { data: profile, error: pError } = await supabase
    .from('profiles')
    .insert({
      id: data.user.id,
      full_name: "Test User From Script",
      email: randomEmail,
      phone: "+52 5500000000",
      role: "aliado"
    })
    .select()
    .single();

  console.log("Profile Insert Result:", profile);
  console.log("Profile Insert Error:", pError);
}

testCreate();
