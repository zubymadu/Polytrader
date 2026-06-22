"""
Telegram bot — sends trade signals and alerts, accepts control commands.
Runs in its own asyncio task alongside the main agent loop.
"""
import asyncio
import logging
from datetime import datetime

from telegram import Update, Bot
from telegram.ext import Application, CommandHandler, ContextTypes
from telegram.error import TelegramError

from . import config, database
from .models import ArbOpportunity, CopyTrade, WalletStats
from .engine.forex_scanner import ForexSignal

log = logging.getLogger(__name__)

_app: Application | None = None
_bot: Bot | None = None


# ── Formatting helpers ─────────────────────────────────────────────────────────

def _pct(v: float) -> str:
    return f"{v*100:.2f}%"


def _fmt_arb(opp: ArbOpportunity) -> str:
    direction_emoji = "📈" if opp.direction == "BUY_BOTH" else "📉"
    return (
        f"{direction_emoji} *ARB FOUND* ({_pct(opp.profit_pct)} profit)\n"
        f"Market: _{opp.market.question[:80]}_\n"
        f"YES: `{opp.yes_price:.4f}` | NO: `{opp.no_price:.4f}`\n"
        f"Direction: `{opp.direction}`\n"
        f"Liquidity: `${opp.estimated_size:,.0f}`\n"
        f"Spread: `{opp.yes_price + opp.no_price:.4f}`"
    )


def _fmt_copy(ct: CopyTrade) -> str:
    side_emoji = "🟢" if "BUY" in ct.side else "🔴"
    return (
        f"{side_emoji} *COPY TRADE*\n"
        f"Source: `{ct.source_wallet[:10]}…`\n"
        f"Action: `{ct.side}` | Size: `${ct.size:.2f}`\n"
        f"Entry: `{ct.entry_price:.4f}`\n"
        f"Market: `{ct.market_id[:20]}…`"
    )


# ── Command handlers ───────────────────────────────────────────────────────────

async def _cmd_start(update: Update, ctx: ContextTypes.DEFAULT_TYPE):
    await update.message.reply_text(
        "🤖 *Polytrader Agent online*\n\n"
        "Commands:\n"
        "/status — Agent overview\n"
        "/top — Top 10 wallets by score\n"
        "/arbs — Recent arb opportunities\n"
        "/copies — Open copy trades\n"
        "/insight — Latest AI analysis",
        parse_mode="Markdown",
    )


async def _cmd_status(update: Update, ctx: ContextTypes.DEFAULT_TYPE):
    wallet_count = database.get_wallet_count()
    top = database.get_top_wallets(5)
    copied = sum(1 for w in top if w.is_copied)
    open_ct = len(database.get_open_copy_trades())
    recent_arbs = database.get_recent_arbs(hours=1, limit=5)

    text = (
        f"📊 *Polytrader Status*\n"
        f"Wallets monitored: `{wallet_count}`\n"
        f"Copy-trading: `{copied}` wallets\n"
        f"Open copy trades: `{open_ct}`\n"
        f"Arbs (last 1h): `{len(recent_arbs)}`"
    )
    await update.message.reply_text(text, parse_mode="Markdown")


async def _cmd_top(update: Update, ctx: ContextTypes.DEFAULT_TYPE):
    wallets = database.get_top_wallets(10)
    if not wallets:
        await update.message.reply_text("No wallet data yet.")
        return
    lines = ["🏆 *Top Wallets by Score*\n"]
    for i, w in enumerate(wallets, 1):
        copied = "🔴" if w.is_copied else "⚪"
        lines.append(
            f"{i}. {copied} `{w.address[:10]}…` "
            f"Score: `{w.score:.1f}` | WR: `{w.win_rate*100:.0f}%` | "
            f"ROI: `{w.roi_30d:.1f}%`"
        )
    await update.message.reply_text("\n".join(lines), parse_mode="Markdown")


async def _cmd_arbs(update: Update, ctx: ContextTypes.DEFAULT_TYPE):
    arbs = database.get_recent_arbs(hours=6, limit=5)
    if not arbs:
        await update.message.reply_text("No arb opportunities found in the last 6 hours.")
        return
    lines = ["📈 *Recent Arb Opportunities*\n"]
    for a in arbs:
        lines.append(
            f"• `{a['direction']}` {a['profit_pct']*100:.2f}% — _{a['question'][:60]}_"
        )
    await update.message.reply_text("\n".join(lines), parse_mode="Markdown")


