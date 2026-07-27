#!/bin/bash
set -e

APP_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
NODE_DIR="$APP_DIR/node"
HOTSPOT_SSID="raspberry"
HOTSPOT_PASS="12345678"

echo "--- Smart Hospital Starting ---"

if ! command -v node >/dev/null 2>&1; then
  echo "[ERROR] Node.js is not installed"
  exit 1
fi

if ! command -v mosquitto >/dev/null 2>&1; then
  echo "[ERROR] Mosquitto is not installed"
  exit 1
fi

echo "[1/4] Starting Wi-Fi hotspot: $HOTSPOT_SSID"
sudo nmcli dev wifi hotspot ifname wlan0 ssid "$HOTSPOT_SSID" password "$HOTSPOT_PASS" || true
sleep 3

echo "[2/4] Restarting Mosquitto MQTT broker"
sudo systemctl restart mosquitto
sleep 1

echo "[3/4] Installing Node dependencies if needed"
cd "$NODE_DIR"
if [ ! -d node_modules ]; then
  npm install --omit=dev
fi

echo "[4/4] Starting dashboard server"
sudo node "$NODE_DIR/main.js"
