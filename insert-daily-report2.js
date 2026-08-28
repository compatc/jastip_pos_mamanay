const fs = require('fs');
let code = fs.readFileSync('/opt/wa-bot/index.js', 'utf8');

// 1. Add require at top
const requireLine = "const { sendDailyReport } = require('./daily-report.js');";
if (!code.includes('sendDailyReport')) {
  const lines = code.split('\n');
  let lastRequireIdx = 0;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].startsWith('const ') && lines[i].includes('require(')) {
      lastRequireIdx = i;
    }
  }
  lines.splice(lastRequireIdx + 1, 0, requireLine);
  code = lines.join('\n');
  console.log('1. Added require');
}

// 2. Add cron function BEFORE startApiServer (at top level)
const cronCode = `
// Daily report cron - 22:00 WIB every day
function startDailyReportCron(sock) {
  function scheduleNext() {
    const now = new Date();
    const wib = new Date(now.getTime() + 7 * 3600000);
    const target = new Date(wib);
    target.setHours(22, 0, 0, 0);
    if (target <= wib) target.setDate(target.getDate() + 1);
    const delay = target.getTime() - wib.getTime();
    console.log('Daily report scheduled for:', target.toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' }), '(' + Math.round(delay / 60000) + ' min)');
    setTimeout(async () => {
      console.log('Sending daily report...');
      await sendDailyReport(sock);
      scheduleNext();
    }, delay);
  }
  scheduleNext();
}
`;

if (!code.includes('function startDailyReportCron')) {
  // Insert before startApiServer function
  const marker = 'function startApiServer()';
  const idx = code.indexOf(marker);
  if (idx > -1) {
    code = code.slice(0, idx) + cronCode + '\n' + code.slice(idx);
    console.log('2. Added cron function before startApiServer');
  } else {
    console.log('2. ERROR: startApiServer not found');
  }
}

// 3. Call startDailyReportCron after sockRef = sock;
if (!code.includes('startDailyReportCron(sock);')) {
  const marker = 'sockRef = sock;';
  const idx = code.indexOf(marker);
  if (idx > -1) {
    code = code.slice(0, idx + marker.length) + '\n      startDailyReportCron(sock);' + code.slice(idx + marker.length);
    console.log('3. Added cron trigger after sockRef = sock');
  } else {
    console.log('3. ERROR: sockRef = sock not found');
  }
}

fs.writeFileSync('/opt/wa-bot/index.js', code);
console.log('Done. Lines:', code.split('\n').length);
