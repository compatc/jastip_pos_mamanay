// Run inside the bot's env
require('dotenv').config({ path: '/opt/wa-bot/.env' });
const { createClient } = require('/opt/wa-bot/node_modules/@supabase/supabase-js');

async function test() {
  const api = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY || process.env.SUPABASE_ANON_KEY);
  await api.auth.signInWithPassword({ email: process.env.SUPABASE_EMAIL, password: process.env.SUPABASE_PASSWORD });
  
  const nama = 'sprei motif premium size 180';
  const cleanName = nama.replace(/\[.*?\]|\b(ready|readyh|po)\b/gi, '').replace(/\s+/g, ' ').trim();
  
  console.log('Testing or() filter with spaces...');
  const { data, error } = await api.from('order_items')
    .select('product_name, variant, quantity, order_id')
    .or(`product_name.eq.${nama},product_name.ilike.%${cleanName}%`);
  
  if (error) console.log('ERROR:', error.message, JSON.stringify(error));
  else console.log('Found', data.length, 'items');
  (data||[]).forEach(i => console.log(' ', i.product_name, '|', i.variant, '|', i.quantity));
}

test().catch(e => console.error('FATAL:', e.message));
