#!/bin/bash
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"

echo "--- Smart Hospital Starting ---"

# Clean up any broken dnsmasq config left from previous attempts
sudo rm -f /etc/NetworkManager/dnsmasq-shared.d/shortlease.conf 2>/dev/null || true

# Start hotspot on 2.4 GHz channel 6 — universally visible on all devices.
# Specifying band+channel avoids NM picking a restricted 5 GHz channel that
# nearby devices cannot see. Do NOT run iwconfig before this — it can suppress
# beacon broadcasting on Raspberry Pi's Broadcom chip during AP mode transition.
sudo nmcli dev wifi hotspot ifname wlan0 ssid raspberry password 12345678 band bg channel 6
echo "[OK] Hotspot started"

# Disable power management AFTER the AP is up (safe here, not before)
sudo iwconfig wlan0 power off 2>/dev/null || true

# Wait for hotspot IP (10.42.0.1) to be fully assigned before node.js reads it
sleep 5

# Restart Mosquitto
sudo systemctl restart mosquitto
echo "[OK] Mosquitto started"

sleep 1

# Start the server (serves website + handles MQTT bridge)
sudo node "$SCRIPT_DIR/node/main.js"
