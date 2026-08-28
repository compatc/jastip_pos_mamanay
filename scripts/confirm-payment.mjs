const res = await fetch("https://mamanay.vercel.app/api/pay", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    action: "confirm",
    transactionId: "49c2e613-5875-4772-a40f-c140c726808a",
    orderIds: ["197d56b7-ec23-4a58-a291-4154b392bce8", "b2ba385d-d479-41d2-aaeb-913a7a7c1ce7"]
  })
});
const data = await res.json();
console.log("Result:", JSON.stringify(data, null, 2));
