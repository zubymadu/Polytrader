#!/usr/bin/env bash
# Polytrader deploy script — run on the server as root or a dedicated user
set -e

REPO_DIR="$(cd "$(dirname "$0")" && pwd)"
VENV="$REPO_DIR/.venv"

echo "=== Polytrader Deploy ==="

# 1. Python venv
if [ ! -d "$VENV" ]; then
    python3 -m venv "$VENV"
fi
source "$VENV/bin/activate"
pip install -q --upgrade pip
pip install -q -r "$REPO_DIR/requirements.txt"

# 2. Ensure .env exists
if [ ! -f "$REPO_DIR/.env" ]; then
    echo "[!] No .env file found. Copying from .env.example — FILL IN YOUR KEYS!"
    cp "$REPO_DIR/.env.example" "$REPO_DIR/.env"
fi

# 3. Run as a systemd service or directly
if systemctl --version &>/dev/null 2>&1 && [ "$(id -u)" = "0" ]; then
    SERVICE=/etc/systemd/system/polytrader.service
    cat > "$SERVICE" <<EOF
[Unit]
Description=Polytrader AI agent
After=network.target

[Service]
Type=simple
WorkingDirectory=$REPO_DIR
ExecStart=$VENV/bin/python $REPO_DIR/main.py --no-terminal
Restart=always
RestartSec=10
EnvironmentFile=$REPO_DIR/.env

[Install]
WantedBy=multi-user.target
EOF
    systemctl daemon-reload
    systemctl enable polytrader
    systemctl restart polytrader
    echo "=== Service started. Check with: journalctl -fu polytrader ==="
else
    echo "=== Starting in foreground (Ctrl+C to stop) ==="
    cd "$REPO_DIR"
    python main.py --no-terminal
fi
