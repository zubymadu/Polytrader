"""Async Polymarket API client (CLOB + Gamma + Data APIs)."""
import asyncio
import logging
from typing import Any, Optional
import aiohttp

from .. import config

log = logging.getLogger(__name__)

_session: Optional[aiohttp.ClientSession] = None

HEADERS = {"Accept": "application/json", "User-Agent": "Polytrader/1.0"}


async def get_session() -> aiohttp.ClientSession:
    global _session
    if _session is None or _session.closed:
        timeout = aiohttp.ClientTimeout(total=15)
        _session = aiohttp.ClientSession(headers=HEADERS, timeout=timeout)
    return _session


async def close_session():
    global _session
    if _session and not _session.closed:
        await _session.close()


async def _get(url: str, params: dict = None) -> Any:
    session = await get_session()
    try:
        async with session.get(url, params=params) as resp:
            if resp.status == 200:
                return await resp.json()
            log.warning("GET %s → %d", url, resp.status)
            return None
    except Exception as exc:
        log.debug("GET %s error: %s", url, exc)
        return None


# ── Gamma API ─────────────────────────────────────────────────────────────────

async def fetch_active_markets(limit: int = 100, offset: int = 0) -> list[dict]:
    data = await _get(
        f"{config.GAMMA_URL}/markets",
        params={"limit": limit, "offset": offset, "active": "true", "closed": "false"},
    )
    if isinstance(data, list):
        return data
    if isinstance(data, dict):
        return data.get("markets", [])
    return []


async def fetch_all_active_markets(max_markets: int = 500) -> list[dict]:
    """Page through Gamma API to collect up to max_markets active markets."""
    markets = []
    offset = 0
    batch = 100
    while len(markets) < max_markets:
        page = await fetch_active_markets(limit=batch, offset=offset)
        if not page:
            break
        markets.extend(page)
        if len(page) < batch:
            break
        offset += batch
        await asyncio.sleep(0.3)  # be polite
    return markets[:max_markets]


# ── CLOB API ──────────────────────────────────────────────────────────────────

async def fetch_midpoint(token_id: str) -> Optional[float]:
    data = await _get(f"{config.CLOB_URL}/midpoint", params={"token_id": token_id})
    if data:
        try:
            return float(data.get("mid", 0))
        except (TypeError, ValueError):
            pass
    return None


async def fetch_best_price(token_id: str, side: str = "buy") -> Optional[float]:
    """side: 'buy' or 'sell'"""
    data = await _get(
        f"{config.CLOB_URL}/price", params={"token_id": token_id, "side": side}
    )
    if data:
        try:
            return float(data.get("price", 0))
        except (TypeError, ValueError):
            pass
    return None


async def fetch_order_book(token_id: str) -> Optional[dict]:
    return await _get(f"{config.CLOB_URL}/book", params={"token_id": token_id})


async def fetch_token_prices(yes_id: str, no_id: str) -> tuple[float, float]:
    """Return (yes_price, no_price) — buy-side midpoints."""
    yes, no = await asyncio.gather(
        fetch_midpoint(yes_id),
        fetch_midpoint(no_id),
    )
    return (yes or 0.0, no or 0.0)


# ── Data API ──────────────────────────────────────────────────────────────────

async def fetch_user_activity(address: str, limit: int = 100) -> list[dict]:
    data = await _get(
        f"{config.DATA_URL}/activity",
        params={"user": address, "limit": limit},
    )
    if isinstance(data, list):
        return data
    if isinstance(data, dict):
        return data.get("history", data.get("data", []))
    return []


async def fetch_user_positions(address: str) -> list[dict]:
    data = await _get(
        f"{config.DATA_URL}/positions",
        params={"user": address},
    )
    if isinstance(data, list):
        return data
    if isinstance(data, dict):
        return data.get("positions", data.get("data", []))
    return []


async def fetch_leaderboard(limit: int = 200) -> list[dict]:
    """Fetch top traders from the Data API leaderboard."""
    for window in ("monthly", "weekly", "allTime"):
        data = await _get(
            f"{config.DATA_URL}/leaderboard",
            params={"limit": limit, "window": window},
        )
        if isinstance(data, list) and data:
            return data
        if isinstance(data, dict):
            entries = data.get("leaderboard", data.get("data", data.get("entries", [])))
            if entries:
                return entries
    return []


async def fetch_recent_traders(market_id: str, limit: int = 50) -> list[str]:
    """Return wallet addresses that traded in a given market recently."""
    data = await _get(
        f"{config.DATA_URL}/trades",
        params={"market": market_id, "limit": limit},
    )
    trades = []
    if isinstance(data, list):
        trades = data
    elif isinstance(data, dict):
        trades = data.get("trades", data.get("data", []))
    addresses = []
    seen = set()
    for t in trades:
        addr = t.get("maker") or t.get("taker") or t.get("user") or ""
        if addr and addr not in seen:
            seen.add(addr)
            addresses.append(addr)
    return addresses
