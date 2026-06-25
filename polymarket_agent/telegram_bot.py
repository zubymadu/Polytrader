"""
Telegram bot — sends trade signals and alerts, accepts control commands.
Runs in its own asyncio task alongside the main agent loop.
"""
import asyncio
import logging
from datetime import datetime

from telegram import Update, Bot, InlineKeyboardButton, InlineKeyboardMarkup
from telegram.ext import Application, CommandHandler, CallbackQueryHandler, ContextTypes
from telegram.error import TelegramError

from . import config, database
from .models import ArbOpportunity, CopyTrade, WalletStats
from .engine.forex_scanner import ForexSignal, scan_xauusd, scan_us30, scan_btcusd

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
    keyboard = [
        [
            InlineKeyboardButton("📊 Status",       callback_data="status"),
            InlineKeyboardButton("🏆 Top Wallets",  callback_data="top"),
        ],
        [
            InlineKeyboardButton("📈 Arb Opps",     callback_data="arbs"),
            InlineKeyboardButton("📋 Copy Trades",  callback_data="copies"),
        ],
        [
            InlineKeyboardButton("🧠 AI Insight",   callback_data="insight"),
            InlineKeyboardButton("🟡 Gold Signal",  callback_data="gold"),
        ],
        [
            InlineKeyboardButton("📉 US30 Signal",  callback_data="us30"),
            InlineKeyboardButton("₿ BTC Signal",    callback_data="btc"),
        ],
    ]
    await update.message.reply_text(
        "🤖 *Polytrader AI Agent*\n"
        "━━━━━━━━━━━━━━━━━━━━\n"
        "Monitoring 1,000 wallets · Scanning 500 markets · XAUUSD signals\n\n"
        "Tap a button or type the command:",
        parse_mode="Markdown",
        reply_markup=InlineKeyboardMarkup(keyboard),
    )


async def _handle_button(update: Update, ctx: ContextTypes.DEFAULT_TYPE):
    """Route inline button presses to the matching command handler."""
    query = update.callback_query
    await query.answer()

    # Create a fake Update-like context so we can reuse command handlers
    class _FakeMsg:
        async def reply_text(self, text, **kwargs):
            await query.message.reply_text(text, **kwargs)

    class _FakeUpdate:
        message = _FakeMsg()

    fake = _FakeUpdate()
    handlers = {
        "status":  _cmd_status,
        "top":     _cmd_top,
        "arbs":    _cmd_arbs,
        "copies":  _cmd_copies,
        "insight": _cmd_insight,
        "gold":    _cmd_gold,
        "us30":    _cmd_us30,
        "btc":     _cmd_btc,
    }
    handler = handlers.get(query.data)
    if handler:
        await handler(fake, ctx)


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
    await update.message.reply_text(_fmt_insight(insights[0]))


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


def _fmt_insight(text: str) -> str:
    """
    Format AI insight text line-by-line for Telegram readability.
    Splits on sentence boundaries and adds bullet points.
    Sent as plain text (no parse_mode) to avoid markdown parse errors.
    """
    import re
    # Split on sentence endings, semicolons, or existing newlines
    raw = re.split(r'(?<=[.!?])\s+|;\s*|\n+', text.strip())
    lines = [s.strip() for s in raw if s.strip()]

    out = ["🧠 AI Insight", "━━━━━━━━━━━━━━━━━━━━", ""]
    for line in lines:
        # Lines that look like a header (short, no period) get extra spacing
        if len(line) < 60 and not line.endswith("."):
            out.append(f"\n▸ {line}")
        else:
            out.append(f"• {line}")
    out.append(f"\n⏱ {datetime.utcnow().strftime('%H:%M UTC')}")
    return "\n".join(out)


async def notify_insight(text: str):
    if not config.TELEGRAM_BOT_TOKEN or not config.TELEGRAM_CHAT_ID:
        return
    global _bot
    try:
        if _bot is None:
            _bot = Bot(token=config.TELEGRAM_BOT_TOKEN)
        await _bot.send_message(
            chat_id=config.TELEGRAM_CHAT_ID,
            text=_fmt_insight(text),
        )
    except TelegramError as exc:
        log.warning("Telegram send failed: %s", exc)


