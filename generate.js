// Generate the real multichain burner wallet.
// Reads the user's backup passphrase from STDIN (never from argv, never logged).
// Prints ONLY public addresses and PASS/FAIL test results. Never prints the
// mnemonic, any private key, or the passphrase. Run once; refuses to overwrite
// an existing keystore/backup.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const bip39 = require('bip39');
const { BIP32Factory } = require('bip32');
const ecc = require('tiny-secp256k1');
const bitcoin = require('bitcoinjs-lib');
const { ethers } = require('ethers');
const nacl = require('tweetnacl');
const { encode: bs58encode } = require('bs58').default;
const { derivePath } = require('ed25519-hd-key');

const bip32 = BIP32Factory(ecc);
const HOME = process.env.HOME;
const DIR = __dirname;
const BACKUP_DIR = path.join(DIR, 'backup');
const KEYSTORE_PATH = path.join(DIR, 'keystore.enc.json');
const VM_KEY_DIR = path.join(HOME, '.config', 'multichain-wallet');
const VM_KEY_PATH = path.join(VM_KEY_DIR, 'vm-key');
const BACKUP_PATH = path.join(BACKUP_DIR, 'wallet-backup-encrypted.json');
const EVM_KEYSTORE_PATH = path.join(BACKUP_DIR, 'evm-keystore-v3.json');
const ADDRESSES_PATH = path.join(BACKUP_DIR, 'addresses.txt');

function b64(b) { return Buffer.from(b).toString('base64'); }
function sha256(b) { return crypto.createHash('sha256').update(b).digest(); }

function wifEncode(privkey, versionByte) {
  const payload = Buffer.concat([Buffer.from([versionByte]), Buffer.from(privkey), Buffer.from([0x01])]);
  const checksum = sha256(sha256(payload)).subarray(0, 4);
  return bs58encode(Buffer.concat([payload, checksum]));
}

function tronAddressFromPubkeyCompressed(compressedPubkey) {
  const uncompressed = Buffer.from(ecc.pointCompress(Buffer.from(compressedPubkey), false));
  const hash = ethers.keccak256(uncompressed.subarray(1));
  const payload = Buffer.concat([Buffer.from([0x41]), Buffer.from(hash.slice(2), 'hex').subarray(12)]);
  const checksum = sha256(sha256(payload)).subarray(0, 4);
  return bs58encode(Buffer.concat([payload, checksum]));
}

function encryptAesGcm(plaintextBuf, keyBuf) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', keyBuf, iv);
  const data = Buffer.concat([cipher.update(plaintextBuf), cipher.final()]);
  return { iv: b64(iv), tag: b64(cipher.getAuthTag()), data: b64(data) };
}

function decryptAesGcm(enc, keyBuf) {
  const decipher = crypto.createDecipheriv('aes-256-gcm', keyBuf, Buffer.from(enc.iv, 'base64'));
  decipher.setAuthTag(Buffer.from(enc.tag, 'base64'));
  return Buffer.concat([decipher.update(Buffer.from(enc.data, 'base64')), decipher.final()]);
}

function writeNewFile(filePath, content, mode) {
  fs.writeFileSync(filePath, content, { mode, flag: 'wx' }); // fail if exists
}

