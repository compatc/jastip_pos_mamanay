const payload = JSON.stringify({
  action: "confirm",
  transactionId: "qg-279283da38374a92b17086",
  orderIds: [
    "197d56b7-ec23-4a58-a291-4154b392bce8",
    "b2ba385d-d479-41d2-aaeb-913a7a7c1ce7"
  ]
});

fetch("https://mamanay.vercel.app/api/pay", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: payload
}).then(r => r.json()).then(d => console.log(JSON.stringify(d, null, 2))).catch(e => console.error(e));
