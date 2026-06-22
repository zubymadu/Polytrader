"""
XAUUSD signal scanner.

Signal layers:
  Technical    — RSI(14), MACD, Bollinger Bands
  MA crossover — EMA14(shift=5, close) × LWMA14(HLCC/4) on 5m and 15m  ← primary
               — EMA9/21 (1H intraday), EMA50/200 golden/death cross (4H)
  Price action — London/NY open range break, round-number key levels
  Macro        — DXY correlation proxy
  News         — RSS headline scraping for gold/Fed/war keywords

Primary crossover logic:
  - HLCC/4  = (High + Low + Close + Close) / 4  (weighted close)
  - LWMA14  = linearly weighted MA over HLCC/4, no shift
  - EMA14   = exponential MA over Close, displaced 5 bars forward
  - BUY  when EMA14_shifted crosses above LWMA14
  - SELL when EMA14_shifted crosses below LWMA14
"""
import asyncio
import logging
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Optional

log = logging.getLogger(__name__)

# ── Models ────────────────────────────────────────────────────────────────────

SIGNAL_BUY  = "BUY"
SIGNAL_SELL = "SELL"
SIGNAL_HOLD = "HOLD"


@dataclass
class ForexSignal:
    instrument: str              # e.g. XAUUSD
    direction: str               # BUY | SELL | HOLD
    confidence: float            # 0–1
    price: float
    reasons: list[str]
    timeframe: str               # 1H | 4H | MACRO | NEWS
    generated_at: datetime = field(default_factory=lambda: datetime.now(timezone.utc))
    news_headline: Optional[str] = None


# ── Data fetching ─────────────────────────────────────────────────────────────

async def _fetch_ohlcv(symbol: str, period: str = "5d", interval: str = "1h") -> "pd.DataFrame | None":
    """Fetch OHLCV via yfinance in a thread (blocking call)."""
    try:
        import yfinance as yf
        import pandas as pd
        loop = asyncio.get_event_loop()
        df = await loop.run_in_executor(
            None,
            lambda: yf.download(symbol, period=period, interval=interval,
                                 progress=False, auto_adjust=True)
        )
        if df is None or df.empty:
            return None
        df.columns = [c[0].lower() if isinstance(c, tuple) else c.lower() for c in df.columns]
        return df
    except Exception as exc:
        log.warning("yfinance fetch error (%s %s): %s", symbol, interval, exc)
        return None


async def _fetch_news_headlines() -> list[str]:
    """Scrape gold-related RSS feeds for macro/geopolitical headlines."""
    import aiohttp
    feeds = [
        "https://feeds.reuters.com/reuters/businessNews",
        "https://www.investing.com/rss/news_25.rss",  # commodities
    ]
    headlines = []
    async with aiohttp.ClientSession(timeout=aiohttp.ClientTimeout(total=8)) as session:
        for url in feeds:
            try:
                async with session.get(url) as resp:
                    if resp.status != 200:
                        continue
                    text = await resp.text()
                    # Very lightweight RSS title extraction
                    import re
                    titles = re.findall(r"<title><!\[CDATA\[(.*?)\]\]></title>", text)
                    if not titles:
                        titles = re.findall(r"<title>(.*?)</title>", text)
                    headlines.extend(titles[1:11])  # skip channel title
            except Exception:
                continue
    return headlines


# ── Indicators ────────────────────────────────────────────────────────────────

def _ema(series, span: int):
    return series.ewm(span=span, adjust=False).mean()


def _lwma(series, period: int):
    """Linearly weighted moving average — recent bars get higher weight."""
    weights = range(1, period + 1)   # 1, 2, 3, … period
    def _wma(x):
        if len(x) < period:
            return float("nan")
        return sum(v * w for v, w in zip(x, weights)) / sum(weights)
    return series.rolling(period).apply(_wma, raw=True)


def _displaced_ema(series, span: int, shift: int):
    """EMA shifted `shift` bars into the future (displaces line forward)."""
    return _ema(series, span).shift(-shift)


