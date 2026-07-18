#!/usr/bin/env node
/**
 * Publish IntelliNex Field APK into API uploads + DB.
 *
 * Usage:
 *   node api/scripts/publishFieldAppRelease.js --version 1.0.0 --apk path/to/app-release.apk
 *   node api/scripts/publishFieldAppRelease.js --version 1.0.1 --apk ... --notes "Bug fixes"
 *
 * Also accepts positional: apk version [notes...]
 * Requires DB env (same as API). Tables are created if missing.
 */
require('../config/load-env');
const path = require('path');
const { publishReleaseFromFile } = require('../lib/mobileAppRelease');

function parseArgs(argv) {
  const out = { version: '', apk: '', notes: '', help: false };
  const positional = [];
  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--version' && argv[i + 1]) {
      out.version = argv[++i];
    } else if (arg === '--apk' && argv[i + 1]) {
      out.apk = argv[++i];
    } else if ((arg === '--notes' || arg === '--release-notes') && argv[i + 1]) {
      out.notes = argv[++i];
    } else if (arg === '--help' || arg === '-h') {
      out.help = true;
    } else if (!arg.startsWith('--')) {
      positional.push(arg);
    }
  }
  if (!out.apk && positional[0]) out.apk = positional[0];
  if (!out.version && positional[1]) out.version = positional[1];
  if (!out.notes && positional.length > 2) out.notes = positional.slice(2).join(' ');
  return out;
}

async function main() {
  const args = parseArgs(process.argv);
  if (args.help || !args.version || !args.apk) {
    console.log(
      'Usage: node api/scripts/publishFieldAppRelease.js --version 1.0.0 --apk path/to/app-release.apk [--notes "What\'s new"]'
    );
    process.exit(args.help ? 0 : 1);
  }

  const release = await publishReleaseFromFile({
    sourceApkPath: path.resolve(args.apk),
    version: args.version,
    releaseNotes: args.notes || null,
    originalFileName: `intellinex-field-${args.version}.apk`,
  });
  console.log(JSON.stringify({ ok: true, release }, null, 2));
}

main().catch((err) => {
  console.error('Publish failed:', err.message || err);
  process.exit(1);
});
