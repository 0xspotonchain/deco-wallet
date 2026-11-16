# Multichain burner wallet — backup files

One BIP39 seed (12 words), standard paths, generated on Muse's VM on
2026-11-15. Compatible with MetaMask, Trust Wallet, Bitget Wallet, OKX
Wallet, Phantom/Solflare, TronLink, and iancoleman.io/bip39.

## Files in this folder
- `wallet-backup-encrypted.json` — the full backup: seed phrase + every
  chain's private key, encrypted with your backup password
  (scrypt + AES-256-GCM). Without the password it is unreadable.
- `evm-keystore-v3.json` — standard Ethereum keystore (same password).
  Import directly into MetaMask on desktop: Import Wallet > JSON File.
  (MetaMask mobile cannot import JSON files — use the seed phrase or the
  EVM private key from the decrypted backup instead.)
- `addresses.txt` — public addresses only. Safe to share.
- `decrypt.js` — decrypt the backup offline. Needs only Node.js, no
  dependencies. Never sends anything anywhere.
- `decrypt-offline.html` — same decryptor, runs in any browser with no
  Node.js and no internet. Open it, pick the backup file, enter your
  backup password, and it shows the seed phrase and all keys with copy
  buttons. Works on a phone too.
- `README-backup.md` — this file.

## Decrypt the backup (offline)
Option A — browser, no Node.js needed:
open `decrypt-offline.html` in Chrome/Firefox (works offline, even from
the file on your phone), pick `wallet-backup-encrypted.json`, enter your
backup password.

Option B — terminal:
```
node decrypt.js wallet-backup-encrypted.json --verify   # check password + show addresses only
node decrypt.js wallet-backup-encrypted.json            # print the full backup (seed + keys)
```
Run it offline, in a private terminal. The full output contains your seed
phrase and private keys — never paste it anywhere, never screenshot it.

## Import into wallets
- **MetaMask / any EVM wallet:** import `evm-keystore-v3.json` with your
  backup password, or import the EVM private key from the decrypted backup.
  The same address works on Ethereum, Base, Arbitrum, Optimism, BNB Chain,
  Polygon, etc. (add each network via chainlist.org).
- **Phantom / Solflare:** import the Solana private key (base58) from the
  decrypted backup.
- **TronLink:** import the TRON private key (hex) from the decrypted backup.
- **Trust / Bitget / OKX:** import the 12-word seed phrase — all chains
  derive automatically.
- **Bitcoin (Electrum / Sparrow):** import the seed phrase, or the WIF
  private key. Mainnet address is bech32 (bc1q...). The testnet4 address
  (tb1...) uses the separate testnet4 WIF — switch the wallet to testnet4
  mode first.

## Security
- This is a burner wallet. Keep small amounts here.
- Store these files offline (USB stick, encrypted drive). Keep the backup
  password somewhere safe and separate from the files.
- Never enter the seed phrase on any website. No legitimate faucet or
  airdrop ever asks for it.
- If you forget the backup password: the encrypted backup cannot be opened,
  but the keys also live in Muse's encrypted VM keystore, so Muse can
  re-export a fresh backup encrypted with a new password. Ask in chat.
