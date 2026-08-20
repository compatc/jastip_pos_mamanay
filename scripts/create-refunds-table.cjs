const { createClient } = require('@supabase/supabase-js');

const url = process.env.VITE_SUPABASE_URL;
const key = process.env.VITE_SUPABASE_ANON_KEY;
const email = process.env.SUPABASE_EMAIL;
const password = process.env.SUPABASE_PASSWORD;

if (!url || !key || !email || !password) {
  console.error('Missing env vars: VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY, SUPABASE_EMAIL, SUPABASE_PASSWORD');
  process.exit(1);
}

const sb = createClient(url, key);

(async () => {
  const { data: auth } = await sb.auth.signInWithPassword({ email, password });
  const token = auth.session.access_token;

  // Check if refunds table exists
  const r1 = await sb.from('refunds').select('id').limit(1);
  console.log('refunds table:', r1.error ? 'MISSING - ' + r1.error.message : 'EXISTS');
})();
