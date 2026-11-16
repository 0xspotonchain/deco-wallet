// Derivation check with the PUBLIC BIP39 test mnemonic (abandon x11 + about).
// Never put a real seed in this file. Verifies our derivation code against
// well-known vectors before it ever touches a real wallet.
const bip39 = require('bip39');
const { BIP32Factory } = require('bip32');
const ecc = require('tiny-secp256k1');
const bitcoin = require('bitcoinjs-lib');
const { ethers } = require('ethers');
const nacl = require('tweetnacl');
const { encode: bs58encode } = require('bs58').default;
const { derivePath } = require('ed25519-hd-key');

const MNEMONIC = 'abandon '.repeat(11) + 'about';
const seed = bip39.mnemonicToSeedSync(MNEMONIC);
const bip32 = BIP32Factory(ecc);

const results = {};
function check(name, got, expected) {
  const ok = expected ? got.toLowerCase() === expected.toLowerCase() : null;
  results[name] = { got, expected: expected || '(no memorized vector)', ok };
  console.log(`${name}: ${got}` + (expected ? `  [expected ${expected}] -> ${ok ? 'MATCH' : 'MISMATCH!'}` : '  [computed, verify independently]'));
}

// BTC SegWit (BIP84): m/84'/0'/0'/0/0
const btcNode = bip32.fromSeed(seed).derivePath("m/84'/0'/0'/0/0");
const btcAddr = bitcoin.payments.p2wpkh({ pubkey: Buffer.from(btcNode.publicKey), network: bitcoin.networks.bitcoin }).address;
check('BTC SegWit m/84\'/0\'/0\'/0/0', btcAddr, 'bc1qcr8te4kr609gcawutmrza0j4xv80jy8z306fyu');

// EVM (BIP44): m/44'/60'/0'/0/0
const evmNode = bip32.fromSeed(seed).derivePath("m/44'/60'/0'/0/0");
const evmWallet = new ethers.Wallet('0x' + Buffer.from(evmNode.privateKey).toString('hex'));
check('EVM m/44\'/60\'/0\'/0/0', evmWallet.address, '0x9858EfFD232B4033E47d90003D41EC34EcaEda94');

// Solana (SLIP-0010 ed25519): m/44'/501'/0'/0' (Phantom/Solflare path).
// Expected value cross-checked with Python bip-utils (independent implementation).
const solDerived = derivePath("m/44'/501'/0'/0'", seed.toString('hex'));
const solAddr = bs58encode(nacl.sign.keyPair.fromSeed(solDerived.key).publicKey);
check("SOL m/44'/501'/0'/0'", solAddr, 'HAgk14JpMQLgt6rVgv7cBQFJWFto5Dqxi472uT3DKpqk');

// TRON (BIP44): m/44'/195'/0'/0/0 — manual: base58check(0x41 || keccak(pub)[12:]).
// Expected value cross-checked with Python bip-utils (independent implementation).
const crypto = require('crypto');
const tronNode = bip32.fromSeed(seed).derivePath("m/44'/195'/0'/0/0");
const tronUncompressed = Buffer.from(ecc.pointCompress(Buffer.from(tronNode.publicKey), false));
const tronHash = ethers.keccak256(tronUncompressed.subarray(1));
const tronPayload = Buffer.concat([Buffer.from([0x41]), Buffer.from(tronHash.slice(2), 'hex').subarray(12)]);
const tronChecksum = crypto.createHash('sha256').update(crypto.createHash('sha256').update(tronPayload).digest()).digest().subarray(0, 4);
const tronAddr = bs58encode(Buffer.concat([tronPayload, tronChecksum]));
check("TRON m/44'/195'/0'/0/0", tronAddr, 'TUEZSdKsoDHQMeZwihtdoBiN46zxhGWYdH');

const failed = Object.values(results).filter((r) => r.ok === false);
console.log(failed.length ? `\n${failed.length} MISMATCH(ES) - do not use` : '\nAll checked vectors match.');
process.exit(failed.length ? 1 : 0);