def _rsi(series, period: int = 14):
    delta = series.diff()
    gain = delta.clip(lower=0).rolling(period).mean()
    loss = (-delta.clip(upper=0)).rolling(period).mean()
    rs = gain / loss.replace(0, 1e-9)
    return 100 - (100 / (1 + rs))


def _macd(series, fast=12, slow=26, signal=9):
    fast_ema = _ema(series, fast)
    slow_ema = _ema(series, slow)
    macd_line = fast_ema - slow_ema
    signal_line = _ema(macd_line, signal)
    histogram = macd_line - signal_line
    return macd_line, signal_line, histogram


def _bollinger(series, period=20, std_dev=2):
    mid = series.rolling(period).mean()
    std = series.rolling(period).std()
    return mid + std_dev * std, mid, mid - std_dev * std


# ── Signal layers ─────────────────────────────────────────────────────────────

# ── Instrument configs ────────────────────────────────────────────────────────

INSTRUMENTS = {
    "XAUUSD": {
        "ticker_5m":  "GC=F",
        "ticker_4h":  "GC=F",
        "key_levels": [2800, 2850, 2900, 2950, 3000, 3050, 3100, 3150,
                       3200, 3250, 3300, 3350, 3400, 3450, 3500],
        "price_fmt":  "${:.2f}",
        "bullish_kw": ["war", "conflict", "attack", "inflation", "rate cut",
                       "fed dovish", "recession", "crisis", "safe haven",
                       "gold surge", "gold rally", "geopolitical", "sanctions",
                       "nuclear", "default"],
        "bearish_kw": ["rate hike", "fed hawkish", "dollar surge", "gold falls",
                       "gold drops", "risk on", "recovery", "strong dollar"],
        "dxy_effect": -1,   # strong USD = bearish
    },
    "US30": {
        "ticker_5m":  "YM=F",   # Dow futures
        "ticker_4h":  "YM=F",
        "key_levels": [39000, 40000, 41000, 42000, 43000, 44000, 45000,
                       46000, 47000, 48000],
        "price_fmt":  "${:,.0f}",
        "bullish_kw": ["rate cut", "fed dovish", "earnings beat", "jobs growth",
                       "gdp growth", "soft landing", "bull market", "stimulus",
                       "recovery", "risk on"],
        "bearish_kw": ["rate hike", "fed hawkish", "recession", "layoffs",
                       "earnings miss", "inflation surge", "bear market",
                       "market crash", "sell off", "downturn"],
        "dxy_effect": 0,    # DXY less relevant for equities
    },
    "BTCUSD": {
        "ticker_5m":  "BTC-USD",
        "ticker_4h":  "BTC-USD",
        "key_levels": [80000, 85000, 90000, 95000, 100000, 105000,
                       110000, 115000, 120000],
        "price_fmt":  "${:,.0f}",
        "bullish_kw": ["bitcoin rally", "crypto surge", "btc all time high",
                       "institutional buy", "etf approval", "halving",
                       "crypto bull", "bitcoin adoption", "rate cut"],
        "bearish_kw": ["bitcoin crash", "crypto crash", "btc sell", "regulation",
                       "crypto ban", "exchange hack", "bitcoin dump",
                       "bear market", "fed hawkish"],
        "dxy_effect": -1,   # strong USD = bearish crypto
    },
}

KEY_LEVELS = INSTRUMENTS["XAUUSD"]["key_levels"]  # backward compat


