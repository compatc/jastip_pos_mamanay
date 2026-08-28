const res = await fetch("https://mamanay.vercel.app/api/pay", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ action: "status", transactionId: "49c2e613-5875-4772-a40f-c140c726808a" })
});
const data = await res.json();
console.log("Status:", JSON.stringify(data, null, 2));
