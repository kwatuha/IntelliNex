#!/usr/bin/env node
/**
 * Smoke-test Advanta SMS for IntelliNex HMIS.
 *
 * Usage (from api/):
 *   node scripts/sendAdvantaTest.js balance
 *   node scripts/sendAdvantaTest.js send 0712345678 "Test message from IntelliNex"
 */
require('../config/load-env');
const {
  isAdvantaConfigured,
  sendAdvantaSms,
  getAdvantaBalance,
  summarizeAdvantaSend,
} = require('../lib/advantaSms');

async function main() {
  const [cmd, ...rest] = process.argv.slice(2);
  if (!isAdvantaConfigured()) {
    console.error('Advanta not configured. Set ADVANTA_API_KEY, ADVANTA_PARTNER_ID, ADVANTA_SHORT_CODE.');
    process.exit(1);
  }

  if (cmd === 'balance') {
    const data = await getAdvantaBalance();
    console.log(JSON.stringify(data, null, 2));
    return;
  }

  if (cmd === 'send') {
    const [mobile, ...msgParts] = rest;
    const message = msgParts.join(' ') || 'IntelliNex SMS test';
    if (!mobile) {
      console.error('Usage: node scripts/sendAdvantaTest.js send <mobile> [message]');
      process.exit(1);
    }
    const data = await sendAdvantaSms({ mobile, message });
    console.log(JSON.stringify(summarizeAdvantaSend(data), null, 2));
    return;
  }

  console.error('Usage:\n  node scripts/sendAdvantaTest.js balance\n  node scripts/sendAdvantaTest.js send <mobile> [message]');
  process.exit(1);
}

main().catch((err) => {
  console.error(err.message || err);
  if (err.advantaResponse) console.error(JSON.stringify(err.advantaResponse, null, 2));
  process.exit(1);
});
