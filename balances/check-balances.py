#!/usr/bin/env python3
"""Check balances for deco's wallets (Circle Arc + multichain burner).

Public addresses only — no seed, no private keys, no logins.
EVM chain configs (RPC + explorers) come from chainlist.org data
(chainid.network/chains.json); explorer links prefer Blockscout where a
working instance exists, otherwise the chainlist-listed explorer.

Usage: python3 check-balances.py
Prints a human-readable report. Exit 0 if every check succeeded, 1 if any
check failed (partial results still printed).
"""
import json
import os
import subprocess
import sys
import urllib.request
import urllib.error

TIMEOUT = 15
EVM = "0xF1d949ed9B0b62508203AB0B91Bf01E73309Ad31"
BTC = "bc1q9473rsxyha0pl8w2sjcawy6ulyumpr4xch7822"
BTC_T4 = "tb1qzk55m8k55e5p835y58qrlesw26z8j3ch4pkvxp"
SOL = "DcvJCguHLqQE52hpDvtoLG2wBNuK82tHCWpsgySRH6rL"
TRON = "TXPdam3wpEfcEGhmvkcpb5rRyeyTkRT46p"
ARC = "0xc7d81269debced5e62069a4d42950965853aa300"
NILE_USDT = "TXYZopYRdj2D9XRtbG411XZZ3kM5VkAeBf"

# EVM chains from chainlist.org (chainid.network/chains.json, verified 2026-11-16).
# rpc: [primary, fallback]; explorer: Blockscout where it works, else chainlist-listed.
EVM_CHAINS = [
    ("Ethereum", "ETH",
     ["https://ethereum-rpc.publicnode.com", "https://cloudflare-eth.com"],
     f"https://eth.blockscout.com/address/{EVM}"),
    ("Sepolia", "SepETH",
     ["https://ethereum-sepolia.publicnode.com", "https://rpc.sepolia.ethpandaops.io"],
     f"https://eth-sepolia.blockscout.com/address/{EVM}"),
    # Note: rpc.sepolia.org / rpc2.sepolia.org returned 403 from this VM (2026-11-16).
    ("Base Sepolia", "Base SepETH",
     ["https://sepolia.base.org", "https://base-sepolia-rpc.publicnode.com"],
     f"https://base-sepolia.blockscout.com/address/{EVM}"),
    ("Arbitrum Sepolia", "Arb SepETH",
     ["https://sepolia-rollup.arbitrum.io/rpc", "https://arbitrum-sepolia-rpc.publicnode.com"],
     f"https://sepolia.arbiscan.io/address/{EVM}"),  # Blockscout instance 403s
    ("OP Sepolia", "OP SepETH",
     ["https://sepolia.optimism.io", "https://optimism-sepolia.drpc.org"],
     f"https://optimism-sepolia.blockscout.com/address/{EVM}"),
    ("Robinhood Testnet", "Test ETH",
     ["https://rpc.testnet.chain.robinhood.com/rpc",
      "https://robinhood-sepolia-rpc.publicnode.com"],
     f"https://explorer.testnet.chain.robinhood.com/address/{EVM}"),
    # Robinhood Chain Testnet, chain 46630, from chainlist.org (verified 2026-11-16).
    # Explorer is Blockscout. Faucet: https://faucet.zalalena.com/robinhood
    # (no login, captcha required, 10 claims/day, 60 min cooldown).
    ("LitVM Testnet", "zkLTC",
     ["https://rpc.testnet.liteforge.zeeve.net/"],
     f"https://explorer.testnet.liteforge.zeeve.net/address/{EVM}"),
    ("Arc Testnet (burner)", "test USDC",
     ["https://rpc.testnet.arc.io"],
     f"https://explorer.testnet.arc.io/address/{EVM}"),
    # Burner wallet's native USDC balance on Arc Testnet (USDC is the gas
    # token there). The Circle CLI faucet CANNOT fund this address ("Wallet
    # not found" — the CLI only funds Circle-managed wallets), so the burner
    # gets Arc testnet USDC/EURC via the Circle web faucet instead.
    # LitVM LiteForge testnet, chain 4441, from the official hub testnet.litvm.com
    # (NOT on chainlist.org). Migrated Caldera -> Zeeve Nov 11 2026; the old
    # Caldera RPC/explorer are dead. Faucet: https://faucet.testnet.liteforge.zeeve.net/
    # (0.05 zkLTC, 1 claim/wallet/24h, reCAPTCHA v3, no login).
]

