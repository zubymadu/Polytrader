#!/usr/bin/env python3
"""
Polytrader — Polymarket arbitrage + copy-trading AI agent.

Usage:
    python main.py               # Full terminal + agent
    python main.py --no-terminal # Headless / background mode
    python main.py --arb-only    # Arb scanner only (no wallet scan)
"""
import argparse
import asyncio
import logging
import sys


def _setup_logging(level: str = "INFO"):
    logging.basicConfig(
        level=getattr(logging, level.upper(), logging.INFO),
        format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
        datefmt="%H:%M:%S",
        handlers=[
            logging.FileHandler("polytrader.log"),
        ],
    )


def main():
    parser = argparse.ArgumentParser(description="Polytrader AI agent")
    parser.add_argument("--no-terminal", action="store_true", help="Headless mode")
    parser.add_argument("--arb-only",    action="store_true", help="Arb scanner only")
    parser.add_argument("--log-level",   default="INFO",      help="Logging level")
    args = parser.parse_args()

    _setup_logging(args.log_level)

    if args.arb_only:
        from polymarket_agent.engine.arbitrage import scan_markets
        from polymarket_agent import database
        from rich.console import Console
        from rich.table import Table
        from rich import box

        async def _run_arb_scan():
            database.init_db()
            c = Console()
            c.print("[cyan]Scanning for arbitrage opportunities…[/cyan]")
            opps = await scan_markets()
            if not opps:
                c.print("[yellow]No opportunities above threshold.[/yellow]")
                return
            t = Table(title="Arb Opportunities", box=box.ROUNDED)
            t.add_column("Market", ratio=5)
            t.add_column("Dir", ratio=2)
            t.add_column("YES", ratio=1)
            t.add_column("NO",  ratio=1)
            t.add_column("Profit", ratio=1)
            for o in opps:
                t.add_row(
                    o.market.question[:60],
                    o.direction,
                    f"{o.yes_price:.4f}",
                    f"{o.no_price:.4f}",
                    f"{o.profit_pct*100:.2f}%",
                )
            c.print(t)

        asyncio.run(_run_arb_scan())
        return

    # Full agent
    from polymarket_agent import agent
    show_terminal = not args.no_terminal

    try:
        asyncio.run(agent.run(show_terminal=show_terminal))
    except KeyboardInterrupt:
        print("\nPolytrader stopped.")
        sys.exit(0)


if __name__ == "__main__":
    main()