def _ema14_lwma14_crossover(df, label: str) -> tuple[list[str], float]:
    """
    Primary signal: EMA14(close, shift=5) × LWMA14(HLCC/4, shift=0).
    Returns (reasons, score).  Score ±0.6 — highest weight of all layers.
    """
    if df is None or len(df) < 20:
        return [], 0.0

    hlcc4 = (df["high"] + df["low"] + df["close"] + df["close"]) / 4
    lwma  = _lwma(hlcc4, 14)
    dema  = _displaced_ema(df["close"], 14, 5)

    # Drop NaNs introduced by shift — align on common valid index
    valid = lwma.notna() & dema.notna()
    if valid.sum() < 3:
        return [], 0.0

    lwma_v = lwma[valid]
    dema_v = dema[valid]

    prev_above = dema_v.iloc[-2] > lwma_v.iloc[-2]
    curr_above = dema_v.iloc[-1] > lwma_v.iloc[-1]

    reasons = []
    score   = 0.0

    if not prev_above and curr_above:
        reasons.append(f"EMA14(shift5) crossed ABOVE LWMA14 on {label} — BUY")
        score = +0.6
    elif prev_above and not curr_above:
        reasons.append(f"EMA14(shift5) crossed BELOW LWMA14 on {label} — SELL")
        score = -0.6
    elif curr_above:
        reasons.append(f"EMA14(shift5) > LWMA14 on {label} (uptrend)")
        score = +0.2
    else:
        reasons.append(f"EMA14(shift5) < LWMA14 on {label} (downtrend)")
        score = -0.2

    return reasons, score


def _technical_signals(df) -> tuple[list[str], float]:
    """Returns (reasons, score) where score -1..+1 (negative=bearish)."""
    close = df["close"]
    reasons = []
    score = 0.0

    # RSI
    rsi = _rsi(close).iloc[-1]
    if rsi < 30:
        reasons.append(f"RSI oversold ({rsi:.1f})")
        score += 0.3
    elif rsi > 70:
        reasons.append(f"RSI overbought ({rsi:.1f})")
        score -= 0.3

    # MACD crossover
    macd_line, signal_line, hist = _macd(close)
    prev_hist = hist.iloc[-2]
    curr_hist = hist.iloc[-1]
    if prev_hist < 0 < curr_hist:
        reasons.append("MACD bullish crossover")
        score += 0.3
    elif prev_hist > 0 > curr_hist:
        reasons.append("MACD bearish crossover")
        score -= 0.3

    # Bollinger Bands
    price = close.iloc[-1]
    upper, mid, lower = _bollinger(close)
    if price < lower.iloc[-1]:
        reasons.append(f"Price below lower Bollinger Band (${price:.0f})")
        score += 0.2
    elif price > upper.iloc[-1]:
        reasons.append(f"Price above upper Bollinger Band (${price:.0f})")
        score -= 0.2

    return reasons, score


def _ma_crossover_signals(df_1h, df_4h) -> tuple[list[str], float]:
    """EMA9/21 on 1H and EMA50/200 on 4H."""
    reasons = []
    score = 0.0

    # 1H: EMA9 × EMA21
    if df_1h is not None and len(df_1h) >= 21:
        c = df_1h["close"]
        e9  = _ema(c, 9)
        e21 = _ema(c, 21)
        if e9.iloc[-2] < e21.iloc[-2] and e9.iloc[-1] > e21.iloc[-1]:
            reasons.append("EMA9 crossed above EMA21 (1H bullish)")
            score += 0.25
        elif e9.iloc[-2] > e21.iloc[-2] and e9.iloc[-1] < e21.iloc[-1]:
            reasons.append("EMA9 crossed below EMA21 (1H bearish)")
            score -= 0.25
        elif e9.iloc[-1] > e21.iloc[-1]:
            reasons.append("Price above EMA9/21 (1H uptrend)")
            score += 0.1
        else:
            score -= 0.1

    # 4H: EMA50 × EMA200 (golden/death cross)
    if df_4h is not None and len(df_4h) >= 200:
        c = df_4h["close"]
        e50  = _ema(c, 50)
        e200 = _ema(c, 200)
        if e50.iloc[-2] < e200.iloc[-2] and e50.iloc[-1] > e200.iloc[-1]:
            reasons.append("GOLDEN CROSS: EMA50 crossed above EMA200 (4H)")
            score += 0.5
        elif e50.iloc[-2] > e200.iloc[-2] and e50.iloc[-1] < e200.iloc[-1]:
            reasons.append("DEATH CROSS: EMA50 crossed below EMA200 (4H)")
            score -= 0.5
        elif e50.iloc[-1] > e200.iloc[-1]:
            reasons.append("EMA50 > EMA200 (4H bullish structure)")
            score += 0.15
        else:
            score -= 0.15

    return reasons, score