results = []  # (label, balance_text, explorer_url)
failures = []


def ok(label, balance, url):
    results.append((label, balance, url))


def fail(label, err):
    failures.append(f"{label}: {err}")


def get_json(url, payload=None, headers=None):
    # A browser-like UA: several public RPCs 403 the default Python-urllib UA.
    h = {"Content-Type": "application/json",
         "User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36"}
    if headers:
        h.update(headers)
    req = urllib.request.Request(url, data=payload, headers=h)
    with urllib.request.urlopen(req, timeout=TIMEOUT) as r:
        return json.load(r)


def check_arc():
    """Circle Agent Wallet on Arc testnet, via the local Circle CLI."""
    local = os.path.expanduser("~/workspace/circle-agent-wallet/node_modules/.bin/circle")
    cli = local if os.path.exists(local) else "circle"
    env = dict(os.environ, NODE_USE_ENV_PROXY="1")
    try:
        out = subprocess.run(
            [cli, "wallet", "balance", "--address", ARC,
             "--chain", "ARC-TESTNET", "--output", "json"],
            capture_output=True, text=True, timeout=60, env=env)
        data = json.loads(out.stdout)
        seen = {}
        for b in data["data"]["balances"]:
            sym = b["token"]["symbol"]
            if sym not in seen:
                seen[sym] = b["amount"]
        text = " + ".join(f"{v} test {k}" for k, v in seen.items()) or "0"
        ok("Arc Testnet (Circle)",
           text, f"https://explorer.testnet.arc.io/address/{ARC}")
    except Exception as e:
        fail("Arc Testnet (Circle)", str(e)[:100])


def check_btc(label, addr, base, url):
    try:
        d = get_json(f"{base}/api/address/{addr}")
        stats = d["chain_stats"]
        sats = stats["funded_txo_sum"] - stats["spent_txo_sum"]
        ok(label, f"{sats / 1e8:.8f} BTC ({sats:,} sats)", url)
    except Exception as e:
        fail(label, str(e)[:100])


def check_evm(name, symbol, rpcs, url):
    payload = json.dumps({
        "jsonrpc": "2.0", "id": 1, "method": "eth_getBalance",
        "params": [EVM, "latest"]}).encode()
    last_err = ""
    for rpc in rpcs:
        try:
            d = get_json(rpc, payload=payload)
            wei = int(d["result"], 16)
            ok(name, f"{wei / 1e18:.6f} {symbol}", url)
            return
        except Exception as e:
            last_err = str(e)[:80]
    fail(name, last_err or "RPC failed")


def erc20_balance(rpc, contract, holder):
    data = "0x70a08231" + holder[2:].rjust(64, "0")
    payload = json.dumps({
        "jsonrpc": "2.0", "id": 1, "method": "eth_call",
        "params": [{"to": contract, "data": data}, "latest"]}).encode()
    d = get_json(rpc, payload=payload)
    return int(d["result"], 16)


def check_erc20_tokens(label, rpcs, tokens, url):
    # tokens: list of (symbol, contract, decimals). All contract addresses
    # were verified on-chain on 2026-11-16 (Circle faucet claim tx receipts,
    # Blockscout tokenlist API, or eth_getLogs Transfer events) — see
    # ~/workspace/multichain-wallet/faucet-plan.md for the sources.
    last_err = ""
    for rpc in rpcs:
        try:
            parts = []
            for symbol, contract, decimals in tokens:
                raw = erc20_balance(rpc, contract, EVM)
                parts.append(f"{raw / (10 ** decimals):,.2f} test {symbol}")
            ok(label, " + ".join(parts), url)
            return
        except Exception as e:
            last_err = str(e)[:80]
    fail(label, last_err or "RPC failed")


def check_sol(label, rpc, url):
    payload = json.dumps({
        "jsonrpc": "2.0", "id": 1, "method": "getBalance",
        "params": [SOL]}).encode()
    try:
        d = get_json(rpc, payload=payload)
        lamports = d["result"]["value"]
        ok(label, f"{lamports / 1e9:.6f} SOL", url)
    except Exception as e:
        fail(label, str(e)[:100])


