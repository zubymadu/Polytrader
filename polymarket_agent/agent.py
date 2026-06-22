"""
Main agent loop — orchestrates arb scanning, wallet monitoring,
copy-trading, AI analysis, and Telegram notifications.
"""
import asyncio
import logging
import time
from datetime import datetime

from . import config, database
from .api import client as api_client
from .engine import arbitrage, wallet_scanner, copytrade
from .engine import forex_scanner
from .engine import market_calendar
from . import ai_agent, telegram_bot
from .ui import terminal

log = logging.getLogger(__name__)

# Mutable agent state shared across coroutines
_wallets: list = []
_copy_wallets: list = []
_arbs: list = []
_last_ai_run: float = 0.0
_wallet_addresses: list[str] = []


# ── Callbacks ─────────────────────────────────────────────────────────────────

async def _on_arb(opp):
    terminal.log(
        f"[yellow]ARB[/yellow] {opp.direction} {opp.profit_pct*100:.2f}% — "
        f"{opp.market.question[:50]}"
    )
    _arbs.append(opp)
    _arbs.sort(key=lambda o: o.profit_pct, reverse=True)
    terminal.update("arbs", _arbs[:20])
    await telegram_bot.notify_arb(opp)


async def _on_copy(ct):
    terminal.log(
        f"[magenta]COPY[/magenta] {ct.side} ${ct.size:.2f} from "
        f"{ct.source_wallet[:8]}…"
    )
    copies = database.get_open_copy_trades()
    terminal.update("copy_trades", copies)
    await telegram_bot.notify_copy(ct)


async def _on_wallet_scored(ws):
    if ws.score > 50:
        terminal.log(
            f"[cyan]WALLET[/cyan] {ws.address[:8]}… score={ws.score:.1f} "
            f"wr={ws.win_rate*100:.0f}%"
        )


# ── Background tasks ──────────────────────────────────────────────────────────

async def _arb_scan_loop():
    """Scan for arbitrage opportunities on a fixed interval."""
    while True:
        try:
            terminal.update("status", "Scanning markets…")
            opps = await arbitrage.scan_markets(on_opportunity=_on_arb)
            _arbs.clear()
            _arbs.extend(opps)
            terminal.update("arbs", _arbs[:20])
            terminal.update("last_scan", datetime.utcnow())
            terminal.update("status", f"Idle ({len(opps)} arbs found)")
            terminal.log(f"Market scan complete — {len(opps)} arb opportunities")
        except Exception as exc:
            log.error("Arb scan error: %s", exc)
            terminal.log(f"[red]Arb scan error: {exc}[/red]")
        await asyncio.sleep(config.SCAN_INTERVAL)


async def _wallet_scan_loop():
    """Discover and score wallets every 5 minutes."""
    global _wallets, _copy_wallets, _wallet_addresses
    while True:
        try:
            terminal.update("status", "Scanning wallets…")
            if not _wallet_addresses:
                _wallet_addresses = await wallet_scanner.discover_wallets(
                    config.WALLET_MONITOR_COUNT
                )
                terminal.log(f"Discovered {len(_wallet_addresses)} wallet addresses")

            scored = await wallet_scanner.scan_wallets(
                addresses=_wallet_addresses,
                on_wallet_scored=_on_wallet_scored,
            )
            _wallets = scored

            # Mark copy wallets
            _copy_wallets = copytrade.select_copy_wallets(
                _wallets, config.COPY_TRADE_MAX_WALLETS
            )
            copy_addrs = {w.address for w in _copy_wallets}
            for w in _wallets:
                w.is_copied = w.address in copy_addrs

            count = database.get_wallet_count()
            terminal.update("wallets", _wallets[:20])
            terminal.update("wallet_count", count)
            terminal.log(
                f"Wallet scan done — {count} tracked, {len(_copy_wallets)} being copied"
            )
        except Exception as exc:
            log.error("Wallet scan error: %s", exc)
            terminal.log(f"[red]Wallet scan error: {exc}[/red]")

        await asyncio.sleep(300)  # 5 min


async def _copy_trade_loop():
    """Poll copy-watched wallets every 30 s for new trades."""
    while True:
        if _copy_wallets:
            try:
                await copytrade.watch_and_copy(
                    _copy_wallets, on_signal=_on_copy
                )
                copies = database.get_open_copy_trades()
                terminal.update("copy_trades", copies)
            except Exception as exc:
                log.error("Copy trade error: %s", exc)
        await asyncio.sleep(30)