def _price_action_signals_cfg(df_1h, key_levels: list) -> tuple[list[str], float]:
    """London/NY open range break + round-number proximity."""
    if df_1h is None or df_1h.empty:
        return [], 0.0

    reasons = []
    score = 0.0

    price = df_1h["close"].iloc[-1]

    # Key level proximity (within 0.3%)
    for level in key_levels:
        if abs(price - level) / level < 0.003:
            if price > level:
                reasons.append(f"Just broke above key level ${level}")
                score += 0.2
            else:
                reasons.append(f"Testing key support ${level}")
                score += 0.1
            break

    # London open range (08:00–08:15 UTC) or NY open (13:30–13:45 UTC)
    now_h = datetime.now(timezone.utc).hour
    now_m = datetime.now(timezone.utc).minute
    is_london_open = now_h == 8 and now_m < 30
    is_ny_open     = now_h == 13 and 30 <= now_m < 60

    if is_london_open or is_ny_open:
        session = "London" if is_london_open else "New York"
        # Use previous bar's range as opening range proxy
        if len(df_1h) >= 3:
            prev_high = df_1h["high"].iloc[-3:-1].max()
            prev_low  = df_1h["low"].iloc[-3:-1].min()
            if price > prev_high:
                reasons.append(f"{session} open — bullish range breakout")
                score += 0.3
            elif price < prev_low:
                reasons.append(f"{session} open — bearish range breakdown")
                score -= 0.3

    return reasons, score


def _macro_signals(df_dxy) -> tuple[list[str], float]:
    """DXY proxy: strong USD = bearish gold."""
    if df_dxy is None or df_dxy.empty:
        return [], 0.0

    reasons = []
    score = 0.0

    close = df_dxy["close"]
    dxy_change_pct = (close.iloc[-1] - close.iloc[-2]) / close.iloc[-2] * 100

    if dxy_change_pct > 0.4:
        reasons.append(f"USD strengthening ({dxy_change_pct:+.2f}%) — bearish gold")
        score -= 0.25
    elif dxy_change_pct < -0.4:
        reasons.append(f"USD weakening ({dxy_change_pct:+.2f}%) — bullish gold")
        score += 0.25

    return reasons, score


def _news_signals(headlines: list[str], bullish_kw: list[str], bearish_kw: list[str]) -> tuple[list[str], float, Optional[str]]:
    reasons = []
    score = 0.0
    top_headline = None

    for h in headlines:
        h_lower = h.lower()
        bull_hits = sum(1 for k in bullish_kw if k in h_lower)
        bear_hits = sum(1 for k in bearish_kw if k in h_lower)
        if bull_hits > 0 or bear_hits > 0:
            if bull_hits > bear_hits:
                score += 0.15 * bull_hits
                reasons.append(f"Bullish news: {h[:80]}")
                if top_headline is None:
                    top_headline = h[:120]
            else:
                score -= 0.15 * bear_hits
                reasons.append(f"Bearish news: {h[:80]}")
                if top_headline is None:
                    top_headline = h[:120]

    score = max(-1.0, min(1.0, score))
    return reasons, score, top_headline


# ── Generic scan engine ───────────────────────────────────────────────────────

