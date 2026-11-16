// Test the offline HTML decryptor's crypto (extracted from decrypt-offline.html)
// against RFC 7914 vectors, Node's built-in scrypt, and the real backup file.
// Prints ONLY pass/fail and public addresses. Passphrase comes from stdin.
const fs = require('fs');
const vm = require('vm');
const nodeCrypto = require('crypto');

const html = fs.readFileSync(__dirname + '/backup/decrypt-offline.html', 'utf8');
const m = html.match(/<script>([\s\S]*?)<\/script>/);
if (!m) { console.error('ERROR: no <script> found in HTML'); process.exit(2); }

const sandbox = { crypto: globalThis.crypto, TextEncoder, TextDecoder, atob, console };
vm.createContext(sandbox);
vm.runInContext(m[1], sandbox);
const { scryptKey, decryptBackup } = sandbox;

async function main() {
  const hex = (b) => Buffer.from(b).toString('hex');
  let failed = 0;
  const test = (name, ok) => { console.log(`TEST ${name}: ${ok ? 'PASS' : 'FAIL'}`); if (!ok) failed++; };

  // RFC 7914 vector 1: scrypt("", "", 16, 1, 1, 64)
  try {
    const v = await scryptKey('', new Uint8Array(0), 16, 1, 1, 64);
    test('rfc7914-empty', hex(v) === '77d6576238657b203b19ca42c18a0497f16b4844e3074ae8dfdffa3fede21442fcd0069ded0948f8326a753a0fc81f17e8d3e0fb2e0d3628cf35e20c38d18906');
  } catch (e) { console.log('TEST rfc7914-empty: FAIL (' + e.message + ')'); failed++; }

  // RFC 7914 vector 2: scrypt("password", "NaCl", 1024, 8, 16, 64)
  try {
    const v = await scryptKey('password', new TextEncoder().encode('NaCl'), 1024, 8, 16, 64);
    test('rfc7914-password', hex(v) === 'fdbabe1c9d3472007856e7190d01e9fe7c6ad7cbc8237830e77376634b3731622eaf30d92e22a3886ff109279d9830dac727afb94a83ee6d8360cbdfa2cc0640');
  } catch (e) { console.log('TEST rfc7914-password: FAIL (' + e.message + ')'); failed++; }

  // Production params vs Node's scryptSync
  try {
    const salt = Buffer.from('salt');
    const v = await scryptKey('password', salt, 16384, 8, 1, 32);
    const ref = nodeCrypto.scryptSync('password', salt, 32, { N: 16384, r: 8, p: 1 });
    test('scrypt-vs-node', Buffer.from(v).equals(ref));
  } catch (e) { console.log('TEST scrypt-vs-node: FAIL (' + e.message + ')'); failed++; }

  // Real backup decrypt (passphrase from stdin, never printed)
  try {
    const passphrase = fs.readFileSync(0, 'utf8').replace(/[\r\n]+$/, '');
    const enc = JSON.parse(fs.readFileSync(__dirname + '/backup/wallet-backup-encrypted.json', 'utf8'));
    const b = await decryptBackup(enc, passphrase);
    const expected = {
      btc: 'bc1q9473rsxyha0pl8w2sjcawy6ulyumpr4xch7822',
      btc_testnet4: 'tb1qzk55m8k55e5p835y58qrlesw26z8j3ch4pkvxp',
      evm: '0xF1d949ed9B0b62508203AB0B91Bf01E73309Ad31',
      solana: 'DcvJCguHLqQE52hpDvtoLG2wBNuK82tHCWpsgySRH6rL',
      tron: 'TXPdam3wpEfcEGhmvkcpb5rRyeyTkRT46p',
    };
    const ok = Object.keys(expected).every((k) => b.addresses[k] === expected[k])
      && b.mnemonic.trim().split(/\s+/).length === 12
      && b.keys.evm.privateKey.startsWith('0x');
    test('real-backup-decrypt', ok);
    if (ok) {
      console.log('ADDRESSES (recovered by the HTML decryptor)');
      for (const [k, v] of Object.entries(b.addresses)) console.log(`${k}: ${v}`);
    }
  } catch (e) { console.log('TEST real-backup-decrypt: FAIL (' + e.message + ')'); failed++; }

  console.log(failed ? `\n${failed} TEST(S) FAILED` : '\nAll tests passed.');
  process.exit(failed ? 1 : 0);
}

main().catch((e) => { console.error('ERROR:', e.message); process.exit(1); });
