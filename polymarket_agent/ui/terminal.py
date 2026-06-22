"""
Rich-based live terminal dashboard.

Layout:
  ┌─ HEADER ──────────────────────────────────────────────────────┐
  │ ARB OPPORTUNITIES │ WALLET LEADERBOARD │ COPY TRADES          │
  │                   │                    │                       │
  ├───────────────────┴────────────────────┴───────────────────────┤
  │ AI INSIGHT / LOG FEED                                          │
  └────────────────────────────────────────────────────────────────┘
"""
import asyncio
from datetime import datetime
from typing import Any

from rich.console import Console
from rich.layout import Layout
from rich.live import Live
from rich.panel import Panel
from rich.table import Table
from rich import box
from rich.text import Text
from rich.align import Align

from .. import database
from ..models import ArbOpportunity, WalletStats, CopyTrade

console = Console()

# Shared state updated by the main agent loop
_state: dict[str, Any] = {
    "arbs": [],
    "wallets": [],
    "copy_trades": [],
    "log_lines": [],
    "insight": "",
    "last_scan": None,
    "status": "Initialising…",
    "wallet_count": 0,
}


def update(key: str, value: Any):
    _state[key] = value


def log(msg: str):
    ts = datetime.utcnow().strftime("%H:%M:%S")
    _state["log_lines"].append(f"[dim]{ts}[/dim] {msg}")
    _state["log_lines"] = _state["log_lines"][-30:]  # keep last 30


# ── Panel builders ─────────────────────────────────────────────────────────────

def _header() -> Panel:
    status = _state["status"]
    wallet_count = _state["wallet_count"]
    last_scan = _state["last_scan"]
    scan_str = last_scan.strftime("%H:%M:%S UTC") if last_scan else "pending"

    text = Text()
    text.append("⚡ POLYTRADER  ", style="bold cyan")
    text.append(f"│ Wallets: {wallet_count}  ", style="white")
    text.append(f"│ Status: {status}  ", style="green")
    text.append(f"│ Last scan: {scan_str}  ", style="dim")

    arbs = _state["arbs"]
    copies = _state["copy_trades"]
    text.append(f"│ Arbs: {len(arbs)}  ", style="yellow")
    text.append(f"│ Copies: {len(copies)}", style="magenta")

    return Panel(Align.center(text), style="bold cyan", height=3)


def _arb_panel() -> Panel:
    table = Table(
        box=box.SIMPLE,
        show_header=True,
        header_style="bold yellow",
        expand=True,
    )
    table.add_column("Market", ratio=5, no_wrap=False)
    table.add_column("Dir", ratio=2, justify="center")
    table.add_column("YES", ratio=1, justify="right")
    table.add_column("NO", ratio=1, justify="right")
    table.add_column("Profit", ratio=1, justify="right")

    arbs: list[ArbOpportunity] = _state["arbs"]
    for opp in arbs[:12]:
        profit_pct = opp.profit_pct * 100
        dir_str = "BUY↑" if opp.direction == "BUY_BOTH" else "SELL↓"
        dir_color = "green" if opp.direction == "BUY_BOTH" else "red"
        table.add_row(
            opp.market.question[:50],
            f"[{dir_color}]{dir_str}[/{dir_color}]",
            f"{opp.yes_price:.3f}",
            f"{opp.no_price:.3f}",
            f"[bold yellow]{profit_pct:.2f}%[/bold yellow]",
        )

    if not arbs:
        table.add_row("[dim]Scanning markets…[/dim]", "", "", "", "")

    return Panel(table, title="[yellow]ARB OPPORTUNITIES[/yellow]", border_style="yellow")


def _wallet_panel() -> Panel:
    table = Table(
        box=box.SIMPLE,
        show_header=True,
        header_style="bold cyan",
        expand=True,
    )
    table.add_column("#", width=3, justify="right")
    table.add_column("Wallet", ratio=3)
    table.add_column("Score", ratio=1, justify="right")
    table.add_column("WR%", ratio=1, justify="right")
    table.add_column("ROI 30d", ratio=1, justify="right")
    table.add_column("Copy", width=5, justify="center")

    wallets: list[WalletStats] = _state["wallets"]
    for i, w in enumerate(wallets[:15], 1):
        copy_mark = "[green]●[/green]" if w.is_copied else "[dim]○[/dim]"
        roi_color = "green" if w.roi_30d >= 0 else "red"
        table.add_row(
            str(i),
            f"[dim]{w.address[:6]}…{w.address[-4:]}[/dim]",
            f"[bold]{w.score:.1f}[/bold]",
            f"{w.win_rate*100:.0f}%",
            f"[{roi_color}]{w.roi_30d:+.1f}%[/{roi_color}]",
            copy_mark,
        )

    if not wallets:
        table.add_row("", "[dim]Scanning wallets…[/dim]", "", "", "", "")

    return Panel(table, title="[cyan]WALLET LEADERBOARD[/cyan]", border_style="cyan")


def _copy_panel() -> Panel:
    table = Table(
        box=box.SIMPLE,
        show_header=True,
        header_style="bold magenta",
        expand=True,
    )
    table.add_column("Source", ratio=2)
    table.add_column("Side", ratio=2, justify="center")
    table.add_column("Size", ratio=1, justify="right")
    table.add_column("Entry", ratio=1, justify="right")

    copies: list[dict] = _state["copy_trades"]
    for c in copies[:10]:
        side = c.get("side", "")
        side_color = "green" if "BUY" in side else "red"
        src = c.get("source_wallet", "")
        table.add_row(
            f"[dim]{src[:6]}…{src[-4:]}[/dim]",
            f"[{side_color}]{side}[/{side_color}]",
            f"${c.get('size', 0):.2f}",
            f"{c.get('entry_price', 0):.4f}",
        )

    if not copies:
        table.add_row("[dim]No open copies[/dim]", "", "", "")

    return Panel(table, title="[magenta]COPY TRADES[/magenta]", border_style="magenta")


def _log_panel() -> Panel:
    lines = _state["log_lines"][-8:]
    insight = _state.get("insight", "")
    content = Text()
    if insight:
        content.append("🧠 ", style="bold")
        content.append(insight[:200], style="italic dim")
        content.append("\n\n")
    for line in lines:
        content.append(line + "\n")
    return Panel(content, title="[dim]LOG / AI INSIGHT[/dim]", border_style="dim")


def _build_layout() -> Layout:
    layout = Layout()
    layout.split_column(
        Layout(name="header", size=3),
        Layout(name="main", ratio=4),
        Layout(name="footer", size=12),
    )
    layout["main"].split_row(
        Layout(name="arbs", ratio=5),
        Layout(name="wallets", ratio=4),
        Layout(name="copies", ratio=3),
    )
    return layout


def _render(layout: Layout):
    layout["header"].update(_header())
    layout["arbs"].update(_arb_panel())
    layout["wallets"].update(_wallet_panel())
    layout["copies"].update(_copy_panel())
    layout["footer"].update(_log_panel())


async def run(refresh_rate: float = 2.0):
    """Run the live terminal dashboard. Blocks until interrupted."""
    layout = _build_layout()
    with Live(layout, console=console, refresh_per_second=1 / refresh_rate, screen=True):
        while True:
            _render(layout)
            await asyncio.sleep(refresh_rate)
