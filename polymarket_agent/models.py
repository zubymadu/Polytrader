from dataclasses import dataclass, field
from typing import Optional
from datetime import datetime


@dataclass
class Market:
    id: str
    question: str
    yes_token_id: str
    no_token_id: str
    yes_price: float = 0.0
    no_price: float = 0.0
    volume_24h: float = 0.0
    liquidity: float = 0.0
    end_date: Optional[str] = None
    active: bool = True

    @property
    def spread(self) -> float:
        """YES + NO price sum. Efficient market = 1.0."""
        return self.yes_price + self.no_price

    @property
    def arb_profit_pct(self) -> float:
        """
        >1.0: sell both (overpriced) → collect spread − $1
        <1.0: buy both (underpriced) → guaranteed $1 payout, paid spread
        """
        return abs(self.spread - 1.0)

    @property
    def arb_direction(self) -> str:
        if self.spread > 1.0:
            return "SELL_BOTH"
        elif self.spread < 1.0:
            return "BUY_BOTH"
        return "NONE"


@dataclass
class ArbOpportunity:
    market: Market
    profit_pct: float
    direction: str          # BUY_BOTH | SELL_BOTH
    yes_price: float
    no_price: float
    estimated_size: float   # $ liquidity available
    discovered_at: datetime = field(default_factory=datetime.utcnow)


@dataclass
class Trade:
    wallet: str
    market_id: str
    side: str               # BUY_YES | BUY_NO | SELL_YES | SELL_NO
    size: float             # USDC
    price: float
    timestamp: datetime
    tx_hash: str = ""
    outcome: Optional[str] = None   # WIN | LOSS | OPEN
    pnl: Optional[float] = None


@dataclass
class WalletStats:
    address: str
    total_trades: int = 0
    winning_trades: int = 0
    total_volume: float = 0.0
    realized_pnl: float = 0.0
    roi_30d: float = 0.0
    win_rate: float = 0.0
    avg_position_size: float = 0.0
    timing_alpha: float = 0.0       # positive = gets in before price moves
    arb_specialization: float = 0.0
    score: float = 0.0
    is_copied: bool = False
    last_seen: Optional[datetime] = None
    recent_trades: list = field(default_factory=list)


@dataclass
class CopyTrade:
    source_wallet: str
    market_id: str
    side: str
    size: float
    entry_price: float
    opened_at: datetime = field(default_factory=datetime.utcnow)
    closed_at: Optional[datetime] = None
    exit_price: Optional[float] = None
    pnl: Optional[float] = None
    status: str = "OPEN"    # OPEN | CLOSED | CANCELLED
