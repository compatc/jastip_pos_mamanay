/* Migrate remaining Supabase Storage image URLs → Cloudflare R2.
   Dry-run by default; run with --apply to execute.
   Usage: node migrate_storage_to_r2.cjs [--apply] */
const { createClient } = require('@supabase/supabase-js');
const { createHmac, createHash, randomUUID } = require('crypto');

const APPLY = process.argv.includes('--apply');

const SUPA_URL = process.env.SUPABASE_URL || 'https://tmnykmpdqdavspmirspw.supabase.co';
const SUPA_KEY = process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_KEY || 'sb_publishable_9WsIm6VwCi3ZtKPpQW4dqA_L9BA7vpF';
const sb = createClient(SUPA_URL, SUPA_KEY);

const R2_ACCOUNT_ID = '3ba62fa119ee4f295a5655776bfdb386';
const R2_ACCESS_KEY = 'c48ccbe4d8ccd5f902cf9b9746807ecb';
const R2_SECRET_KEY = '7e5edf36506903caa3f7efcf179217d8adba3f8d841fee1c6c6ca211f0122911';
const R2_BUCKET = 'mamanay-images';
const R2_PUBLIC = 'https://pub-383108e3bad04ba994957fa1155847a8.r2.dev';

function extFromUrl(url, contentType) {
  const m = url.match(/\.([a-zA-Z0-9]{2,4})(\?|$)/);
  if (m) return m[1].toLowerCase();
  if (contentType === 'image/png') return 'png';
  if (contentType === 'image/webp') return 'webp';
  return 'jpg';
}

async function putToR2(r2Key, bodyBuf, contentType) {
  const payloadHash = createHash('sha256').update(bodyBuf).digest('hex');
  const now = new Date();
  const amzDate = now.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  const dateStamp = amzDate.slice(0, 8);
  const canonicalRequest = `PUT\n/${R2_BUCKET}/${r2Key}\n\ncontent-type:${contentType}\nhost:${R2_ACCOUNT_ID}.r2.cloudflarestorage.com\nx-amz-content-sha256:${payloadHash}\nx-amz-date:${amzDate}\n\ncontent-type;host;x-amz-content-sha256;x-amz-date\n${payloadHash}`;
  const crHash = createHash('sha256').update(canonicalRequest).digest('hex');
  const stringToSign = `AWS4-HMAC-SHA256\n${amzDate}\n${dateStamp}/auto/s3/aws4_request\n${crHash}`;
  const hmac = (k, d) => createHmac('sha256', k).update(d).digest();
  const kDate = hmac(`AWS4${R2_SECRET_KEY}`, dateStamp);
  const kRegion = hmac(kDate, 'auto');
  const kService = hmac(kRegion, 's3');
  const kSigning = hmac(kService, 'aws4_request');
  const signature = hmac(kSigning, stringToSign).toString('hex');
  const auth = `AWS4-HMAC-SHA256 Credential=${R2_ACCESS_KEY}/${dateStamp}/auto/s3/aws4_request, SignedHeaders=content-type;host;x-amz-content-sha256;x-amz-date, Signature=${signature}`;
  const res = await fetch(`https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com/${R2_BUCKET}/${r2Key}`, {
    method: 'PUT',
    headers: {
      Authorization: auth,
      'Content-Type': contentType,
      'x-amz-content-sha256': payloadHash,
      'x-amz-date': amzDate,
    },
    body: bodyBuf,
  });
  if (!res.ok) throw new Error(`R2 ${res.status}: ${(await res.text()).slice(0, 200)}`);
  return `${R2_PUBLIC}/${r2Key}`;
}

async function migrateOne(oldUrl, folder) {
  const dl = await fetch(oldUrl);
  if (!dl.ok) throw new Error(`download ${dl.status}`);
  const contentType = dl.headers.get('content-type') || 'image/jpeg';
  const buf = Buffer.from(await dl.arrayBuffer());
  if (buf.length === 0) throw new Error('empty file');
  if (buf.length > 4 * 1024 * 1024) throw new Error(`too large ${buf.length}`);
  const ext = extFromUrl(oldUrl, contentType);
  const key = `${folder}/${Date.now()}-${randomUUID().slice(0, 8)}.${ext}`;
  const newUrl = await putToR2(key, buf, contentType);
  return { newUrl, size: buf.length };
}

(async () => {
  let ok = 0, fail = 0, skip = 0;

  // 1) products.image
  const { data: prods } = await sb.from('products').select('id,name,image').ilike('image', '%supabase.co/storage%');
  console.log(`products.image supabase: ${(prods || []).length}`);
  for (const p of prods || []) {
    if (!APPLY) { console.log(`  DRY ${p.name}`); skip++; continue; }
    try {
      const { newUrl, size } = await migrateOne(p.image, 'products');
      const { error } = await sb.from('products').update({ image: newUrl }).eq('id', p.id);
      if (error) throw new Error(error.message);
      console.log(`  OK ${p.name} (${size}B)`);
      ok++;
    } catch (e) {
      console.log(`  FAIL ${p.name}: ${e.message}`);
      fail++;
    }
  }

  // 2) products.images[] array entries
  const { data: allProds } = await sb.from('products').select('id,name,images').not('images', 'is', null);
  let arrCount = 0;
  for (const p of allProds || []) {
    const imgs = Array.isArray(p.images) ? p.images : [];
    const supaImgs = imgs.filter(u => typeof u === 'string' && u.includes('supabase.co/storage'));
    if (supaImgs.length === 0) continue;
    arrCount += supaImgs.length;
    if (!APPLY) { console.log(`  DRY images[] ${p.name}: ${supaImgs.length}`); skip += supaImgs.length; continue; }
    try {
      const newImgs = [];
      for (const u of imgs) {
        if (typeof u === 'string' && u.includes('supabase.co/storage')) {
          const { newUrl } = await migrateOne(u, 'products');
          newImgs.push(newUrl);
        } else newImgs.push(u);
      }
      const { error } = await sb.from('products').update({ images: newImgs }).eq('id', p.id);
      if (error) throw new Error(error.message);
      console.log(`  OK images[] ${p.name}: ${supaImgs.length}`);
      ok += supaImgs.length;
    } catch (e) {
      console.log(`  FAIL images[] ${p.name}: ${e.message}`);
      fail += supaImgs.length;
    }
  }
  console.log(`products.images[] supabase entries: ${arrCount}`);

  // 3) product_variants.image
  const { data: vars } = await sb.from('product_variants').select('id,name,product_id,image').ilike('image', '%supabase.co/storage%');
  console.log(`product_variants.image supabase: ${(vars || []).length}`);
  for (const v of vars || []) {
    if (!APPLY) { console.log(`  DRY variant ${v.name}`); skip++; continue; }
    try {
      const { newUrl, size } = await migrateOne(v.image, 'variants');
      const { error } = await sb.from('product_variants').update({ image: newUrl }).eq('id', v.id);
      if (error) throw new Error(error.message);
      console.log(`  OK variant ${v.name} (${size}B)`);
      ok++;
    } catch (e) {
      console.log(`  FAIL variant ${v.name}: ${e.message}`);
      fail++;
    }
  }

  console.log(`DONE ${APPLY ? 'APPLY' : 'DRY'}: ok=${ok} fail=${fail} dry=${skip}`);
})();
