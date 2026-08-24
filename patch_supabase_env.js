const fs = require('fs');
const path = '/opt/wa-bot/supabase.js';
let code = fs.readFileSync(path, 'utf8');

// Fix: also check SUPABASE_ANON_KEY
const old = `const key = process.env.SUPABASE_KEY;`;
const rep = `const key = process.env.SUPABASE_KEY || process.env.SUPABASE_ANON_KEY;`;

if (code.includes(old)) {
  code = code.replace(old, rep);
  fs.writeFileSync(path, code);
  console.log('OK — fixed SUPABASE_KEY fallback');
} else {
  console.log('SKIP — SUPABASE_KEY not found');
}
