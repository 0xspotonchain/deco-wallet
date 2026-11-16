// Decrypt wallet-backup-encrypted.json offline. No dependencies, Node only.
//   node decrypt.js wallet-backup-encrypted.json            -> prints the backup (mnemonic + keys) to stdout
//   node decrypt.js wallet-backup-encrypted.json --verify    -> only checks the password and prints the public addresses
// Run this offline, in a private terminal. Never share the output.
const fs = require('fs');
const crypto = require('crypto');

function readPassword(prompt) {
  return new Promise((resolve) => {
    process.stdout.write(prompt);
    if (process.stdin.isTTY) {
      process.stdin.setRawMode(true);
      let pw = '';
      process.stdin.resume();
      process.stdin.setEncoding('utf8');
      process.stdin.on('data', (ch) => {
        if (ch === '\n' || ch === '\r') {
          process.stdin.setRawMode(false);
          process.stdin.pause();
          process.stdout.write('\n');
          resolve(pw);
        } else if (ch === '\u0003') { process.exit(1); } // Ctrl-C
        else if (ch === '\u007f' || ch === '\b') { pw = pw.slice(0, -1); }
        else { pw += ch; }
      });
    } else {
      let data = '';
      process.stdin.setEncoding('utf8');
      process.stdin.on('data', (c) => { data += c; });
      process.stdin.on('end', () => resolve(data.replace(/[\r\n]+$/, '')));
    }
  });
}

async function main() {
  const file = process.argv[2];
  const verifyOnly = process.argv.includes('--verify');
  if (!file) {
    console.error('Usage: node decrypt.js wallet-backup-encrypted.json [--verify]');
    process.exit(2);
  }
  const enc = JSON.parse(fs.readFileSync(file, 'utf8'));
  if (enc.format !== 'muse-multichain-backup-v1' || enc.cipher !== 'aes-256-gcm' || enc.kdf !== 'scrypt') {
    console.error('ERROR: unrecognized backup file format.');
    process.exit(2);
  }
  const pw = await readPassword('Backup password: ');
  if (!pw) { console.error('ERROR: empty password.'); process.exit(2); }
  let plain;
  try {
    const key = crypto.scryptSync(pw, Buffer.from(enc.salt, 'base64'), 32, enc.kdfParams);
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(enc.iv, 'base64'));
    decipher.setAuthTag(Buffer.from(enc.tag, 'base64'));
    plain = Buffer.concat([decipher.update(Buffer.from(enc.data, 'base64')), decipher.final()]);
  } catch {
    console.error('ERROR: wrong password, or the backup file is corrupted.');
    process.exit(1);
  }
  const backup = JSON.parse(plain.toString('utf8'));
  if (verifyOnly) {
    console.log('DECRYPT OK — password correct, backup intact.');
    console.log('Addresses in this backup:');
    for (const [k, v] of Object.entries(backup.addresses)) console.log(`  ${k}: ${v}`);
  } else {
    console.log(JSON.stringify(backup, null, 2));
  }
}

main().catch((e) => { console.error('ERROR:', e.message); process.exit(1); });