def check_tron(label, base, url, usdt_token=None):
    try:
        d = get_json(f"{base}/wallet/getaccount",
                     payload=json.dumps({"address": TRON, "visible": True}).encode())
        sun = d.get("balance", 0) or 0
        text = f"{sun / 1e6:,.2f} TRX"
        if usdt_token:
            try:
                td = get_json(f"https://nileapi.tronscan.org/api/account/tokens"
                              f"?address={TRON}&start=0&limit=10")
                for t in td.get("data", []):
                    if t.get("tokenId") == usdt_token:
                        usdt = float(t["balance"]) / (10 ** t["tokenDecimal"])
                        text += f" + {usdt:,.2f} test USDT"
            except Exception as e:
                text += f" (USDT check failed: {str(e)[:60]})"
        ok(label, text, url)
    except Exception as e:
        fail(label, str(e)[:100])


def main():
    check_arc()
    check_btc("Bitcoin", BTC, "https://mempool.space",
              f"https://mempool.space/address/{BTC}")
    check_btc("Bitcoin testnet4", BTC_T4, "https://mempool.space/testnet4",
              f"https://mempool.space/testnet4/address/{BTC_T4}")
    for name, symbol, rpcs, url in EVM_CHAINS:
        check_evm(name, symbol, rpcs, url)
    check_erc20_tokens(
        "Sepolia tokens",
        ["https://ethereum-sepolia.publicnode.com",
         "https://rpc.sepolia.ethpandaops.io"],
        [("USDC", "0x1c7d4b196cb0c7b01d743fbc6116a902379c7238", 6),
         ("EURC", "0x08210f9170f89ab7658f0b5e3ff39b0e03c594d4", 6)],
        f"https://eth-sepolia.blockscout.com/address/{EVM}#tokens")
    check_erc20_tokens(
        "Base Sepolia tokens",
        ["https://sepolia.base.org", "https://base-sepolia-rpc.publicnode.com"],
        [("USDC", "0x036cbd53842c5426634e7929541ec2318f3dcf7e", 6),
         ("EURC", "0x808456652fdb597867f38412077a9182bf77359f", 6)],
        f"https://base-sepolia.blockscout.com/address/{EVM}#tokens")
    check_erc20_tokens(
        "Arbitrum Sepolia tokens",
        ["https://sepolia-rollup.arbitrum.io/rpc",
         "https://arbitrum-sepolia-rpc.publicnode.com"],
        [("USDC", "0x75faf114eafb1BDBe2F0316DF893fd58ce46AA4d", 6)],
        f"https://sepolia.arbiscan.io/address/{EVM}#tokens")
    check_erc20_tokens(
        "OP Sepolia tokens",
        ["https://sepolia.optimism.io", "https://optimism-sepolia.drpc.org"],
        [("USDC", "0x5fd84259d66cd46123540766be93dfe6d43130d7", 6)],
        f"https://optimism-sepolia.blockscout.com/address/{EVM}#tokens")
    check_erc20_tokens(
        "Arc Testnet (burner) tokens",
        ["https://rpc.testnet.arc.io"],
        [("EURC", "0x89b50855aa3be2f677cd6303cec089b5f319d72a", 6)],
        f"https://explorer.testnet.arc.io/address/{EVM}#tokens")
    check_sol("Solana", "https://api.mainnet-beta.solana.com",
              f"https://explorer.solana.com/address/{SOL}")
    check_sol("Solana devnet", "https://api.devnet.solana.com",
              f"https://explorer.solana.com/address/{SOL}?cluster=devnet")
    check_tron("TRON", "https://api.trongrid.io",
               f"https://tronscan.org/#/address/{TRON}")
    check_tron("TRON Nile", "https://nile.trongrid.io",
               f"https://nile.tronscan.org/address/{TRON}",
               usdt_token=NILE_USDT)

    print("=== Wallet balances ===")
    for label, balance, url in results:
        print(f"{label}: {balance}")
        print(f"  {url}")
    if failures:
        print("\n=== Failed checks ===")
        for f in failures:
            print(f"- {f}")
    print(f"\n{len(results)} checked OK, {len(failures)} failed.")
    return 1 if failures else 0


if __name__ == "__main__":
    sys.exit(main())
