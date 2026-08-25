// patch_push_return.js — Make pushOrderToSupabase return data so caller can check for errors
const fs = require('fs');
const FILE = '/opt/wa-bot/supabase.js';
let code = fs.readFileSync(FILE, 'utf8');

const oldReturn = "  } catch (e) {\n    console.log('Supabase fail:', e.message);\n  }\n}";
const newReturn = "  } catch (e) {\n    console.log('Supabase fail:', e.message);\n    return { ok: false, error: e.message };\n  }\n}";

if (code.includes(oldReturn)) {
  code = code.replace(oldReturn, newReturn);
  console.log('PATCH: pushOrderToSupabase now returns error data');
} else {
  console.log('PATCH: SKIPPED (already patched or pattern not found)');
}

// Also add return data after successful response
const oldOk = "    const data = await res.json();\n    if (data.ok) {\n      console.log('Supabase ok: order', data.orderId, '| total', data.total, '| varian:', varian || '-');\n    } else {\n      console.log('Supabase fail:', data.error);\n    }";
const newOk = "    const data = await res.json();\n    if (data.ok) {\n      console.log('Supabase ok: order', data.orderId, '| total', data.total, '| varian:', varian || '-');\n    } else {\n      console.log('Supabase fail:', data.error);\n    }\n    return data;";

if (code.includes(oldOk) && !code.includes('return data;')) {
  code = code.replace(oldOk, newOk);
  console.log('PATCH: Added return data after response');
} else {
  console.log('PATCH: return data SKIPPED');
}

fs.writeFileSync(FILE, code);
console.log('Done.');
