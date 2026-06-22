import sqlite3
import json
from datetime import datetime
from contextlib import contextmanager
from typing import Optional

from . import config
from .models import WalletStats, Trade, CopyTrade, ArbOpportunity


def init_db(path: str = config.DB_PATH):
    with sqlite3.connect(path) as conn:
        conn.executescript("""
        CREATE TABLE IF NOT EXISTS wallets (
            address       TEXT PRIMARY KEY,
            total_trades  INTEGER DEFAULT 0,
            winning_trades INTEGER DEFAULT 0,
            total_volume  REAL DEFAULT 0,
            realized_pnl  REAL DEFAULT 0,
            roi_30d       REAL DEFAULT 0,
            win_rate      REAL DEFAULT 0,
            avg_position_size REAL DEFAULT 0,
            timing_alpha  REAL DEFAULT 0,
            arb_specialization REAL DEFAULT 0,
            score         REAL DEFAULT 0,
            is_copied     INTEGER DEFAULT 0,
            last_seen     TEXT,
            raw_data      TEXT DEFAULT '{}'
        );

        CREATE TABLE IF NOT EXISTS trades (
            id            INTEGER PRIMARY KEY AUTOINCREMENT,
            wallet        TEXT,
            market_id     TEXT,
            side          TEXT,
            size          REAL,
            price         REAL,
            timestamp     TEXT,
            tx_hash       TEXT,
            outcome       TEXT,
            pnl           REAL
        );

        CREATE TABLE IF NOT EXISTS copy_trades (
            id            INTEGER PRIMARY KEY AUTOINCREMENT,
            source_wallet TEXT,
            market_id     TEXT,
            side          TEXT,
            size          REAL,
            entry_price   REAL,
            opened_at     TEXT,
            closed_at     TEXT,
            exit_price    REAL,
            pnl           REAL,
            status        TEXT DEFAULT 'OPEN'
        );

        CREATE TABLE IF NOT EXISTS arb_opportunities (
            id            INTEGER PRIMARY KEY AUTOINCREMENT,
            market_id     TEXT,
            question      TEXT,
            profit_pct    REAL,
            direction     TEXT,
            yes_price     REAL,
            no_price      REAL,
            estimated_size REAL,
            discovered_at TEXT
        );

        CREATE TABLE IF NOT EXISTS score_weights (
            key   TEXT PRIMARY KEY,
            value REAL
        );

        CREATE TABLE IF NOT EXISTS ai_insights (
            id         INTEGER PRIMARY KEY AUTOINCREMENT,
            created_at TEXT,
            insight    TEXT
        );
        """)
        for k, v in config.DEFAULT_SCORE_WEIGHTS.items():
            conn.execute(
                "INSERT OR IGNORE INTO score_weights (key, value) VALUES (?, ?)", (k, v)
            )
        conn.commit()


@contextmanager
def get_conn(path: str = config.DB_PATH):
    conn = sqlite3.connect(path)
    conn.row_factory = sqlite3.Row
    try:
        yield conn
        conn.commit()
    finally:
        conn.close()


# ── Wallets ──────────────────────────────────────────────────────────────────

def upsert_wallet(ws: WalletStats):
    with get_conn() as conn:
        conn.execute("""
        INSERT INTO wallets
            (address, total_trades, winning_trades, total_volume, realized_pnl,
             roi_30d, win_rate, avg_position_size, timing_alpha,
             arb_specialization, score, is_copied, last_seen)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)
        ON CONFLICT(address) DO UPDATE SET
            total_trades=excluded.total_trades,
            winning_trades=excluded.winning_trades,
            total_volume=excluded.total_volume,
            realized_pnl=excluded.realized_pnl,
            roi_30d=excluded.roi_30d,
            win_rate=excluded.win_rate,
            avg_position_size=excluded.avg_position_size,
            timing_alpha=excluded.timing_alpha,
            arb_specialization=excluded.arb_specialization,
            score=excluded.score,
            is_copied=excluded.is_copied,
            last_seen=excluded.last_seen
        """, (
            ws.address, ws.total_trades, ws.winning_trades, ws.total_volume,
            ws.realized_pnl, ws.roi_30d, ws.win_rate, ws.avg_position_size,
            ws.timing_alpha, ws.arb_specialization, ws.score,
            int(ws.is_copied),
            ws.last_seen.isoformat() if ws.last_seen else None,
        ))


