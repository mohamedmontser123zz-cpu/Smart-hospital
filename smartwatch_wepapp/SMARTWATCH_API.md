# MEDEX SmartWatch — Developer Integration Guide

> **For:** React.js frontend developer building a hospital dashboard app
> **Runs on:** Raspberry Pi (same hotspot network as the smartwatch)
> **Stack:** Node.js (Express) backend + React.js frontend

---

## 1. Network Setup

The Raspberry Pi runs a Wi-Fi hotspot. Everything communicates through it.

| Device | IP Address | Role |
|---|---|---|
| Raspberry Pi | `10.42.0.1` | Hotspot gateway + MQTT broker + server |
| MEDEX SmartWatch (ESP32) | `10.42.0.100` *(static)* | Sensor node |
| Your phone / browser | `10.42.0.x` (DHCP) | Client |

**Wi-Fi credentials to connect:**

```
SSID:     raspberry
Password: 12345678
```

**MQTT Broker (Mosquitto) — already running on the Pi:**

```
Host:     10.42.0.1
Port:     1883
Protocol: mqtt  (plain TCP, no TLS, no authentication)
```

---

## 2. What the SmartWatch Publishes (MQTT Topics)

The watch publishes all topics **every 1 second** with `retain = true`.
Because of `retain`, when your app subscribes it immediately receives the last known value.

| MQTT Topic | Value type | Example | Notes |
|---|---|---|---|
| `smartwatch/status` | string | `"online"` | Watch is alive. Goes silent when disconnected. |
| `smartwatch/heart_rate` | integer string | `"72"` | BPM. `"0"` when no finger on sensor. |
| `smartwatch/spo2` | integer string | `"98"` | Blood oxygen %. `"0"` when no finger. |
| `smartwatch/temp` | float string | `"27.3"` | Ambient temperature °C (AHT21B sensor). |
| `smartwatch/humidity` | float string | `"55.2"` | Relative humidity % (AHT21B sensor). |
| `smartwatch/gsr` | integer string | `"1450"` | Raw GSR ADC value 0–4095. |
| `smartwatch/medex` | integer string | `"42"` | MEDEX stress index 0–100. |
| `smartwatch/battery` | integer string | `"85"` | Battery % (simulated for now). |
| `smartwatch/finger` | `"1"` / `"0"` | `"1"` | `1` = finger on HR sensor. |
| `smartwatch/gsr_contact` | `"1"` / `"0"` | `"1"` | `1` = GSR electrode contact. |

### MEDEX Stress Index interpretation

| `medex` range | Meaning | Suggested UI color |
|---|---|---|
| 0–20 | 😌 Very relaxed | Green |
| 21–40 | 🙂 Calm | Light green |
| 41–60 | 😐 Mild arousal | Yellow |
| 61–80 | 😰 Stressed | Orange |
| 81–100 | 🚨 High arousal / alert | Red |

---

## 3. Your Backend (Node.js / Express)

Run this on a **different port** from the existing server (which uses port 80).
Recommended: **port 3001**.

### 3.1 Install dependencies

```bash
npm init -y
npm install express mqtt cors
```

### 3.2 Full server example (`server.js`)

```js
const express = require('express');
const mqtt    = require('mqtt');
const cors    = require('cors');

const app = express();
app.use(cors());
app.use(express.json());

// ── MQTT ──────────────────────────────────────────────────────
// The Pi is always 10.42.0.1 on the hotspot (Mosquitto listens on all interfaces)
const mqttClient = mqtt.connect('mqtt://10.42.0.1:1883');

const watchData = {
  status: null, heart_rate: null, spo2: null,
  temp: null, humidity: null, gsr: null,
  medex: null, battery: null, finger: null, gsr_contact: null,
};

// SSE clients list for real-time push
const sseClients = new Set();

mqttClient.on('connect', () => {
  console.log('[MQTT] Connected');
  Object.keys(watchData).forEach(t => mqttClient.subscribe(`smartwatch/${t}`));
});

mqttClient.on('message', (topic, message) => {
  const key = topic.replace('smartwatch/', '');
  if (key in watchData) {
    watchData[key] = message.toString();
    // Push to all SSE listeners
    const payload = JSON.stringify({ [key]: watchData[key] });
    sseClients.forEach(res => res.write(`data: ${payload}\n\n`));
  }
});

// ── REST: full snapshot ────────────────────────────────────────
app.get('/api/watch', (req, res) => {
  res.json({
    online:      watchData.status === 'online',
    heart_rate:  Number(watchData.heart_rate)    || 0,
    spo2:        Number(watchData.spo2)           || 0,
    temp:        parseFloat(watchData.temp)       || 0,
    humidity:    parseFloat(watchData.humidity)   || 0,
    gsr:         Number(watchData.gsr)            || 0,
    medex:       Number(watchData.medex)          || 0,
    battery:     Number(watchData.battery)        || 0,
    finger_on:   watchData.finger       === '1',
    gsr_contact: watchData.gsr_contact  === '1',
  });
});

// ── SSE: real-time stream (no polling needed) ─────────────────
app.get('/api/watch/stream', (req, res) => {
  res.setHeader('Content-Type',  'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection',    'keep-alive');
  sseClients.add(res);
  req.on('close', () => sseClients.delete(res));
});

app.listen(3001, () => console.log('[SERVER] Running on port 3001'));
```

---

## 4. Frontend (React.js)

### 4.1 Pages

| Page | Route | Description |
|---|---|---|
| Login | `/login` | Username + password form |
| Dashboard | `/dashboard` | Live smartwatch vitals for the patient/nurse |

### 4.2 Connecting to the real-time stream

