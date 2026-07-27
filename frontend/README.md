# MediBotOS — Smart Hospital MQTT Client

A **React + Vite** dashboard for monitoring hospital room sensors and dispatching a delivery robot, all over **MQTT WebSockets**.

---

## Features

- **Live sensor dashboard** — Temperature, Humidity, Gas (MQ-2), Air Quality (MQ-135), Flame, Light (LDR), Occupancy (PIR), Door (Magnet), and Emergency for two patient rooms.
- **Room controls** — Toggle Fan and LED on/off for each room via MQTT.
- **Robot dispatch** — Send the hospital robot to a charging base, Room 1, or Room 2 and track its position in real time on a floor-map.
- **Emergency alerts** — Pulsing banner and card highlight when the emergency sensor is triggered.
- **MQTT over WebSocket** — The browser connects directly to the MQTT broker (port `9001`), so no extra backend is needed for sensor data.
- **Responsive UI** — Works on desktop and mobile screens.

---

## Prerequisites

| Tool | Version |
|------|---------|
| [Node.js](https://nodejs.org/) | **18 +** (LTS recommended) |
| npm | comes with Node.js |
| MQTT Broker (e.g. [Mosquitto](https://mosquitto.org/)) | any version with **WebSocket listener on port 9001** |

> **Note:** The robot `/move` commands are sent to a separate HTTP backend running on port **80** (see `main.js` in the project root).

---

## How to Build & Run

### Step 1 — Install everything

```bash
# From the project root (smarthospital/mqtt/node)
npm install            # backend dependencies

cd client
npm install            # frontend dependencies
```

### Step 2 — Configure the MQTT broker

Make sure your MQTT broker has a **WebSocket listener on port 9001**.

#### Mosquitto example (`mosquitto.conf`)

```conf
# Default MQTT
listener 1883

# WebSocket listener (required by the dashboard)
listener 9001
protocol websockets

allow_anonymous true
```

```bash
mosquitto -c mosquitto.conf
```

### Step 3 — Build the frontend for production

```bash
cd client
npm run build
```

This creates a `dist/` folder. The backend (`main.js`) automatically serves it.

### Step 4 — Start the server

```bash
# From the project root
node main.js
```

The server starts on **http://\<your-ip\>:80** and serves both the API and the React UI.

### Development mode (hot-reload)

If you're actively developing the frontend:

```bash
# Terminal 1 — backend
node main.js

# Terminal 2 — frontend dev server
cd client
npm run dev
```

- Dev UI: http://localhost:5173
- Backend API: http://\<your-ip\>:80

---

## Available Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start Vite dev server with hot-reload |
| `npm run build` | Create production build in `dist/` |
| `npm run preview` | Serve the production build locally |
| `npm run lint` | Run ESLint on all `.js` / `.jsx` files |

---

## Project Structure

```
client/
├── index.html                  # HTML entry point
├── package.json                # Dependencies & scripts
├── vite.config.js              # Vite configuration
├── eslint.config.js            # ESLint flat config
├── public/                     # Static assets
└── src/
    ├── main.jsx                # React root mount
    ├── App.jsx                 # ★ Top-level orchestrator (thin — wires state + components)
    ├── App.css                 # Full application styles
    │
    ├── config/
    │   └── constants.js        # ★ BACKEND URL, MQTT_WS, ROOMS, SENSOR_DEFS, CONTROL_DEFS
    │
    ├── hooks/
    │   └── useMqtt.js          # ★ MQTT connection, subscriptions, message routing
    │
    └── components/
        ├── Header.jsx          # ★ Top bar — branding + MQTT status badge
        ├── TabNav.jsx          # ★ Tab buttons (Robot / Room 1 / Room 2)
        ├── RobotView.jsx       # ★ Robot tab — floor map, dispatch, quick sensor summary
        └── RoomPanel.jsx       # ★ Room tab — sensor cards + actuator toggles
```

### What each file is responsible for

| File | Responsibility |
|------|----------------|
| `config/constants.js` | **Single source of truth** for all configuration: server addresses, room list, sensor definitions, control definitions, and state-factory helpers. **Start here when adding sensors, controls, or rooms.** |
| `hooks/useMqtt.js` | Opens the MQTT WebSocket, subscribes to topics on connect, routes incoming messages to the correct state slice, and exposes a `publishControl` helper. **Edit here to change MQTT behaviour.** |
| `components/Header.jsx` | Stateless header bar. Receives `mqttStatus` and renders the logo + connection badge. |
| `components/TabNav.jsx` | Stateless tab navigation. Renders three buttons and shows a LIVE badge when a room has received data. |
| `components/RobotView.jsx` | Renders the Robot tab: animated floor-map, dispatch buttons, and quick sensor summary cards. |
| `components/RoomPanel.jsx` | Renders a full room view: emergency banner, all sensor cards, and actuator toggle buttons. |
| `App.jsx` | Thin orchestrator — owns `activeTab` state, calls `useMqtt`, implements `dispatchRobot` (HTTP) and `toggleControl` (MQTT publish + optimistic update), passes props to all components. |

---

## Architecture

```
┌──────────────────────────────────────────────────────┐
│  Browser (React App)                                 │
│  ┌───────────────┐     ┌──────────────────────────┐  │
│  │ Robot Dispatch │────▶│ HTTP Backend (port 80)   │  │
│  │ Buttons        │     │ GET /move/:roomId        │  │
│  └───────────────┘     └──────────────────────────┘  │
│                                                      │
│  ┌───────────────┐     ┌──────────────────────────┐  │
│  │ Sensor Cards  │◀────│ MQTT Broker (ws:9001)    │  │
│  │ + Floor Map    │     │ Topics: room1/*, room2/* │  │
│  └───────────────┘     └──────────────────────────┘  │
└──────────────────────────────────────────────────────┘
```

| Component | Role |
|-----------|------|
| **React Client** | Renders the dashboard, subscribes to MQTT topics, sends robot dispatch requests over HTTP. |
| **MQTT Broker** | Receives sensor data from ESP32 / Arduino nodes and relays it to the browser via WebSocket. |
| **HTTP Backend** (`main.js`) | Serves the React build, handles `/move/:roomId` commands, stores sensor data for REST API, and provides a `/health` endpoint. |

---

## MQTT Topics

### Sensor topics (per room)

| Topic Pattern | Example | Payload |
|---------------|---------|---------|
| `{room}/temp` | `room1/temp` | `25.3` (°C) |
| `{room}/humidity` | `room1/humidity` | `60` (%) |
| `{room}/mq2` | `room2/mq2` | `312` (ADC value) |
| `{room}/mq135` | `room1/mq135` | `180` (ADC value) |
| `{room}/flame` | `room1/flame` | `850` (ADC value) |
| `{room}/ldr` | `room2/ldr` | `740` (ADC value) |
| `{room}/occupancy` | `room1/occupancy` | `1` or `0` |
| `{room}/magnet` | `room2/magnet` | `1` (closed) / `0` (open) |
| `{room}/emergency` | `room1/emergency` | `1` (active) / `0` (clear) |

> `{room}` is either `room1` or `room2`.

### Control topics (per room)

| Topic Pattern | Direction | Payload |
|---------------|-----------|---------|
| `{room}/fan/set` | Client → Broker | `1` (on) / `0` (off) |
| `{room}/fan/status` | Broker → Client | `1` or `0` — actual state from MCU |
| `{room}/led/set` | Client → Broker | `1` (on) / `0` (off) |
| `{room}/led/status` | Broker → Client | `1` or `0` |

### Robot topic

| Topic | Direction | Payload |
|-------|-----------|---------|
| `esp32/location` | Broker → Client | `home`, `room1`, or `room2` |

---

## Adding a New Sensor

> **All sensor changes are in ONE place: `src/config/constants.js`**

### 1. Frontend — `src/config/constants.js`

Add an entry to `SENSOR_DEFS`:

```diff
 export const SENSOR_DEFS = {
   // ... existing sensors ...
   emergency: { label: 'Emergency', unit: '', icon: '🚨', color: '#ff1744', topic: 'emergency', bool: true },
+  co2:       { label: 'CO₂',      unit: 'ppm', icon: '🫁', color: '#6366f1', topic: 'co2' },
 };
```

| Field | Description |
|-------|-------------|
| `label` | Display name on the card |
| `unit` | Unit shown below the value (e.g. `ppm`, `°C`, `%`) |
| `icon` | Emoji or symbol for the card |
| `color` | Accent color (hex) for the card glow |
| `topic` | MQTT sub-topic name (must match what the MCU publishes) |
| `bool` | Set to `true` only if the value is binary (`1`/`0`). Omit for numeric sensors |

### 2. Backend — `main.js`

Add the topic name to the `SENSOR_TOPICS` array:

```diff
-const SENSOR_TOPICS  = ['temp', 'humidity', 'mq2', 'mq135', 'flame', 'ldr', 'occupancy', 'magnet', 'emergency'];
+const SENSOR_TOPICS  = ['temp', 'humidity', 'mq2', 'mq135', 'flame', 'ldr', 'occupancy', 'magnet', 'emergency', 'co2'];
```

### 3. MCU firmware (ESP32 / Arduino)

Publish the sensor value to the matching topic:

```cpp
// Example: publish CO₂ reading every 5 seconds
char payload[16];
snprintf(payload, sizeof(payload), "%d", co2_value);
client.publish("room1/co2", payload);
```

**That's it!** The dashboard auto-renders a new sensor card — no other changes needed.

---

## Adding a New Actuator (Control)

> **All actuator changes are in ONE place: `src/config/constants.js`**

### 1. Frontend — `src/config/constants.js`

Add an entry to `CONTROL_DEFS`:

```diff
 export const CONTROL_DEFS = {
   fan: { label: 'Fan',  icon: '🌀', topic: 'fan'  },
   led: { label: 'LED',  icon: '💡', topic: 'led'  },
+  buzzer: { label: 'Buzzer', icon: '🔔', topic: 'buzzer' },
 };
```

| Field | Description |
|-------|-------------|
| `label` | Display name on the toggle button |
| `icon` | Emoji or symbol |
| `topic` | MQTT sub-topic name (must match MCU firmware) |

### 2. Backend — `main.js`

Add the topic name to the `CONTROL_TOPICS` array:

```diff
-const CONTROL_TOPICS = ['fan', 'led'];
+const CONTROL_TOPICS = ['fan', 'led', 'buzzer'];
```

### 3. MCU firmware (ESP32 / Arduino)

Subscribe to the `set` topic and publish status back:

```cpp
// Subscribe to control command
client.subscribe("room1/buzzer/set");

// In the message callback:
if (topic == "room1/buzzer/set") {
    bool on = (payload[0] == '1');
    digitalWrite(BUZZER_PIN, on ? HIGH : LOW);
    // Report actual state back
    client.publish("room1/buzzer/status", on ? "1" : "0");
}
```

**That's it!** The dashboard auto-renders a new toggle button with ON/OFF state.

---

## Adding a New Room

To add a third room (e.g. `room3`):

### 1. Frontend — `src/config/constants.js`

```diff
 export const ROOMS = [
   { id: 'home',  label: 'BASE',   icon: '⬡', desc: 'Charging Station' },
   { id: 'room1', label: 'ROOM 1', icon: '①', desc: 'Patient Room 1'   },
   { id: 'room2', label: 'ROOM 2', icon: '②', desc: 'Patient Room 2'   },
+  { id: 'room3', label: 'ROOM 3', icon: '③', desc: 'Patient Room 3'   },
 ];
```

### 2. Frontend — `src/hooks/useMqtt.js`

In the `useEffect`, extend the room list for subscriptions and state initialisation:

```diff
-['room1', 'room2'].forEach(room => { … });
+['room1', 'room2', 'room3'].forEach(room => { … });
```

Also add `room3` to the initial `useState` calls for `sensors`, `updated`, `lastSeen`, and `controls`.

### 3. Frontend — `src/components/TabNav.jsx`

Add a tab button for Room 3:

```diff
 const tabs = [
   { id: 'robot', label: '🤖  ROBOT'  },
   { id: 'room1', label: '①  ROOM 1' },
   { id: 'room2', label: '②  ROOM 2' },
+  { id: 'room3', label: '③  ROOM 3' },
 ];
```

### 4. Frontend — `src/App.jsx`

Add `room3` to the condition that renders `<RoomPanel>`:

```diff
-{(activeTab === 'room1' || activeTab === 'room2') && (
+{(activeTab === 'room1' || activeTab === 'room2' || activeTab === 'room3') && (
```

### 5. Backend — `main.js`

```diff
-const ROOMS = ['room1', 'room2'];
+const ROOMS = ['room1', 'room2', 'room3'];
```

---

## Customization

| What | Where |
|------|-------|
| Change MQTT broker address | `MQTT_WS` in `src/config/constants.js` |
| Change backend URL / port | `BACKEND` in `src/config/constants.js` |
| Add / remove sensors | `SENSOR_DEFS` in `src/config/constants.js` + `SENSOR_TOPICS` in `main.js` |
| Add / remove actuators | `CONTROL_DEFS` in `src/config/constants.js` + `CONTROL_TOPICS` in `main.js` |
| Add more rooms | `ROOMS` in `src/config/constants.js` + steps above |
| Styling & theme colors | CSS custom properties in `src/App.css` (`:root`) |
| MQTT connection logic | `src/hooks/useMqtt.js` |
| UI layout / tab routing | `src/App.jsx` |

---

## Troubleshooting

| Problem | Solution |
|---------|----------|
| Dashboard shows **"connecting"** forever | Make sure the MQTT broker is running with a WebSocket listener on port **9001**. |
| Sensor cards show `--` | Verify that your sensor nodes are publishing to the correct topics (`room1/temp`, etc.). |
| Robot dispatch fails | Check that the HTTP backend is running on port **80** and is reachable. |
| `npm run dev` fails | Run `npm install` first, and make sure Node.js ≥ 18 is installed. |
| Controls toggle but don't stick | Make sure the MCU publishes back on `{room}/{device}/status`. |

---

## Tech Stack

- **React 19** — UI framework
- **Vite 7** — Build tool & dev server
- **mqtt.js** — MQTT client for the browser (WebSocket transport)
- **ESLint** — Code linting

---

## License

This project is part of the **Smart Hospital** system. See the root repository for license details.
