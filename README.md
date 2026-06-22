# Polytrader

AI-powered Polymarket arbitrage monitor and copy-trading agent.

## What it does

- **Monitors 1,000+ wallets** — discovers active traders via leaderboard + market activity
- **Scores every wallet** using 6 weighted signals (win rate, 30-day ROI, timing alpha, arb specialisation, etc.)
- **Copies top 7 wallets** — auto-follows their trades with configurable size scaling
- **Scans for mispriced markets** — detects YES+NO pricing inefficiencies in real time
- **Telegram bot** — trade signals, arb alerts, and `/status /top /arbs /copies /insight` commands
- **AI agent** (Claude) — analyses patterns every 15 minutes, updates wallet scoring weights, surfaces insights

## Setup

```bash
pip install -r requirements.txt
cp .env.example .env
# Fill in .env with your keys
```

## Run

```bash
# Full terminal dashboard + agent
python main.py

# Headless / server mode
python main.py --no-terminal

# Quick arb scan only
python main.py --arb-only
```

## Telegram commands

| Command | Description |
|---------|-------------|
| `/status` | Agent overview |
| `/top` | Top 10 wallets by score |
| `/arbs` | Recent arb opportunities |
| `/copies` | Open copy trades |
| `/insight` | Latest AI analysis |

## Wallet scoring

| Signal | Default weight |
|--------|---------------|
| Win rate | 30% |
| 30-day ROI | 25% |
| Timing alpha | 15% |
| Trade count | 10% |
| Position size consistency | 10% |
| Arb specialisation | 10% |

The AI agent updates these weights automatically based on observed outcomes.

## Arbitrage logic

A Polymarket binary market resolves to $1 (YES wins) or $0 (YES loses).

| Condition | Strategy | Profit |
|-----------|----------|--------|
| YES + NO > $1.00 | Sell both | spread − $1 |
| YES + NO < $1.00 | Buy both | $1 − spread |

Opportunities above the configured threshold (default 1.5%) trigger alerts.

## Architecture

```
main.py
└── agent.py  (orchestrator)
    ├── engine/arbitrage.py      ← market scan + arb detection
    ├── engine/wallet_scanner.py ← wallet discovery + scoring
    ├── engine/copytrade.py      ← copy-trade signal engine
    ├── ai_agent.py              ← Claude analysis loop
    ├── telegram_bot.py          ← Telegram interface
    └── ui/terminal.py           ← Rich live dashboard
```
