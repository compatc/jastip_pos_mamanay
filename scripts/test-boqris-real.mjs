const res = await fetch("https://mamanay.vercel.app/api/boqris", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    amount: 234000,
    invoice_no: "197d56b7-ec23-4a58-a291-4154b392bce8,b2ba385d-d479-41d2-aaeb-913a7a7c1ce7",
    order_ids: ["197d56b7-ec23-4a58-a291-4154b392bce8", "b2ba385d-d479-41d2-aaeb-913a7a7c1ce7"],
    unique_amount: 1
  })
});
const text = await res.text();
console.log("Status:", res.status);
console.log("Body:", text);