def _fmt_forex(sig: ForexSignal) -> str:
    emoji = "📈" if sig.direction == "BUY" else "📉"
    stars = "⭐" * max(1, round(sig.confidence * 5))
    action = f"*⬆ BUY {sig.instrument}*" if sig.direction == "BUY" else f"*⬇ SELL {sig.instrument}*"
    lines = [
        f"{emoji} {action} {stars}",
        f"Price: `${sig.price:,.2f}` | Confidence: `{sig.confidence*100:.0f}%` | TF: `{sig.timeframe}`",
    ]

    # S/R levels
    if sig.sr:
        sr = sig.sr
        lines.append("")
        lines.append("*Key Levels*")
        if sr.resistance:
            res_str = "  |  ".join(f"`{v:,.2f}`" for v in sr.resistance)
            lines.append(f"🔴 Resistance: {res_str}")
        lines.append(f"⚪ Pivot: `{sr.pivot:,.2f}`")
        if sr.support:
            sup_str = "  |  ".join(f"`{v:,.2f}`" for v in sr.support)
            lines.append(f"🟢 Support:    {sup_str}")
        lines.append(
            f"📆 Prev Day H/L/C: `{sr.prev_day_high:,.2f}` / `{sr.prev_day_low:,.2f}` / `{sr.prev_day_close:,.2f}`"
        )
        lines.append(f"📅 Week Range: `{sr.week_low:,.2f}` — `{sr.week_high:,.2f}`")

    lines.append("")
    lines.append("*Reasons*")
    for r in sig.reasons:
        lines.append(f"• {r}")
    if sig.news_headline:
        lines.append(f"\n📰 _{sig.news_headline}_")
    lines.append(f"\n⏱ {sig.generated_at.strftime('%H:%M UTC')}")
    return "\n".join(lines)


async def notify_forex(sig: ForexSignal):
    await send_message(_fmt_forex(sig))


async def notify_daily_brief(text: str):
    """Send the 8am daily market brief as plain text (may contain special chars)."""
    if not config.TELEGRAM_BOT_TOKEN or not config.TELEGRAM_CHAT_ID:
        return
    global _bot
    try:
        if _bot is None:
            _bot = Bot(token=config.TELEGRAM_BOT_TOKEN)
        await _bot.send_message(chat_id=config.TELEGRAM_CHAT_ID, text=text)
    except TelegramError as exc:
        log.warning("Telegram daily brief failed: %s", exc)


async def notify_event_reminder(text: str):
    """Send a pre-event reminder as plain text."""
    if not config.TELEGRAM_BOT_TOKEN or not config.TELEGRAM_CHAT_ID:
        return
    global _bot
    try:
        if _bot is None:
            _bot = Bot(token=config.TELEGRAM_BOT_TOKEN)
        await _bot.send_message(chat_id=config.TELEGRAM_CHAT_ID, text=text)
    except TelegramError as exc:
        log.warning("Telegram event reminder failed: %s", exc)


async def notify_breaking_news(headline: str, instruments: list[str]):
    """Send a breaking news flash alert."""
    instr_str = " | ".join(instruments)
    text = (
        f"🚨 *BREAKING NEWS ALERT*\n"
        f"━━━━━━━━━━━━━━━━━━━━\n"
        f"{headline}\n\n"
        f"⚠️ Watch: `{instr_str}` — expect volatility"
    )
    await send_message(text)


async def _cmd_gold(update: Update, ctx: ContextTypes.DEFAULT_TYPE):
    await update.message.reply_text("⏳ Running XAUUSD scan…")
    sig = await scan_xauusd()
    if sig:
        await update.message.reply_text(_fmt_forex(sig), parse_mode="Markdown")
    else:
        await update.message.reply_text("No signal at this time (confidence too low).")


async def _cmd_us30(update: Update, ctx: ContextTypes.DEFAULT_TYPE):
    await update.message.reply_text("⏳ Running US30 scan…")
    sig = await scan_us30()
    if sig:
        await update.message.reply_text(_fmt_forex(sig), parse_mode="Markdown")
    else:
        await update.message.reply_text("No signal at this time (confidence too low).")


async def _cmd_btc(update: Update, ctx: ContextTypes.DEFAULT_TYPE):
    await update.message.reply_text("⏳ Running BTCUSD scan…")
    sig = await scan_btcusd()
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
    _app.add_handler(CommandHandler("us30",    _cmd_us30))
    _app.add_handler(CommandHandler("btc",     _cmd_btc))
    _app.add_handler(CallbackQueryHandler(_handle_button))

    await _app.initialize()
    await _app.start()
    await _app.updater.start_polling(drop_pending_updates=True)
    log.info("Telegram bot started.")


async def stop_bot():
    if _app:
        await _app.updater.stop()
        await _app.stop()
        await _app.shutdown()