async def _scan(instrument: str) -> Optional[ForexSignal]:
    cfg = INSTRUMENTS[instrument]
    ticker = cfg["ticker_5m"]
    log.info("%s signal scan starting…", instrument)

    df_1m, df_5m, df_15m, df_1h, df_4h, df_dxy, headlines = await asyncio.gather(
        _fetch_ohlcv(ticker, period="1d",  interval="1m"),
        _fetch_ohlcv(ticker, period="2d",  interval="5m"),
        _fetch_ohlcv(ticker, period="5d",  interval="15m"),
        _fetch_ohlcv(ticker, period="5d",  interval="1h"),
        _fetch_ohlcv(ticker, period="60d", interval="4h"),
        _fetch_ohlcv("DX-Y.NYB", period="5d", interval="1h"),
        _fetch_news_headlines(),
    )

    ref_df = next((d for d in (df_1m, df_5m, df_15m, df_1h) if d is not None and not d.empty), None)
    if ref_df is None:
        log.warning("%s: no data available, skipping scan", instrument)
        return None

    price = float(ref_df["close"].iloc[-1])
    all_reasons: list[str] = []
    total_score = 0.0

    # Layer 1 (PRIMARY): EMA14(shift=5) × LWMA14(HLCC/4) — 1m (fastest signal)
    r1, s1 = _ema14_lwma14_crossover(df_1m, "1m")
    all_reasons.extend(r1); total_score += s1

    # Layer 1b: 5m — confirmation of 1m
    r5, s5 = _ema14_lwma14_crossover(df_5m, "5m")
    if s5 * s1 > 0:
        all_reasons.extend(r5); total_score += s5 * 0.6
    elif r5:
        all_reasons.append(f"5m diverges: {r5[0]}")

    # Layer 1c: 15m — higher-timeframe confluence
    r15, s15 = _ema14_lwma14_crossover(df_15m, "15m")
    if s15 * s1 > 0:
        all_reasons.extend(r15); total_score += s15 * 0.4
    elif r15:
        all_reasons.append(f"15m diverges: {r15[0]}")

    # Layer 2: RSI / MACD / Bollinger (1H)
    if df_1h is not None:
        r, s = _technical_signals(df_1h)
        all_reasons.extend(r); total_score += s * 0.5

    # Layer 3: EMA9/21 + EMA50/200 crossovers
    r, s = _ma_crossover_signals(df_1h, df_4h)
    all_reasons.extend(r); total_score += s * 0.4

    # Layer 4: Price action (key levels + session open)
    r, s = _price_action_signals_cfg(df_1h if df_1h is not None else df_15m, cfg["key_levels"])
    all_reasons.extend(r); total_score += s * 0.4

    # Layer 5: DXY macro (only for instruments where it's relevant)
    if cfg["dxy_effect"] != 0:
        r, s = _macro_signals(df_dxy)
        all_reasons.extend(r); total_score += s * cfg["dxy_effect"] * 0.4

    # Layer 6: News (instrument-specific keywords)
    r, s, headline = _news_signals(headlines, cfg["bullish_kw"], cfg["bearish_kw"])
    all_reasons.extend(r); total_score += s * 0.4

    total_score = max(-1.0, min(1.0, total_score / 2.5))
    confidence  = abs(total_score)

    if confidence < 0.20:
        log.info("%s scan complete — no signal (confidence %.2f)", instrument, confidence)
        return None

    direction = SIGNAL_BUY if total_score > 0 else SIGNAL_SELL

    if any("1m" in r for r in all_reasons):
        timeframe = "1m"
    elif any("5m" in r for r in all_reasons):
        timeframe = "5m"
    elif any("15m" in r for r in all_reasons):
        timeframe = "15m"
    elif any("4H" in r or "EMA50" in r for r in all_reasons):
        timeframe = "4H"
    else:
        timeframe = "1H"

    signal = ForexSignal(
        instrument=instrument,
        direction=direction,
        confidence=round(confidence, 3),
        price=price,
        reasons=all_reasons[:8],
        timeframe=timeframe,
        news_headline=headline,
    )
    log.info("%s signal: %s | conf=%.2f | price=%.2f", instrument, direction, confidence, price)
    return signal


# ── Public scan functions ─────────────────────────────────────────────────────

async def scan_xauusd() -> Optional[ForexSignal]:
    return await _scan("XAUUSD")

async def scan_us30() -> Optional[ForexSignal]:
    return await _scan("US30")

async def scan_btcusd() -> Optional[ForexSignal]:
    return await _scan("BTCUSD")

async def scan_all() -> list[ForexSignal]:
    results = await asyncio.gather(scan_xauusd(), scan_us30(), scan_btcusd())
    return [s for s in results if s is not None]
