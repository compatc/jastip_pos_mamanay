const res = await fetch("https://mamanay.vercel.app/api/boqris", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ amount: 1000, order_ids: ["test-debug"] })
});
const text = await res.text();
console.log("Status:", res.status);
console.log("Body:", text);
