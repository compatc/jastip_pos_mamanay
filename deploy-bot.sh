#!/bin/bash
# Deploy bot - jalankan di server
set -e

BOT_DIR="/opt/wa-bot"
cd "$BOT_DIR"

echo "=== Downloading index_backup.js from GitHub ==="
curl -sL "https://raw.githubusercontent.com/compatc/jastip_pos_mamanay/main/index_backup.js" -o index.js

echo "=== Restarting bot ==="
pm2 restart wa-bot

echo "=== Waiting 3s for bot to start ==="
sleep 3

echo "=== Rebuilding promoStocks from DB ==="
curl -s http://localhost:3001/api/rebuild-stocks | python3 -m json.tool 2>/dev/null || curl -s http://localhost:3001/api/rebuild-stocks

echo ""
echo "=== Deploy selesai! ==="