async def _forex_scan_loop():
    """Scan XAUUSD, US30, BTCUSD every 5 minutes."""
    while True:
        try:
            signals = await forex_scanner.scan_all()
            for sig in signals:
                terminal.log(
                    f"[yellow]{sig.instrument}[/yellow] {sig.direction} "
                    f"conf={sig.confidence*100:.0f}% {sig.price:,.2f} — "
                    f"{sig.reasons[0] if sig.reasons else ''}"
                )
                await telegram_bot.notify_forex(sig)
        except Exception as exc:
            log.error("Forex scan error: %s", exc)
        await asyncio.sleep(300)  # 5 min


async def _daily_brief_loop():
    """Send a market brief every day at 08:00 UTC."""
    while True:
        now = datetime.utcnow()
        # Seconds until next 08:00 UTC
        target = now.replace(hour=8, minute=0, second=0, microsecond=0)
        if now >= target:
            target += __import__("datetime").timedelta(days=1)
        await asyncio.sleep((target - now).total_seconds())
        try:
            events = await market_calendar.get_todays_events()
            headlines = await market_calendar._fetch_headlines()
            brief = market_calendar.fmt_daily_brief(events, headlines)
            await telegram_bot.notify_daily_brief(brief)
            terminal.log("[cyan]Daily market brief sent[/cyan]")
        except Exception as exc:
            log.error("Daily brief error: %s", exc)


async def _event_reminder_loop():
    """
    Every minute, check if any high/medium impact events fall within
    the 5-minute window before an upcoming hour mark.
    Fires a reminder if events are 55–65 minutes away (i.e. ~5 min before next hour).
    """
    while True:
        await asyncio.sleep(60)
        try:
            now = datetime.utcnow()
            # Only fire in the 5-min window before an hour (minute 55–59)
            if now.minute < 55:
                continue
            events = await market_calendar.get_upcoming_events(within_minutes=65)
            if not events:
                continue
            reminder = market_calendar.fmt_event_reminder(events)
            await telegram_bot.notify_event_reminder(reminder)
            terminal.log(f"[yellow]Event reminder sent — {len(events)} upcoming[/yellow]")
        except Exception as exc:
            log.error("Event reminder error: %s", exc)


async def _ai_analysis_loop():
    """Run AI analysis on a configurable interval."""
    global _last_ai_run
    while True:
        now = time.time()
        if now - _last_ai_run >= config.AI_ANALYSIS_INTERVAL:
            try:
                terminal.log("[dim]Running AI analysis…[/dim]")
                recent_arbs = database.get_recent_arbs(hours=1)
                top_wallets = database.get_top_wallets(20)
                insight, new_weights = await ai_agent.run_analysis(top_wallets, recent_arbs)
                if insight:
                    terminal.update("insight", insight)
                    terminal.log("[bold]AI analysis complete[/bold]")
                    await telegram_bot.notify_insight(insight)
                _last_ai_run = now
            except Exception as exc:
                log.error("AI analysis error: %s", exc)
        await asyncio.sleep(60)


# ── Entry point ───────────────────────────────────────────────────────────────

async def run(show_terminal: bool = True):
    """Start all agent components and run indefinitely."""
    log.info("Initialising Polytrader agent…")
    database.init_db()

    terminal.log("Database initialised")
    terminal.log(f"Monitoring up to {config.WALLET_MONITOR_COUNT} wallets")
    terminal.log(f"Copy-trading top {config.COPY_TRADE_MAX_WALLETS} wallets")
    terminal.log(f"Arb threshold: {config.ARB_MIN_PROFIT_PCT*100:.1f}%")

    # Start Telegram bot
    bot_task = asyncio.create_task(telegram_bot.start_bot())

    # Start background loops
    tasks = [
        asyncio.create_task(_arb_scan_loop()),
        asyncio.create_task(_wallet_scan_loop()),
        asyncio.create_task(_copy_trade_loop()),
        asyncio.create_task(_ai_analysis_loop()),
        asyncio.create_task(_forex_scan_loop()),
        asyncio.create_task(_daily_brief_loop()),
        asyncio.create_task(_event_reminder_loop()),
        bot_task,
    ]

    if show_terminal:
        # Terminal runs in a task while everything else runs concurrently
        terminal_task = asyncio.create_task(terminal.run())
        tasks.append(terminal_task)

    try:
        await asyncio.gather(*tasks)
    except (KeyboardInterrupt, asyncio.CancelledError):
        log.info("Shutting down…")
    finally:
        for t in tasks:
            t.cancel()
        await api_client.close_session()
        await telegram_bot.stop_bot()
