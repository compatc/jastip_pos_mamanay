require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const sb = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY);

(async () => {
  // Try adding column via RPC if available
  const { data, error } = await sb.rpc('exec_sql', {
    query: 'ALTER TABLE products ADD COLUMN IF NOT EXISTS po_closed BOOLEAN DEFAULT FALSE'
  });
  if (error) {
    console.log('RPC not available, trying direct insert to check if column exists...');
    // Test by selecting po_closed
    const { data: test, error: testErr } = await sb.from('products').select('id, po_closed').limit(1);
    if (testErr) {
      console.log('Column po_closed does not exist. Please add it manually in Supabase Dashboard:');
      console.log('ALTER TABLE products ADD COLUMN po_closed BOOLEAN DEFAULT FALSE;');
    } else {
      console.log('Column po_closed already exists!', test);
    }
  } else {
    console.log('Migration successful:', data);
  }
})();
