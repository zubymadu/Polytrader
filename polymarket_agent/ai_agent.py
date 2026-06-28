"""
Claude-powered AI agent that periodically analyses performance data,
updates wallet-scoring weights, and surfaces insights.
"""
import json
import logging
from datetime import datetime

import anthropic

from . import config, database
from .models import WalletStats, ArbOpportunity
from .engine.forex_scanner import ForexSignal
from .engine.market_calendar import EconomicEvent

log = logging.getLogger(__name__)

_client: anthropic.AsyncAnthropic | None = None


def _get_client() -> anthropic.AsyncAnthropic:
    global _client
    if _client is None:
        _client = anthropic.AsyncAnthropic(api_key=config.ANTHROPIC_API_KEY)
    return _client


def _build_context(
    top_wallets: list[WalletStats],
    recent_arbs: list[dict],
    open_copies: list[dict],
    current_weights: dict,
    forex_signals: list[ForexSignal] | None = None,
) -> str:
    wallet_summary = []
    for w in top_wallets[:10]:
        wallet_summary.append({
            "address": w.address[:10] + "…",
            "score": w.score,
            "win_rate": round(w.win_rate * 100, 1),
            "roi_30d": round(w.roi_30d, 1),
            "trades": w.total_trades,
            "arb_spec": round(w.arb_specialization, 2),
        })

    arb_summary = [
        {
            "question": a.get("question", "")[:60],
            "profit_pct": round(a.get("profit_pct", 0) * 100, 2),
            "direction": a.get("direction"),
            "yes_price": a.get("yes_price"),
            "no_price": a.get("no_price"),
        }
        for a in recent_arbs[:10]
    ]

    forex_summary = []
    for sig in (forex_signals or []):
        entry = {
            "instrument": sig.instrument,
            "direction": sig.direction,
            "confidence": sig.confidence,
            "price": sig.price,
            "timeframe": sig.timeframe,
            "reasons": sig.reasons[:4],
        }
        if sig.sr:
            entry["pivot"] = sig.sr.pivot
            entry["resistance"] = sig.sr.resistance[:2]
            entry["support"] = sig.sr.support[:2]
        forex_summary.append(entry)

    return json.dumps({
        "timestamp": datetime.utcnow().isoformat(),
        "monitored_wallets": database.get_wallet_count(),
        "top_wallets": wallet_summary,
        "recent_arb_opportunities": arb_summary,
        "open_copy_trades": len(open_copies),
        "current_score_weights": current_weights,
        "forex_signals": forex_summary,
    }, indent=2)


async def run_analysis(
    top_wallets: list[WalletStats],
    recent_arbs: list[dict],
    forex_signals: list[ForexSignal] | None = None,
) -> tuple[str, dict]:
    """
    Ask Claude to analyse current data and return:
      - insight (str): human-readable summary
      - new_weights (dict): updated scoring weights
    """
    if not config.ANTHROPIC_API_KEY:
        return "AI analysis disabled (no API key).", {}

    open_copies = database.get_open_copy_trades()
    current_weights = database.get_score_weights()
    context = _build_context(top_wallets, recent_arbs, open_copies, current_weights, forex_signals)
    prev_insights = database.get_recent_insights(3)

    system = (
        "You are Polytrader's AI agent. You analyse Polymarket wallet performance, "
        "arbitrage opportunities, and live forex/crypto signals, then:\n"
        "1. Update wallet scoring weights (must sum to 1.0) if the current allocation "
        "isn't selecting the best performers.\n"
        "2. Write a concise insight (≤180 words) covering TWO sections:\n"
        "   POLYMARKET: wallet ROI patterns, arb quality, copy-trade watch.\n"
        "   FOREX: for each instrument in forex_signals, state the direction, "
        "key reason(s), nearest support/resistance, and your bias. "
        "If no signal data, note market is quiet.\n\n"
        "Respond ONLY with valid JSON:\n"
        '{"insight": "...", "weights": {"win_rate":f,"roi_30d":f,"trade_count":f,'
        '"avg_position_size_consistency":f,"timing_alpha":f,"arb_specialization":f}}'
    )

    user = (
        f"Current data snapshot:\n{context}\n\n"
        f"Previous insights (for context, do not repeat):\n"
        + "\n".join(f"- {i[:80]}" for i in prev_insights)
    )

    try:
        ai = _get_client()
        msg = await ai.messages.create(
            model=config.AI_MODEL,
            max_tokens=512,
            system=system,
            messages=[{"role": "user", "content": user}],
        )
        raw = msg.content[0].text.strip()
        # Strip markdown fences if present
        if raw.startswith("```"):
            raw = raw.split("```")[1]
            if raw.startswith("json"):
                raw = raw[4:]
        parsed = json.loads(raw)
        insight = parsed.get("insight", "")
        weights = parsed.get("weights", {})

        # Validate weights sum ≈ 1.0
        if weights and abs(sum(weights.values()) - 1.0) < 0.05:
            database.update_score_weights(weights)
            log.info("AI updated score weights: %s", weights)
        else:
            weights = current_weights

        if insight:
            database.save_insight(insight)
            log.info("AI insight: %s", insight[:80])

        return insight, weights

    except Exception as exc:
        log.error("AI analysis failed: %s", exc)
        return f"Analysis error: {exc}", {}


