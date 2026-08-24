require('dotenv').config();
console.log('SUPABASE_URL:', process.env.SUPABASE_URL ? 'SET' : 'MISSING');
console.log('SUPABASE_KEY:', process.env.SUPABASE_KEY ? 'SET' : 'MISSING');
console.log('SUPABASE_ANON_KEY:', process.env.SUPABASE_ANON_KEY ? 'SET' : 'MISSING');
