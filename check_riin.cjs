require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const s = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);
(async () => {
  const { data } = await s.from('customers').select('id,name,phone').order('name');
  const riin = data.filter(c => c.name && c.name.toLowerCase().includes('riin'));
  console.log(JSON.stringify(riin, null, 2));
})();
