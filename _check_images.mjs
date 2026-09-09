import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  "https://tmnykmpdqdavspmirspw.supabase.co",
  "sb_publishable_9WsIm6VwCi3ZtKPpQW4dqA_L9BA7vpF"
);

// Check all image URLs in products
const { data: products } = await supabase
  .from("products")
  .select("id, name, image")
  .order("name");

let supabaseUrls = 0;
let r2Urls = 0;
let otherUrls = 0;

for (const p of products || []) {
  if (p.image) {
    if (p.image.includes("supabase.co/storage")) {
      supabaseUrls++;
      console.log(`SUPABASE: ${p.name} → ${p.image}`);
    } else if (p.image.includes("r2.dev")) {
      r2Urls++;
    } else {
      otherUrls++;
      console.log(`OTHER: ${p.name} → ${p.image}`);
    }
  }
}

console.log(`\n--- Summary ---`);
console.log(`Supabase Storage URLs: ${supabaseUrls}`);
console.log(`R2 URLs: ${r2Urls}`);
console.log(`Other URLs: ${otherUrls}`);