async function main() {
  const passphrase = fs.readFileSync(0, 'utf8').replace(/[\r\n]+$/, '');
  if (!passphrase || passphrase.length < 8) {
    console.error('ERROR: backup passphrase from stdin is empty or too short (min 8 chars).');
    process.exit(2);
  }
  if (fs.existsSync(KEYSTORE_PATH) || fs.existsSync(BACKUP_PATH)) {
    console.error('ERROR: keystore or backup already exists. Refusing to overwrite an existing wallet.');
    process.exit(3);
  }

  // 1. Generate mnemonic + seed (12 words, 128-bit entropy, standard BIP39).
  const mnemonic = bip39.generateMnemonic(128);
  const seed = bip39.mnemonicToSeedSync(mnemonic);
  const root = bip32.fromSeed(seed);

  // 2. Derive all chains (same code paths verified by test-vectors.js).
  const btcNode = root.derivePath("m/84'/0'/0'/0/0");
  const btcAddr = bitcoin.payments.p2wpkh({ pubkey: Buffer.from(btcNode.publicKey), network: bitcoin.networks.bitcoin }).address;

  const btcTNode = root.derivePath("m/84'/1'/0'/0/0");
  const btcTAddr = bitcoin.payments.p2wpkh({ pubkey: Buffer.from(btcTNode.publicKey), network: bitcoin.networks.testnet }).address;

  const evmNode = root.derivePath("m/44'/60'/0'/0/0");
  const evmWallet = new ethers.Wallet('0x' + Buffer.from(evmNode.privateKey).toString('hex'));

  const solDerived = derivePath("m/44'/501'/0'/0'", seed.toString('hex'));
  const solKeypair = nacl.sign.keyPair.fromSeed(solDerived.key);
  const solAddr = bs58encode(solKeypair.publicKey);

  const tronNode = root.derivePath("m/44'/195'/0'/0/0");
  const tronAddr = tronAddressFromPubkeyCompressed(tronNode.publicKey);

  const addresses = {
    btc: btcAddr,
    btc_testnet4: btcTAddr,
    evm: evmWallet.address,
    solana: solAddr,
    tron: tronAddr,
  };

  const payload = {
    format: 'muse-multichain-backup-v1',
    created: new Date().toISOString(),
    mnemonic,
    addresses,
    keys: {
      btc: { path: "m/84'/0'/0'/0/0", privateKeyWIF: wifEncode(btcNode.privateKey, 0x80), privateKeyHex: Buffer.from(btcNode.privateKey).toString('hex') },
      btc_testnet4: { path: "m/84'/1'/0'/0/0", privateKeyWIF: wifEncode(btcTNode.privateKey, 0xef), privateKeyHex: Buffer.from(btcTNode.privateKey).toString('hex') },
      evm: { path: "m/44'/60'/0'/0/0", privateKey: '0x' + Buffer.from(evmNode.privateKey).toString('hex') },
      solana: { path: "m/44'/501'/0'/0'", privateKeyBase58: bs58encode(solKeypair.secretKey), seedHex: Buffer.from(solDerived.key).toString('hex') },
      tron: { path: "m/44'/195'/0'/0/0", privateKey: Buffer.from(tronNode.privateKey).toString('hex') },
    },
  };
  const payloadBuf = Buffer.from(JSON.stringify(payload), 'utf8');
  const mnemonicHash = sha256(Buffer.from(mnemonic, 'utf8')).toString('hex'); // in-memory only, for round-trip checks

  // 3. VM keystore (agent use): random key in a separate 0600 file.
  const vmKey = crypto.randomBytes(32);
  fs.mkdirSync(VM_KEY_DIR, { recursive: true, mode: 0o700 });
  writeNewFile(VM_KEY_PATH, vmKey.toString('hex') + '\n', 0o600);
  const vmEnc = encryptAesGcm(payloadBuf, vmKey);
  writeNewFile(KEYSTORE_PATH, JSON.stringify({ format: 'muse-vm-keystore-v1', cipher: 'aes-256-gcm', ...vmEnc }, null, 2) + '\n', 0o600);

  // 4. User backup: scrypt(passphrase) + AES-256-GCM.
  fs.mkdirSync(BACKUP_DIR, { recursive: true, mode: 0o700 });
  const salt = crypto.randomBytes(16);
  const userKey = crypto.scryptSync(passphrase, salt, 32, { N: 16384, r: 8, p: 1 });
  const userEnc = encryptAesGcm(payloadBuf, userKey);
  writeNewFile(BACKUP_PATH, JSON.stringify({
    format: 'muse-multichain-backup-v1', cipher: 'aes-256-gcm',
    kdf: 'scrypt', kdfParams: { N: 16384, r: 8, p: 1, dkLen: 32 },
    salt: b64(salt), ...userEnc,
  }, null, 2) + '\n', 0o600);

  // 5. EVM keystore V3 (MetaMask-importable), same passphrase.
  const evmKeystore = await evmWallet.encrypt(passphrase);
  writeNewFile(EVM_KEYSTORE_PATH, evmKeystore + '\n', 0o600);

  // 6. Public addresses file.
  const addressesTxt =
`Multichain burner wallet — public addresses
Generated: ${payload.created} on Muse's VM
One BIP39 seed, standard paths. Same EVM address on all EVM chains.

Bitcoin SegWit (mainnet)  m/84'/0'/0'/0/0   ${btcAddr}
Bitcoin testnet4          m/84'/1'/0'/0/0   ${btcTAddr}
EVM (all EVM chains)      m/44'/60'/0'/0/0  ${evmWallet.address}
Solana (Phantom path)     m/44'/501'/0'/0'  ${solAddr}
TRON                      m/44'/195'/0'/0/0 ${tronAddr}

Backup: wallet-backup-encrypted.json — decrypt offline with your backup
password:  node decrypt.js wallet-backup-encrypted.json
EVM keystore (import into MetaMask): evm-keystore-v3.json
See README-backup.md for import instructions per wallet.
`;
  writeNewFile(ADDRESSES_PATH, addressesTxt, 0o600);

  // 7. Tests — print ONLY pass/fail, never secrets.
  const tests = {};
  const test = (name, ok) => { tests[name] = ok; console.log(`TEST ${name}: ${ok ? 'PASS' : 'FAIL'}`); };

  // EVM: sign + verify recovers the address.
  try {
    const msg = 'muse-burner-wallet-test';
    const sig = await evmWallet.signMessage(msg);
    test('evm-sign-verify', ethers.verifyMessage(msg, sig).toLowerCase() === evmWallet.address.toLowerCase());
  } catch { test('evm-sign-verify', false); }

  // Solana: sign + verify with tweetnacl.
  try {
    const msg = Buffer.from('muse-burner-wallet-test');
    const sig = nacl.sign.detached(msg, solKeypair.secretKey);
    test('solana-sign-verify', nacl.sign.detached.verify(msg, sig, solKeypair.publicKey));
  } catch { test('solana-sign-verify', false); }

  // TRON: re-derive address from the private key's public key.
  try {
    const pubFromPriv = ecc.pointFromScalar(Buffer.from(tronNode.privateKey), true);
    test('tron-rederive', tronAddressFromPubkeyCompressed(pubFromPriv) === tronAddr);
  } catch { test('tron-rederive', false); }

  // BTC mainnet + testnet4: re-derive p2wpkh address from private key.
  try {
    const pubMain = ecc.pointFromScalar(Buffer.from(btcNode.privateKey), true);
    const reMain = bitcoin.payments.p2wpkh({ pubkey: Buffer.from(pubMain), network: bitcoin.networks.bitcoin }).address;
    test('btc-rederive', reMain === btcAddr);
    const pubT = ecc.pointFromScalar(Buffer.from(btcTNode.privateKey), true);
    const reT = bitcoin.payments.p2wpkh({ pubkey: Buffer.from(pubT), network: bitcoin.networks.testnet }).address;
    test('btc-testnet4-rederive', reT === btcTAddr);
  } catch { test('btc-rederive', false); test('btc-testnet4-rederive', false); }

  // Backup decrypt round-trip: decrypt the written file, compare mnemonic hash.
  try {
    const back = JSON.parse(fs.readFileSync(BACKUP_PATH, 'utf8'));
    const key = crypto.scryptSync(passphrase, Buffer.from(back.salt, 'base64'), 32, { N: 16384, r: 8, p: 1 });
    const dec = JSON.parse(decryptAesGcm(back, key).toString('utf8'));
    test('backup-decrypt-roundtrip', sha256(Buffer.from(dec.mnemonic, 'utf8')).toString('hex') === mnemonicHash
      && dec.addresses.evm === addresses.evm && dec.addresses.tron === addresses.tron);
  } catch { test('backup-decrypt-roundtrip', false); }

  // VM keystore decrypt round-trip.
  try {
    const ks = JSON.parse(fs.readFileSync(KEYSTORE_PATH, 'utf8'));
    const key = Buffer.from(fs.readFileSync(VM_KEY_PATH, 'utf8').trim(), 'hex');
    const dec = JSON.parse(decryptAesGcm(ks, key).toString('utf8'));
    test('vm-keystore-roundtrip', dec.addresses.btc === addresses.btc && dec.addresses.solana === addresses.solana);
  } catch { test('vm-keystore-roundtrip', false); }

  // EVM keystore V3 round-trip.
  try {
    const w = await ethers.Wallet.fromEncryptedJson(fs.readFileSync(EVM_KEYSTORE_PATH, 'utf8'), passphrase);
    test('evm-keystore-v3-roundtrip', w.address.toLowerCase() === evmWallet.address.toLowerCase());
  } catch { test('evm-keystore-v3-roundtrip', false); }

  console.log('\nADDRESSES');
  for (const [k, v] of Object.entries(addresses)) console.log(`${k}: ${v}`);
  console.log('\nFILES');
  for (const f of [KEYSTORE_PATH, VM_KEY_PATH, BACKUP_PATH, EVM_KEYSTORE_PATH, ADDRESSES_PATH]) {
    console.log(`${f} (${(fs.statSync(f).mode & 0o777).toString(8)})`);
  }
  const failed = Object.values(tests).filter((ok) => !ok).length;
  console.log(failed ? `\n${failed} TEST(S) FAILED` : '\nAll tests passed.');
  process.exit(failed ? 1 : 0);
}

main().catch((e) => { console.error('ERROR:', e.message); process.exit(1); });
