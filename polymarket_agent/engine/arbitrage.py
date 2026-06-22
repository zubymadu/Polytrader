"""Scans Polymarket markets for pricing inefficiencies."""
import asyncio
import json
import logging
from typing import Callable, Awaitable
from datetime import datetime

from ..models import Market, ArbOpportunity
from ..api import client
from .. import config, database

log = logging.getLogger(__name__)


def _parse_market(raw: dict) -> Market | None:
    """Convert Gamma API market dict → Market model.

    Gamma API returns two possible shapes:
      A) tokens: [{outcome:"Yes", token_id:"..."}, {outcome:"No", token_id:"..."}]
      B) clobTokenIds: ["yes_id", "no_id"], outcomes: ["Yes","No"], outcomePrices: ["0.5","0.5"]
    """
    try:
        yes_token_id = no_token_id = ""
        yes_price = no_price = 0.0

        def _parse_json_field(val):
            if isinstance(val, str):
                try:
                    return json.loads(val)
                except Exception:
                    return []
            return val or []

        tokens = _parse_json_field(raw.get("tokens", []))
        clob_ids = _parse_json_field(raw.get("clobTokenIds", []))
        outcomes = _parse_json_field(raw.get("outcomes", []))
        outcome_prices = _parse_json_field(raw.get("outcomePrices", []))

        if tokens and len(tokens) >= 2:
            # Shape A
            yes_t = next((t for t in tokens if t.get("outcome", "").lower() == "yes"), None)
            no_t  = next((t for t in tokens if t.get("outcome", "").lower() == "no"),  None)
            if not yes_t or not no_t:
                return None
            yes_token_id = yes_t.get("token_id") or yes_t.get("tokenId") or ""
            no_token_id  = no_t.get("token_id")  or no_t.get("tokenId")  or ""
            yes_price = float(yes_t.get("price", 0) or 0)
            no_price  = float(no_t.get("price", 0)  or 0)
        elif clob_ids and len(clob_ids) >= 2 and outcomes and len(outcomes) >= 2:
            # Shape B — map by index
            for i, outcome in enumerate(outcomes):
                if outcome.lower() == "yes":
                    yes_token_id = clob_ids[i] if i < len(clob_ids) else ""
                    yes_price = float(outcome_prices[i]) if i < len(outcome_prices) else 0.0
                elif outcome.lower() == "no":
                    no_token_id = clob_ids[i] if i < len(clob_ids) else ""
                    no_price = float(outcome_prices[i]) if i < len(outcome_prices) else 0.0
        else:
            return None

        if not yes_token_id or not no_token_id:
            return None

        return Market(
            id=raw.get("id", raw.get("conditionId", "")),
            question=raw.get("question", "")[:120],
            yes_token_id=yes_token_id,
            no_token_id=no_token_id,
            yes_price=yes_price,
            no_price=no_price,
            volume_24h=float(raw.get("volume24hr", raw.get("volumeClob", 0)) or 0),
            liquidity=float(raw.get("liquidity", 0) or 0),
            end_date=raw.get("endDateIso", raw.get("endDate", "")),
            active=raw.get("active", True),
        )
    except Exception as exc:
        log.debug("parse_market error: %s", exc)
        return None


async def _enrich_prices(market: Market) -> Market:
    """Fetch live CLOB midpoint prices for both tokens."""
    yes_p, no_p = await client.fetch_token_prices(
        market.yes_token_id, market.no_token_id
    )
    if yes_p > 0:
        market.yes_price = yes_p
    if no_p > 0:
        market.no_price = no_p
    return market


async def scan_markets(
    on_opportunity: Callable[[ArbOpportunity], Awaitable[None]] | None = None,
    max_markets: int = 500,
) -> list[ArbOpportunity]:
    """
    Fetch all active markets, enrich with live prices, and return any that
    exceed the configured arbitrage profit threshold.
    """
    log.info("Arbitrage scan starting (max %d markets)…", max_markets)
    raw_markets = await client.fetch_all_active_markets(max_markets)
    log.info("Fetched %d raw markets from Gamma API", len(raw_markets))

    markets = [m for raw in raw_markets if (m := _parse_market(raw))]

    # Enrich prices in parallel batches of 20
    enriched: list[Market] = []
    batch_size = 20
    for i in range(0, len(markets), batch_size):
        batch = markets[i : i + batch_size]
        results = await asyncio.gather(*[_enrich_prices(m) for m in batch])
        enriched.extend(results)
        await asyncio.sleep(0.2)

    opportunities: list[ArbOpportunity] = []
    for m in enriched:
        if m.yes_price <= 0 or m.no_price <= 0:
            continue
        profit = m.arb_profit_pct
        if profit >= config.ARB_MIN_PROFIT_PCT:
            size = min(m.liquidity, 10_000)  # cap for display
            opp = ArbOpportunity(
                market=m,
                profit_pct=profit,
                direction=m.arb_direction,
                yes_price=m.yes_price,
                no_price=m.no_price,
                estimated_size=size,
                discovered_at=datetime.utcnow(),
            )
            opportunities.append(opp)
            database.save_arb(opp)
            if on_opportunity:
                await on_opportunity(opp)

    opportunities.sort(key=lambda o: o.profit_pct, reverse=True)
    log.info(
        "Arb scan complete: %d markets, %d opportunities", len(enriched), len(opportunities)
    )
    return opportunities