def get_top_wallets(limit: int = 20) -> list[WalletStats]:
    with get_conn() as conn:
        rows = conn.execute(
            "SELECT * FROM wallets ORDER BY score DESC LIMIT ?", (limit,)
        ).fetchall()
    result = []
    for r in rows:
        ws = WalletStats(address=r["address"])
        for col in ("total_trades", "winning_trades", "total_volume", "realized_pnl",
                    "roi_30d", "win_rate", "avg_position_size", "timing_alpha",
                    "arb_specialization", "score"):
            setattr(ws, col, r[col])
        ws.is_copied = bool(r["is_copied"])
        ws.last_seen = datetime.fromisoformat(r["last_seen"]) if r["last_seen"] else None
        result.append(ws)
    return result


def get_wallet_count() -> int:
    with get_conn() as conn:
        return conn.execute("SELECT COUNT(*) FROM wallets").fetchone()[0]


# ── Arb opportunities ─────────────────────────────────────────────────────────

def save_arb(opp: ArbOpportunity):
    with get_conn() as conn:
        conn.execute("""
        INSERT INTO arb_opportunities
            (market_id, question, profit_pct, direction, yes_price, no_price,
             estimated_size, discovered_at)
        VALUES (?,?,?,?,?,?,?,?)
        """, (
            opp.market.id, opp.market.question, opp.profit_pct, opp.direction,
            opp.yes_price, opp.no_price, opp.estimated_size,
            opp.discovered_at.isoformat(),
        ))


def get_recent_arbs(hours: int = 24, limit: int = 100) -> list[dict]:
    with get_conn() as conn:
        rows = conn.execute("""
        SELECT * FROM arb_opportunities
        WHERE discovered_at > datetime('now', ?)
        ORDER BY profit_pct DESC LIMIT ?
        """, (f"-{hours} hours", limit)).fetchall()
    return [dict(r) for r in rows]


# ── Copy trades ───────────────────────────────────────────────────────────────

def save_copy_trade(ct: CopyTrade) -> int:
    with get_conn() as conn:
        cur = conn.execute("""
        INSERT INTO copy_trades
            (source_wallet, market_id, side, size, entry_price, opened_at, status)
        VALUES (?,?,?,?,?,?,?)
        """, (ct.source_wallet, ct.market_id, ct.side, ct.size,
              ct.entry_price, ct.opened_at.isoformat(), ct.status))
        return cur.lastrowid


def get_open_copy_trades() -> list[dict]:
    with get_conn() as conn:
        rows = conn.execute(
            "SELECT * FROM copy_trades WHERE status='OPEN' ORDER BY opened_at DESC"
        ).fetchall()
    return [dict(r) for r in rows]


# ── Score weights (AI-updated) ─────────────────────────────────────────────────

def get_score_weights() -> dict:
    with get_conn() as conn:
        rows = conn.execute("SELECT key, value FROM score_weights").fetchall()
    return {r["key"]: r["value"] for r in rows}


def update_score_weights(weights: dict):
    with get_conn() as conn:
        for k, v in weights.items():
            conn.execute(
                "INSERT OR REPLACE INTO score_weights (key, value) VALUES (?,?)", (k, v)
            )


# ── AI insights ───────────────────────────────────────────────────────────────

def save_insight(text: str):
    with get_conn() as conn:
        conn.execute(
            "INSERT INTO ai_insights (created_at, insight) VALUES (?,?)",
            (datetime.utcnow().isoformat(), text),
        )


def get_recent_insights(limit: int = 5) -> list[str]:
    with get_conn() as conn:
        rows = conn.execute(
            "SELECT insight FROM ai_insights ORDER BY created_at DESC LIMIT ?", (limit,)
        ).fetchall()
    return [r["insight"] for r in rows]
