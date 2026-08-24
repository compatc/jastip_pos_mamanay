const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();
const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY);

const MERGE_MAP = {
  'ayyas mamagege': {
    keep: 'c0000001-0000-4000-8000-000000000005',
    remove: '368870e7-13ea-49c5-845b-327e31ba9eeb'
  },
  'riin 7346': {
    keep: 'f1023dd5-a0c7-4506-901b-3927acfac882',
    remove: '65e37939-cc79-444c-8e64-579139c3c8e5'
  }
};

(async () => {
  for (const [name, { keep, remove }] of Object.entries(MERGE_MAP)) {
    console.log(`Merging "${name}": keeping ${keep}, removing ${remove}`);
    
    // Move orders from removed to kept
    const { data: movedOrders, error: moveErr } = await supabase
      .from('orders')
      .update({ customer_id: keep })
      .eq('customer_id', remove)
      .select('id');
    console.log(`  Orders moved: ${movedOrders?.length || 0}`, moveErr ? moveErr.message : '');
    
    // Update total_spent and points on kept
    const { data: keptCust } = await supabase.from('customers').select('total_spent, points').eq('id', keep).single();
    const { data: removedCust } = await supabase.from('customers').select('total_spent, points').eq('id', remove).single();
    if (keptCust && removedCust) {
      await supabase.from('customers').update({
        total_spent: (keptCust.total_spent || 0) + (removedCust.total_spent || 0),
        points: (keptCust.points || 0) + (removedCust.points || 0),
      }).eq('id', keep);
      console.log(`  Points merged: +${removedCust.points || 0}`);
    }
    
    // Delete removed customer
    const { error: delErr } = await supabase.from('customers').delete().eq('id', remove);
    console.log(`  Deleted: ${delErr ? delErr.message : 'ok'}`);
  }
  console.log('Done!');
})();