```jsx
// src/hooks/useWatchData.js
import { useState, useEffect } from 'react';

const API_BASE = 'http://10.42.0.1:3001';

export function useWatchData() {
  const [data, setData] = useState(null);

  useEffect(() => {
    // Load initial snapshot
    fetch(`${API_BASE}/api/watch`)
      .then(r => r.json())
      .then(setData);

    // Then stream live updates via SSE
    const es = new EventSource(`${API_BASE}/api/watch/stream`);
    es.onmessage = (e) => {
      const update = JSON.parse(e.data);
      setData(prev => ({ ...prev, ...update }));
    };
    return () => es.close();
  }, []);

  return data;
}
```

### 4.3 Login page example

```jsx
// src/pages/Login.jsx
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';

// Replace with real auth / JWT as needed
const USERS = [
  { username: 'doctor', password: 'medex2024', role: 'Doctor' },
  { username: 'nurse',  password: 'nurse123',  role: 'Nurse'  },
  { username: 'admin',  password: 'admin123',  role: 'Admin'  },
];

export default function Login() {
  const navigate = useNavigate();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError]       = useState('');

  const handleSubmit = (e) => {
    e.preventDefault();
    const user = USERS.find(u => u.username === username && u.password === password);
    if (user) {
      localStorage.setItem('medex_user', JSON.stringify(user));
      navigate('/dashboard');
    } else {
      setError('Invalid username or password');
    }
  };

  return (
    <form onSubmit={handleSubmit}>
      <h1>MEDEX Hospital Login</h1>
      <input
        value={username}
        onChange={e => setUsername(e.target.value)}
        placeholder="Username"
        required
      />
      <input
        type="password"
        value={password}
        onChange={e => setPassword(e.target.value)}
        placeholder="Password"
        required
      />
      {error && <p style={{ color: 'red' }}>{error}</p>}
      <button type="submit">Login</button>
    </form>
  );
}
```

### 4.4 Dashboard example

```jsx
// src/pages/Dashboard.jsx
import { useWatchData } from '../hooks/useWatchData';

export default function Dashboard() {
  const watch = useWatchData();

  if (!watch) return <p>Loading...</p>;

  return (
    <div>
      <h1>Patient Monitor — MEDEX SmartWatch</h1>

      {/* Online / offline badge */}
      <div>{watch.online ? '🟢 Watch Online' : '🔴 Watch Offline'}</div>

      {/* Heart rate + SpO2 — only meaningful when finger is on sensor */}
      {watch.finger_on ? (
        <>
          <p>Heart Rate: <strong>{watch.heart_rate} BPM</strong></p>
          <p>SpO₂:       <strong>{watch.spo2}%</strong></p>
        </>
      ) : (
        <p>⚠️ Place finger on sensor for HR / SpO₂</p>
      )}

      <p>Temperature: {watch.temp}°C</p>
      <p>Humidity:    {watch.humidity}%</p>
      <p>GSR Raw:     {watch.gsr}</p>
      <p>MEDEX Stress: {watch.medex}/100</p>
      <p>Battery:     {watch.battery}%</p>
    </div>
  );
}
```

---

## 5. How to Run on the Pi

### Terminal 1 — existing hospital system (do not change)
```bash
cd ~/resbaerry
./start.sh
```

### Terminal 2 — your new backend
```bash
cd ~/your-app
node server.js
# Runs on http://10.42.0.1:3001
```

### Terminal 3 — your React frontend (development)
```bash
cd ~/your-app/client
npm run dev -- --host 0.0.0.0
# Access from any device on the hotspot:
# http://10.42.0.1:5173
```

### Production build (optional)
```bash
cd ~/your-app/client
npm run build
# Then serve dist/ via your express server:
# app.use(express.static(path.join(__dirname, 'client/dist')));
# app.listen(3001, '0.0.0.0', ...);
```

---

## 6. Sensor Value Ranges (for gauges and alerts)

| Sensor | Min | Healthy range | Max | Unit |
|---|---|---|---|---|
| Heart Rate | 0 | 60–100 | 200 | BPM |
| SpO₂ | 0 | 95–100 | 100 | % |
| Temperature | -40 | 20–37 | 85 | °C |
| Humidity | 0 | 30–70 | 100 | % |
| GSR Raw | 0 | person-dependent | 4095 | ADC counts (12-bit) |
| MEDEX Level | 0 | 0–40 = calm | 100 | index |
| Battery | 0 | — | 100 | % |

---

## 7. Offline Detection

The watch publishes `smartwatch/status = "online"` every second.

```js
// Mark as offline if no update received for 5 seconds
let lastSeen = Date.now();

mqttClient.on('message', (topic) => {
  if (topic === 'smartwatch/status') lastSeen = Date.now();
});

setInterval(() => {
  const isOnline = Date.now() - lastSeen < 5000;
  // Push { online: isOnline } to SSE clients or update state
}, 1000);
```

---

## 8. Quick Reference Card

```
Pi IP (hotspot gateway):  10.42.0.1
Watch IP (static):        10.42.0.100
Wi-Fi SSID:               raspberry
Wi-Fi Password:           12345678

MQTT broker:              mqtt://10.42.0.1:1883  (no auth, no TLS)
Existing server (port 80): http://10.42.0.1      (do not change)
Your server (port 3001):   http://10.42.0.1:3001 (yours to build)

MQTT topics — prefix: smartwatch/
  status       → "online" | silent
  heart_rate   → "0"–"200" (integer BPM, 0 = no finger)
  spo2         → "0"–"100" (integer %, 0 = no finger)
  temp         → float °C
  humidity     → float %
  gsr          → "0"–"4095" (raw ADC)
  medex        → "0"–"100" (stress index)
  battery      → "0"–"100" (%)
  finger       → "1" | "0"
  gsr_contact  → "1" | "0"

Publish interval: 1 second
Retain flag: true (last value replayed on subscribe)
```
