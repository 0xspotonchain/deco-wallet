# Multichain burner wallet — deco

One BIP39 seed, standard BIP44 paths, compatible with MetaMask, Trust Wallet,
Bitget Wallet, OKX Wallet, Phantom/Solflare, TronLink, and iancoleman.io/bip39.

## Chains (first address of each)
- BTC SegWit (bech32, bc1q...): m/84'/0'/0'/0/0 — BIP84
- EVM (Ethereum + all EVM L2s share one address): m/44'/60'/0'/0/0 — BIP44
- Solana (Phantom/Solflare path): m/44'/501'/0'/0' — SLIP-0010 ed25519
- TRON (TronLink): m/44'/195'/0'/0/0 — BIP44

## Verification (2026-11-14)
`test-vectors.js` derives all four chains from the public BIP39 test mnemonic
(abandon x11 + about) and matches known vectors. BTC + EVM match published
vectors; SOL + TRON cross-checked against an independent implementation
(Python bip-utils). All four MATCH. Never put a real seed in that file.

## Custody design (decided 2026-11-15, wallet created)
- Muse generated the 12-word seed on this VM (`generate.js`, run once).
- Keys live on this VM in an AES-256-GCM encrypted keystore
  (`keystore.enc.json`, 0600), unlocked by a random key in
  `~/.config/multichain-wallet/vm-key` (0600), so the agent can sign for
  airdrops/testnets without asking each time.
- Deco holds an encrypted backup: `backup/wallet-backup-encrypted.json`
  (scrypt + AES-256-GCM, deco's own backup password, never stored or repeated
  by the agent) + `backup/evm-keystore-v3.json` (MetaMask-importable) +
  `backup/addresses.txt` + `backup/decrypt.js` + `backup/README-backup.md`.
  Delivered as private chat attachments, never a public link.
- The seed phrase itself is NEVER written to chat, memory, logs, or plaintext
  files. Burner only: keep small amounts here.
- If deco forgets the backup password, the VM keystore still holds the keys:
  re-export a fresh backup encrypted with a new password.

## Wallet (created 2026-11-15, all 8 tests passed)
- BTC SegWit mainnet: bc1q9473rsxyha0pl8w2sjcawy6ulyumpr4xch7822
- BTC testnet4: tb1qzk55m8k55e5p835y58qrlesw26z8j3ch4pkvxp
- EVM: 0xF1d949ed9B0b62508203AB0B91Bf01E73309Ad31
- Solana: DcvJCguHLqQE52hpDvtoLG2wBNuK82tHCWpsgySRH6rL
- TRON: TXPdam3wpEfcEGhmvkcpb5rRyeyTkRT46p
- Live-verified 2026-11-15: all addresses recognized by public explorers/RPCs,
  all balances 0 (fresh wallet). Tests: EVM + Solana sign/verify, TRON + BTC
  re-derive, backup decrypt round-trip, VM keystore round-trip, EVM keystore
  V3 round-trip — all PASS.

## Tooling
Node libs in `node_modules/`: bip39, bip32, bitcoinjs-lib, tiny-secp256k1,
ethers, @solana/web3.js (v3 — Keypair API changed; derivation uses tweetnacl
+ ed25519-hd-key instead), tronweb, bs58, tweetnacl. Python `.venv/` holds
bip-utils for cross-checks only.
