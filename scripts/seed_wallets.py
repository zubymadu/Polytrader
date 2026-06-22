"""
Seed the database with a starter list of known active Polymarket wallets.
Run once before starting the agent to bootstrap wallet discovery.

Usage:
    python scripts/seed_wallets.py
"""
import asyncio
import sys
import os

sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))

from polymarket_agent import database
from polymarket_agent.engine.wallet_scanner import scan_wallets

# Community-sourced starting addresses (publicly visible on-chain)
SEED_WALLETS = [
    "0x0000000000000000000000000000000000000001",  # placeholder — replace with real addresses
]


async def main():
    database.init_db()
    print(f"Seeding {len(SEED_WALLETS)} wallets…")
    results = await scan_wallets(addresses=SEED_WALLETS)
    print(f"Done. Scored {len(results)} wallets.")
    top = sorted(results, key=lambda w: w.score, reverse=True)[:5]
    for w in top:
        print(f"  {w.address[:12]}… score={w.score:.1f} wr={w.win_rate*100:.0f}%")


if __name__ == "__main__":
    asyncio.run(main())