async def run_weekly_analysis(
    events: list[EconomicEvent],
    forex_signals: list[ForexSignal],
) -> str:
    """
    Generate a deep weekly outlook for XAUUSD, US30, and BTCUSD covering:
    - Fundamental drivers for the week ahead (events, macro context)
    - Technical bias (current signal direction, key S/R)
    - Trade plan: key levels to watch, potential setups
    """
    if not config.ANTHROPIC_API_KEY:
        return ""

    events_text = "\n".join(
        f"- {e.time_utc.strftime('%a %d %b %H:%M')} UTC  [{e.currency}] {e.title} "
        f"(Forecast: {e.forecast}, Prev: {e.previous}, Impact: {e.impact})"
        for e in events
    ) or "No major events on the calendar."

    signals_text = ""
    for sig in forex_signals:
        signals_text += (
            f"\n{sig.instrument}: {sig.direction} | Conf: {sig.confidence:.0%} | "
            f"Price: {sig.price:,.2f} | TF: {sig.timeframe}\n"
            f"  Reasons: {'; '.join(sig.reasons[:3])}\n"
        )
        if sig.sr:
            signals_text += (
                f"  Pivot: {sig.sr.pivot:,.2f} | "
                f"R: {sig.sr.resistance[:2]} | S: {sig.sr.support[:2]}\n"
            )
    if not signals_text:
        signals_text = "No active signals at time of analysis."

    system = (
        "You are a professional forex and markets analyst. "
        "Write a structured weekly outlook for traders covering XAUUSD (Gold), US30 (Dow Jones), "
        "and BTCUSD (Bitcoin). Be specific and actionable. Use plain text — no markdown symbols.\n\n"
        "Structure:\n"
        "WEEKLY OUTLOOK — [date range]\n\n"
        "MACRO THEMES\n"
        "2-3 sentences on the dominant macro narrative for the week.\n\n"
        "XAUUSD (Gold)\n"
        "Fundamental: key drivers this week (Fed policy, DXY, geopolitics, inflation data)\n"
        "Technical: bias, key levels to watch, potential entry zones\n"
        "Events: relevant calendar events and expected impact\n\n"
        "US30 (Dow Jones)\n"
        "Same structure.\n\n"
        "BTCUSD (Bitcoin)\n"
        "Same structure. Include macro correlation and any crypto-specific drivers.\n\n"
        "RISK EVENTS\n"
        "Top 3 events most likely to cause sharp moves this week.\n\n"
        "Keep the total under 400 words. Be direct — state bias clearly."
    )

    user = (
        f"Economic calendar for the week:\n{events_text}\n\n"
        f"Current technical signals:\n{signals_text}\n\n"
        f"Today is Sunday. Write the weekly outlook for the week ahead."
    )

    try:
        ai = _get_client()
        msg = await ai.messages.create(
            model=config.AI_MODEL,
            max_tokens=1024,
            system=system,
            messages=[{"role": "user", "content": user}],
        )
        return msg.content[0].text.strip()
    except Exception as exc:
        log.error("Weekly analysis failed: %s", exc)
        return ""
