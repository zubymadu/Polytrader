"""
Economic calendar and daily market brief.

Sources (all free, no API key):
  - ForexFactory JSON feed: ff_calendar_thisweek.json
  - Reuters RSS for macro headlines
"""
import asyncio
import logging
from dataclasses import dataclass
from datetime import datetime, timezone, timedelta
from typing import Optional
import aiohttp

log = logging.getLogger(__name__)

FF_CALENDAR_URL = "https://nfs.faireconomy.media/ff_calendar_thisweek.json"

# Impact filter — only HIGH and MEDIUM impact events
HIGH_IMPACT_CURRENCIES = {"USD", "EUR", "GBP", "JPY", "CNY", "CHF"}

# Events that particularly affect our instruments
XAUUSD_TRIGGERS = [
    "cpi", "inflation", "fed", "fomc", "interest rate", "nfp", "non-farm",
    "gdp", "unemployment", "pce", "ppi", "ism", "treasury", "dollar",
    "war", "geopolit", "conflict",
]
US30_TRIGGERS = [
    "fed", "fomc", "interest rate", "gdp", "nfp", "non-farm", "earnings",
    "unemployment", "consumer confidence", "retail sales", "ism", "pmi",
    "cpi", "inflation",
]
BTCUSD_TRIGGERS = [
    "fed", "fomc", "interest rate", "cpi", "inflation", "sec", "etf",
    "crypto", "bitcoin", "regulation", "gdp",
]


@dataclass
class EconomicEvent:
    time_utc: datetime
    currency: str
    impact: str          # High | Medium | Low
    title: str
    forecast: str
    previous: str
    affects: list[str]   # instruments this event likely affects


async def fetch_events() -> list[EconomicEvent]:
    """Fetch this week's economic calendar from ForexFactory JSON feed."""
    try:
        async with aiohttp.ClientSession(timeout=aiohttp.ClientTimeout(total=10)) as s:
            async with s.get(FF_CALENDAR_URL) as resp:
                if resp.status != 200:
                    log.warning("FF calendar fetch → %d", resp.status)
                    return []
                data = await resp.json(content_type=None)
    except Exception as exc:
        log.warning("FF calendar error: %s", exc)
        return []

    events = []
    for raw in data:
        try:
            impact = raw.get("impact", "Low")
            currency = raw.get("country", "").upper()
            if impact not in ("High", "Medium"):
                continue
            if currency not in HIGH_IMPACT_CURRENCIES:
                continue

            # Parse datetime — FF uses format "01-22-2026T14:30:00"
            dt_str = raw.get("date", "")
            try:
                dt = datetime.strptime(dt_str, "%m-%d-%YT%H:%M:%S").replace(tzinfo=timezone.utc)
            except ValueError:
                continue

            title = raw.get("title", "")
            tl = title.lower()
            affects = []
            if any(k in tl for k in XAUUSD_TRIGGERS):
                affects.append("XAUUSD")
            if any(k in tl for k in US30_TRIGGERS):
                affects.append("US30")
            if any(k in tl for k in BTCUSD_TRIGGERS):
                affects.append("BTCUSD")
            if not affects:
                affects = ["ALL"]

            events.append(EconomicEvent(
                time_utc=dt,
                currency=currency,
                impact=impact,
                title=title,
                forecast=raw.get("forecast", "—"),
                previous=raw.get("previous", "—"),
                affects=affects,
            ))
        except Exception:
            continue

    events.sort(key=lambda e: e.time_utc)
    return events


async def get_todays_events() -> list[EconomicEvent]:
    now = datetime.now(timezone.utc)
    today = now.date()
    all_events = await fetch_events()
    return [e for e in all_events if e.time_utc.date() == today]


async def get_upcoming_events(within_minutes: int = 65) -> list[EconomicEvent]:
    """Events scheduled in the next `within_minutes` minutes."""
    now = datetime.now(timezone.utc)
    cutoff = now + timedelta(minutes=within_minutes)
    all_events = await fetch_events()
    return [e for e in all_events if now <= e.time_utc <= cutoff]


async def _fetch_headlines() -> list[str]:
    """Fetch macro headlines from Reuters RSS."""
    try:
        import re
        async with aiohttp.ClientSession(timeout=aiohttp.ClientTimeout(total=8)) as s:
            async with s.get("https://feeds.reuters.com/reuters/businessNews") as resp:
                if resp.status != 200:
                    return []
                text = await resp.text()
                titles = re.findall(r"<title><!\[CDATA\[(.*?)\]\]></title>", text)
                if not titles:
                    titles = re.findall(r"<title>(.*?)</title>", text)
                return titles[1:8]
    except Exception:
        return []


def fmt_daily_brief(events: list[EconomicEvent], headlines: list[str]) -> str:
    now = datetime.now(timezone.utc)
    lines = [
        "📅 DAILY MARKET BRIEF",
        f"━━━━━━━━━━━━━━━━━━━━",
        f"🕗 {now.strftime('%A, %d %B %Y')} — 08:00 UTC",
        "",
    ]

    if events:
        lines.append("⚡ KEY EVENTS TODAY")
        lines.append("")
        for e in events:
            impact_icon = "🔴" if e.impact == "High" else "🟡"
            instruments = " | ".join(e.affects)
            lines.append(
                f"{impact_icon} {e.time_utc.strftime('%H:%M')} UTC  [{e.currency}]  {e.title}"
            )
            lines.append(
                f"   Forecast: {e.forecast}  |  Previous: {e.previous}  |  Affects: {instruments}"
            )
            lines.append("")
    else:
        lines.append("📭 No high/medium impact events scheduled today.")
        lines.append("")

    if headlines:
        lines.append("📰 OVERNIGHT HEADLINES")
        lines.append("")
        for h in headlines[:5]:
            lines.append(f"• {h[:100]}")
        lines.append("")

    lines.append("━━━━━━━━━━━━━━━━━━━━")
    lines.append("Signals fire automatically. Use /gold /us30 /btc for on-demand scans.")
    return "\n".join(lines)


def fmt_event_reminder(events: list[EconomicEvent]) -> str:
    lines = [
        "⏰ UPCOMING EVENT REMINDER",
        "━━━━━━━━━━━━━━━━━━━━",
        "",
    ]
    for e in events:
        impact_icon = "🔴" if e.impact == "High" else "🟡"
        mins_away = int((e.time_utc - datetime.now(timezone.utc)).total_seconds() / 60)
        lines.append(f"{impact_icon} In ~{mins_away} min  [{e.currency}]  {e.title}")
        lines.append(f"   Forecast: {e.forecast}  |  Previous: {e.previous}")
        instruments = " | ".join(e.affects)
        lines.append(f"   Watch: {instruments}")
        lines.append("")
    lines.append("⚠️ Expect volatility. Tighten stops or stand aside.")
    return "\n".join(lines)
