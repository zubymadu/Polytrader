"""Scans Polymarket markets for pricing inefficiencies."""
import asyncio
import logging
from typing import Callable, Awaitable
from datetime import datetime

from ..models import Market, ArbOpportunity
from ..api import client
from .. import config, database

log = logging.getLogger(__name__)


def _parse_market(raw: dict) -> Market | None:
    """Convert Gamma API market dict → Market model."""
    try:
        tokens = raw.get("tokens", [])
        if len(tokens) < 2:
            return None
        # Gamma returns tokens as [{outcome:"Yes", token_id:"..."}, ...]
        yes_token = next((t for t in tokens if t.get("outcome", "").lower() == "yes"), None)
        no_token  = next((t for t in tokens if t.get("outcome", "").lower() == "no"),  None)
        if not yes_token or not no_token:
            return None

        return Market(
            id=raw.get("id", raw.get("conditionId", "")),
            question=raw.get("question", "")[:120],
            yes_token_id=yes_token["token_id"],
            no_token_id=no_token["token_id"],
            yes_price=float(yes_token.get("price", 0)),
            no_price=float(no_token.get("price", 0)),
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
