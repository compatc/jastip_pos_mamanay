import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://tmnykmpdqdavspmirspw.supabase.co';
const SUPABASE_KEY = 'sb_publishable_9WsIm6VwCi3ZtKPpQW4dqA_L9BA7vpF';

export function getSb() {
  return createClient(SUPABASE_URL, SUPABASE_KEY);
}

export async function logAudit(supabase, { orderId, action, oldPaidTotal, newPaidTotal, oldPaymentStatus, newPaymentStatus, oldFulfillmentStatus, newFulfillmentStatus, performedBy = 'system' }) {
  const { error } = await supabase.from('order_audit_log').insert({
    order_id: orderId,
    action,
    old_paid_total: oldPaidTotal ?? null,
    new_paid_total: newPaidTotal ?? null,
    old_payment_status: oldPaymentStatus ?? null,
    new_payment_status: newPaymentStatus ?? null,
    old_fulfillment_status: oldFulfillmentStatus ?? null,
    new_fulfillment_status: newFulfillmentStatus ?? null,
    performed_by: performedBy
  });
  if (error) console.error('[AUDIT] log error:', error.message);
}
