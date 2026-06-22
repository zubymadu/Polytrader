"""Discovers and monitors Polymarket wallets, scoring them for copy-trading."""
import asyncio
import logging
from datetime import datetime, timedelta
from typing import Callable, Awaitable

from ..api import client
from .. import config, database
from ..models import WalletStats, Trade

log = logging.getLogger(__name__)


def _parse_trade(raw: dict, address: str) -> Trade | None:
    try:
        side_raw = (raw.get("side") or raw.get("type") or "").upper()
        outcome = (raw.get("outcome") or "").upper()
        if "YES" in outcome:
            side = f"{side_raw}_YES" if side_raw in ("BUY", "SELL") else "BUY_YES"
        else:
            side = f"{side_raw}_NO" if side_raw in ("BUY", "SELL") else "BUY_NO"

        ts_raw = raw.get("timestamp") or raw.get("createdAt") or ""
        try:
            ts = datetime.fromisoformat(ts_raw.replace("Z", "+00:00"))
        except Exception:
            ts = datetime.utcnow()

        return Trade(
            wallet=address,
            market_id=raw.get("conditionId") or raw.get("market") or raw.get("marketId") or "",
            side=side,
            size=float(raw.get("size") or raw.get("usdcSize") or raw.get("amount") or 0),
            price=float(raw.get("price") or raw.get("avgPrice") or 0),
            timestamp=ts,
            tx_hash=raw.get("transactionHash") or raw.get("txHash") or "",
            outcome=None,
            pnl=None,
        )
    except Exception as exc:
        log.debug("parse_trade error: %s", exc)
        return None


def _score_wallet(ws: WalletStats, weights: dict) -> float:
    if ws.total_trades < 3:
        return 0.0

    win_rate_norm = ws.win_rate                              # 0-1
    roi_norm = min(max(ws.roi_30d / 100, -1.0), 3.0) / 3.0 # cap at 300% ROI
    trade_norm = min(ws.total_trades / 200, 1.0)
    consistency_norm = min(ws.avg_position_size / 500, 1.0)
    timing_norm = min(max(ws.timing_alpha + 0.5, 0), 1.0)
    arb_norm = ws.arb_specialization

    score = (
        weights.get("win_rate", 0.30) * win_rate_norm
        + weights.get("roi_30d", 0.25) * roi_norm
        + weights.get("trade_count", 0.10) * trade_norm
        + weights.get("avg_position_size_consistency", 0.10) * consistency_norm
        + weights.get("timing_alpha", 0.15) * timing_norm
        + weights.get("arb_specialization", 0.10) * arb_norm
    )
    return round(score * 100, 2)


async def _analyze_wallet(address: str, weights: dict) -> WalletStats:
    ws = WalletStats(address=address, last_seen=datetime.utcnow())
    activity = await client.fetch_user_activity(address, limit=100)

    trades: list[Trade] = []
    cutoff_30d = datetime.utcnow() - timedelta(days=30)

    for raw in activity:
        t = _parse_trade(raw, address)
        if t and t.size > 0:
            trades.append(t)

    if not trades:
        return ws

    ws.total_trades = len(trades)
    ws.total_volume = sum(t.size for t in trades)
    ws.avg_position_size = ws.total_volume / ws.total_trades

    # PnL estimation: use pnl field if present, otherwise approximate
    pnls = []
    for raw in activity:
        raw_pnl = raw.get("profit") or raw.get("pnl") or raw.get("cashPayout")
        if raw_pnl is not None:
            try:
                pnls.append(float(raw_pnl))
            except (TypeError, ValueError):
                pass

    if pnls:
        ws.realized_pnl = sum(pnls)
        ws.winning_trades = sum(1 for p in pnls if p > 0)
        ws.win_rate = ws.winning_trades / len(pnls)

    # 30d ROI
    recent = [t for t in trades if t.timestamp.replace(tzinfo=None) > cutoff_30d]
    if recent:
        recent_volume = sum(t.size for t in recent)
        recent_pnl = sum(
            float(raw.get("profit") or raw.get("pnl") or 0)
            for raw in activity
            if raw.get("profit") or raw.get("pnl")
        )
        if recent_volume > 0:
            ws.roi_30d = (recent_pnl / recent_volume) * 100

    # Arb specialization: do they often trade YES+NO pairs in same market?
    market_sides: dict[str, set] = {}
    for t in trades:
        market_sides.setdefault(t.market_id, set()).add(t.side)
    arb_count = sum(
        1 for sides in market_sides.values()
        if any("YES" in s for s in sides) and any("NO" in s for s in sides)
    )
    ws.arb_specialization = arb_count / max(len(market_sides), 1)

    ws.recent_trades = trades[:10]
    ws.score = _score_wallet(ws, weights)
    return ws


async def discover_wallets(max_wallets: int = 1000) -> list[str]:
    """
    Build a list of active wallets by:
    1. Querying the leaderboard
    2. Sampling recent traders from popular markets
    """
    addresses: set[str] = set()

    # Recent traders (replaces defunct leaderboard endpoint)
    lb = await client.fetch_leaderboard(limit=500)
    for entry in lb:
        addr = entry.get("proxyWallet") or entry.get("address") or entry.get("user") or ""
        if addr:
            addresses.add(addr)
    log.info("Discovered %d wallets from leaderboard", len(addresses))

    # Sample from active markets
    raw_markets = await client.fetch_all_active_markets(50)
    for raw in raw_markets[:20]:
        market_id = raw.get("id") or raw.get("conditionId") or ""
        if market_id:
            traders = await client.fetch_recent_traders(market_id, limit=50)
            addresses.update(traders)
            await asyncio.sleep(0.2)

    log.info("Total discovered wallets: %d", len(addresses))
    return list(addresses)[:max_wallets]


async def scan_wallets(
    addresses: list[str] | None = None,
    on_wallet_scored: Callable[[WalletStats], Awaitable[None]] | None = None,
) -> list[WalletStats]:
    """Score all monitored wallets and persist results."""
    weights = database.get_score_weights()

    if addresses is None:
        addresses = await discover_wallets(config.WALLET_MONITOR_COUNT)

    log.info("Scanning %d wallets…", len(addresses))

    results: list[WalletStats] = []
    # Process in batches of 10 (rate-limit-friendly)
    batch_size = 10
    for i in range(0, len(addresses), batch_size):
        batch = addresses[i : i + batch_size]
        scored = await asyncio.gather(*[_analyze_wallet(addr, weights) for addr in batch])
        for ws in scored:
            database.upsert_wallet(ws)
            results.append(ws)
            if on_wallet_scored and ws.score > 0:
                await on_wallet_scored(ws)
        await asyncio.sleep(0.5)

    results.sort(key=lambda w: w.score, reverse=True)
    return results
