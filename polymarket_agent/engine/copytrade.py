"""Copy-trading engine — mirrors top wallets' moves."""
import asyncio
import logging
from datetime import datetime
from typing import Callable, Awaitable

from ..models import WalletStats, CopyTrade, Trade
from ..api import client
from .. import config, database

log = logging.getLogger(__name__)

# In-memory state: which trades we've already emitted signals for
_seen_tx: set[str] = set()


def select_copy_wallets(
    all_wallets: list[WalletStats], max_count: int = config.COPY_TRADE_MAX_WALLETS
) -> list[WalletStats]:
    """Pick the top-N wallets by score for copy-trading."""
    eligible = [w for w in all_wallets if w.total_trades >= 5 and w.win_rate >= 0.5]
    selected = sorted(eligible, key=lambda w: w.score, reverse=True)[:max_count]
    return selected


async def _get_new_trades(wallet: WalletStats) -> list[Trade]:
    """Return any trades made since last check that we haven't emitted yet."""
    activity = await client.fetch_user_activity(wallet.address, limit=20)
    new_trades: list[Trade] = []
    for raw in activity:
        tx = raw.get("transactionHash") or raw.get("txHash") or ""
        key = f"{wallet.address}:{tx}"
        if tx and key not in _seen_tx:
            _seen_tx.add(key)
            from .wallet_scanner import _parse_trade
            t = _parse_trade(raw, wallet.address)
            if t and t.size > 0:
                new_trades.append(t)
    return new_trades


async def watch_and_copy(
    wallets: list[WalletStats],
    on_signal: Callable[[CopyTrade], Awaitable[None]] | None = None,
    size_multiplier: float = 0.5,
) -> list[CopyTrade]:
    """
    Poll copy-watched wallets for new trades and emit CopyTrade signals.
    Returns any new copy trades generated this cycle.
    """
    signals: list[CopyTrade] = []
    for wallet in wallets:
        new_trades = await _get_new_trades(wallet)
        for trade in new_trades:
            ct = CopyTrade(
                source_wallet=wallet.address,
                market_id=trade.market_id,
                side=trade.side,
                size=round(trade.size * size_multiplier, 2),
                entry_price=trade.price,
                opened_at=datetime.utcnow(),
                status="OPEN",
            )
            trade_id = database.save_copy_trade(ct)
            log.info(
                "COPY SIGNAL #%d | %s | %s | $%.2f @ %.4f",
                trade_id, wallet.address[:8], ct.side, ct.size, ct.entry_price,
            )
            signals.append(ct)
            if on_signal:
                await on_signal(ct)
        await asyncio.sleep(0.3)
    return signals
