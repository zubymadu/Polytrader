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

    return json.dumps({
        "timestamp": datetime.utcnow().isoformat(),
        "monitored_wallets": database.get_wallet_count(),
        "top_wallets": wallet_summary,
        "recent_arb_opportunities": arb_summary,
        "open_copy_trades": len(open_copies),
        "current_score_weights": current_weights,
    }, indent=2)


async def run_analysis(
    top_wallets: list[WalletStats],
    recent_arbs: list[dict],
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
    context = _build_context(top_wallets, recent_arbs, open_copies, current_weights)
    prev_insights = database.get_recent_insights(3)

    system = (
        "You are Polytrader's AI agent. You analyse Polymarket wallet performance data "
        "and arbitrage opportunities, then:\n"
        "1. Update wallet scoring weights (must sum to 1.0) if the current allocation "
        "isn't selecting the best performers.\n"
        "2. Write a concise insight paragraph (≤120 words) highlighting:\n"
        "   - Which wallet behaviours correlate with highest ROI\n"
        "   - Quality of current arb opportunities\n"
        "   - Any pattern shifts worth watching\n\n"
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
