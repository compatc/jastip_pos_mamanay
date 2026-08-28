const res = await fetch("https://api.boqris.id/api/v1/transactions/49c2e613-5875-4772-a40f-c140c726808a", {
  headers: { "Authorization": "Bearer " + process.env.BOQRIS_API_KEY }
});
const data = await res.json();
console.log("Boqris status:", JSON.stringify(data, null, 2));
