const fs = require('fs');
const path = '/opt/wa-bot/supabase.js';
let code = fs.readFileSync(path, 'utf8');

const addition = `
// Direct Supabase client for queries
let _api = null;
async function getApi() {
  if (_api) return _api;
  try {
    const { createClient } = require('@supabase/supabase-js');
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_KEY;
    if (!url || !key) throw new Error('Missing SUPABASE_URL or SUPABASE_KEY');
    _api = createClient(url, key);
    return _api;
  } catch (e) {
    console.log('[Supabase] getApi error:', e.message);
    return null;
  }
}

module.exports = { pushOrderToSupabase, getApi };
`;

// Replace the module.exports line
if (code.includes('module.exports = { pushOrderToSupabase };')) {
  code = code.replace('module.exports = { pushOrderToSupabase };', '');
  code += addition;
  fs.writeFileSync(path, code);
  console.log('OK — added getApi to supabase.js');
} else {
  console.log('SKIP — module.exports not found');
}
