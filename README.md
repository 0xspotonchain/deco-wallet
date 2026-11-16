# Multichain burner wallet

One BIP39 seed, standard paths, five chains — BTC, EVM, Solana, TRON
(+ BTC testnet4). Fork it and build your own burner wallet: the generator,
the derivation tests and the offline decryptor are all here, MIT licensed.

Compatible with MetaMask, Trust Wallet, Bitget Wallet, OKX Wallet,
Phantom/Solflare, TronLink, and iancoleman.io/bip39.

## Build your own

Requirements: Node.js 18 or later.

```sh
git clone https://github.com/0xspotonchain/deco-wallet.git
cd deco-wallet
npm install

# 1. Verify the derivations first (public BIP39 test mnemonic, no secrets)
npm test

# 2. Generate your wallet — type a backup passphrase (min 8 chars),
#    then Enter and Ctrl-D. It is read from stdin and never logged.
node generate.js
```

`generate.js` runs once and refuses to overwrite an existing wallet. It
prints only your public addresses and the test results — never the seed
phrase, a private key, or the passphrase. What it creates:

- `keystore.enc.json` (0600) — the keys, AES-256-GCM encrypted with a
  random key kept in `~/.config/multichain-wallet/vm-key` (0600). This is
  the machine-side keystore, for signing without asking each time.
- `backup/wallet-backup-encrypted.json` (0600) — seed phrase + every
  chain's private key, encrypted with your backup passphrase
  (scrypt N=16384 + AES-256-GCM). Without the passphrase it is unreadable.
- `backup/evm-keystore-v3.json` (0600) — standard Ethereum keystore, same
  passphrase. Imports into MetaMask on desktop (mobile has no JSON import).
- `backup/addresses.txt` (0600) — public addresses only. Safe to share.

It runs 8 tests as it goes (EVM + Solana sign/verify, TRON + BTC
re-derive, backup + keystore decrypt round-trips, EVM keystore V3
round-trip) and exits non-zero if any fail.

## Decrypt the backup (offline)

- Browser, no Node.js: open `decrypt-offline.html` — also hosted at
  https://0xspotonchain.github.io/deco/decryptor.html — pick the backup
  file, enter the backup password. It has no network code: nothing
  leaves your device. Works on a phone too.
- Terminal: `node decrypt.js backup/wallet-backup-encrypted.json --verify`
  checks the password and shows addresses only; without `--verify` it
  prints the full backup. Run it offline, in a private terminal.
- `test-html-decryptor.js` verifies the HTML decryptor against RFC 7914
  scrypt vectors, Node's scrypt, and a real backup decrypt.

See `README-backup.md` for import instructions per wallet
(MetaMask, Phantom/Solflare, TronLink, Trust/Bitget/OKX, Electrum/Sparrow).

## Chains (first address of each)
- BTC SegWit (bech32, bc1q...): m/84'/0'/0'/0/0 — BIP84
- BTC testnet4 (tb1q...): m/84'/1'/0'/0/0 — BIP84
- EVM (Ethereum + all EVM L2s share one address): m/44'/60'/0'/0/0 — BIP44
- Solana (Phantom/Solflare path): m/44'/501'/0'/0' — SLIP-0010 ed25519
- TRON (TronLink): m/44'/195'/0'/0/0 — BIP44

## Verification (2026-11-14)
`test-vectors.js` derives all four chains from the public BIP39 test mnemonic
(abandon x11 + about) and matches known vectors. BTC + EVM match published
vectors; SOL + TRON cross-checked against an independent implementation
(Python bip-utils). All four MATCH. Never put a real seed in that file.

## Deco's wallet (created 2026-11-15, all 8 tests passed)
- BTC SegWit mainnet: bc1q9473rsxyha0pl8w2sjcawy6ulyumpr4xch7822
- BTC testnet4: tb1qzk55m8k55e5p835y58qrlesw26z8j3ch4pkvxp
- EVM: 0xF1d949ed9B0b62508203AB0B91Bf01E73309Ad31
- Solana: DcvJCguHLqQE52hpDvtoLG2wBNuK82tHCWpsgySRH6rL
- TRON: TXPdam3wpEfcEGhmvkcpb5rRyeyTkRT46p
- Live-verified 2026-11-15: all addresses recognized by public explorers/RPCs,
  all balances 0 (fresh wallet). Tests: EVM + Solana sign/verify, TRON + BTC
  re-derive, backup decrypt round-trip, VM keystore round-trip, EVM keystore
  V3 round-trip — all PASS.
- Custody: keys live in an AES-256-GCM encrypted keystore
  (`keystore.enc.json`, 0600) on Muse's VM, unlocked by a random key in
  `~/.config/multichain-wallet/vm-key` (0600). Deco holds the encrypted
  backup (scrypt + AES-256-GCM, his own backup password, never stored or
  repeated by the agent). If he forgets the backup password, the VM
  keystore still holds the keys: re-export a fresh backup with a new
  password. The encrypted keystore and backup files are NOT in this repo —
  they are secrets, never pushed.

## Faucets
`faucet-plan.md` — what pays testnet coins to these addresses, what is
blocked from a VM, and what must be claimed from your own device.
`balances/check-balances.py` checks every balance from public RPCs.

## Tooling
Node libs in `node_modules/`: bip39, bip32, bitcoinjs-lib, tiny-secp256k1,
ethers, @solana/web3.js (v3 — Keypair API changed; derivation uses tweetnacl
+ ed25519-hd-key instead), tronweb, bs58, tweetnacl. Python `.venv/` holds
bip-utils for cross-checks only.

## Security
- Burner only: keep small amounts here.
- The seed phrase is NEVER written to chat, memory, logs, or plaintext
  files by any tool in this repo.
- Never enter the seed phrase on any website. No legitimate faucet or
  airdrop ever asks for it. The only place the backup password goes is
  the offline decryptor, on your own machine.
- Store the backup files offline (USB stick, encrypted drive). Keep the
  backup password somewhere safe and separate from the files.

## License
MIT — see LICENSE.

## Built with

Built with [Muse](https://muse.ai) — deco's AI agent.
