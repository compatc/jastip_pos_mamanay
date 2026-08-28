const fs = require('fs');
let code = fs.readFileSync('/opt/wa-bot/index.js', 'utf8');

const oldBlock = `        } else {
          const otherNum = allNums.find(n => n !== variantNum);
          qty = otherNum ? parseInt(otherNum, 10) : 1;
        }`;

const newBlock = `        } else {
          if (variantNum) {
            const otherNum = allNums.find(n => n !== variantNum);
            qty = otherNum ? parseInt(otherNum, 10) : 1;
          }
        }`;

if (code.includes(oldBlock)) {
  code = code.replace(oldBlock, newBlock);
  fs.writeFileSync('/opt/wa-bot/index.js', code);
  console.log('FIXED - variant block now skips allNums when variantNum is empty');
} else {
  console.log('NOT FOUND - may already be fixed');
}