async def _cmd_copies(update: Update, ctx: ContextTypes.DEFAULT_TYPE):
    copies = database.get_open_copy_trades()
    if not copies:
        await update.message.reply_text("No open copy trades.")
        return
    lines = [f"📋 *Open Copy Trades ({len(copies)})*\n"]
    for c in copies[:8]:
        lines.append(
            f"• `{c['side']}` ${c['size']:.2f} from `{c['source_wallet'][:10]}…` "
            f"@ {c['entry_price']:.4f}"
        )
    await update.message.reply_text("\n".join(lines), parse_mode="Markdown")


async def _cmd_insight(update: Update, ctx: ContextTypes.DEFAULT_TYPE):
    insights = database.get_recent_insights(1)
    if not insights:
        await update.message.reply_text("No AI insights yet. Analysis runs every 15 minutes.")
        return
    await update.message.reply_text(
        f"🧠 *Latest AI Insight*\n\n{insights[0]}", parse_mode="Markdown"
    )


# ── Public API ─────────────────────────────────────────────────────────────────

async def send_message(text: str):
    """Send an unsolicited message to the configured chat."""
    if not config.TELEGRAM_BOT_TOKEN or not config.TELEGRAM_CHAT_ID:
        return
    global _bot
    try:
        if _bot is None:
            _bot = Bot(token=config.TELEGRAM_BOT_TOKEN)
        await _bot.send_message(
            chat_id=config.TELEGRAM_CHAT_ID,
            text=text,
            parse_mode="Markdown",
        )
    except TelegramError as exc:
        log.warning("Telegram send failed: %s", exc)


async def notify_arb(opp: ArbOpportunity):
    await send_message(_fmt_arb(opp))


async def notify_copy(ct: CopyTrade):
    await send_message(_fmt_copy(ct))


async def notify_insight(text: str):
    await send_message(f"🧠 *AI Insight*\n\n{text}")


def _fmt_forex(sig: ForexSignal) -> str:
    emoji = "🟡📈" if sig.direction == "BUY" else "🟡📉"
    stars = "⭐" * max(1, round(sig.confidence * 5))
    lines = [
        f"{emoji} *XAUUSD {sig.direction} SIGNAL* {stars}",
        f"Price: `${sig.price:,.2f}` | Confidence: `{sig.confidence*100:.0f}%` | TF: `{sig.timeframe}`",
        "",
        "*Reasons:*",
    ]
    for r in sig.reasons:
        lines.append(f"• {r}")
    if sig.news_headline:
        lines.append(f"\n📰 _{sig.news_headline}_")
    lines.append(f"\n⏱ {sig.generated_at.strftime('%H:%M UTC')}")
    return "\n".join(lines)


async def notify_forex(sig: ForexSignal):
    await send_message(_fmt_forex(sig))


async def _cmd_gold(update: Update, ctx: ContextTypes.DEFAULT_TYPE):
    from .engine.forex_scanner import scan_xauusd
    await update.message.reply_text("⏳ Running XAUUSD scan…")
    sig = await scan_xauusd()
    if sig:
        await update.message.reply_text(_fmt_forex(sig), parse_mode="Markdown")
    else:
        await update.message.reply_text("No signal at this time (confidence too low).")


async def start_bot():
    """Build and start the Telegram bot in polling mode."""
    if not config.TELEGRAM_BOT_TOKEN:
        log.warning("TELEGRAM_BOT_TOKEN not set — bot disabled.")
        return

    global _app
    _app = (
        Application.builder()
        .token(config.TELEGRAM_BOT_TOKEN)
        .build()
    )
    _app.add_handler(CommandHandler("start",   _cmd_start))
    _app.add_handler(CommandHandler("status",  _cmd_status))
    _app.add_handler(CommandHandler("top",     _cmd_top))
    _app.add_handler(CommandHandler("arbs",    _cmd_arbs))
    _app.add_handler(CommandHandler("copies",  _cmd_copies))
    _app.add_handler(CommandHandler("insight", _cmd_insight))
    _app.add_handler(CommandHandler("gold",    _cmd_gold))

    await _app.initialize()
    await _app.start()
    await _app.updater.start_polling(drop_pending_updates=True)
    log.info("Telegram bot started.")


async def stop_bot():
    if _app:
        await _app.updater.stop()
        await _app.stop()
        await _app.shutdown()
