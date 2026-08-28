const res = await fetch("https://mamanay.vercel.app/api/pay", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    event: "payment.success",
    data: {
      transaction_id: "qg-test-debug",
      invoice_no: "qg-test-debug",
      amount: 100000,
      status: "paid"
    }
  })
});
const text = await res.text();
console.log("Status:", res.status);
console.log("Body:", text);
