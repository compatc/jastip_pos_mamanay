const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

async function main() {
  const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);
  const { error } = await sb.auth.signInWithPassword({ 
    email: process.env.SUPABASE_EMAIL, 
    password: process.env.SUPABASE_PASSWORD 
  });
  if (error) { console.log('Auth error:', error.message); return; }

  const { data } = await sb.from('customers').select('id,name,phone,created_at').ilike('name','%puput%');
  console.log('PUPUT customers:', JSON.stringify(data, null, 2));
}
main();
