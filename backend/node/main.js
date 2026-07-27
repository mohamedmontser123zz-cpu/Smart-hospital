const express = require('express');
const mqtt    = require('mqtt');
const cors    = require('cors');
const path    = require('path');
const os      = require('os');
const fs      = require('fs');

const app  = express();
const PORT = 80;

app.use(cors());
app.use(express.json());

// ── Resolve React build path (local dev vs Pi deployment) ──
const DIST_CANDIDATES = [
  path.join(__dirname, 'client', 'dist'),   // local:  node/client/dist
  path.join(__dirname, '..', 'dist'),       // Pi:     ../dist
];
const DIST_DIR = DIST_CANDIDATES.find(d => fs.existsSync(d)) || DIST_CANDIDATES[0];
console.log(`[STATIC] Serving frontend from ${DIST_DIR}`);

app.use(express.static(DIST_DIR));

// ── Find own IP dynamically ──
function getOwnIP() {
  const nets = os.networkInterfaces();
  for (const name of Object.keys(nets)) {
    for (const net of nets[name]) {
      if (net.family === 'IPv4' && !net.internal) {
        return net.address;
      }
    }
  }
  return '127.0.0.1';
}

const BROKER_IP  = getOwnIP();
const BROKER_URI = `mqtt://${BROKER_IP}:1883`;
console.log(`[MQTT] Connecting to broker at ${BROKER_URI}`);

// ── Topics matching the React client ──
const ROOMS          = ['room1', 'room2'];
const SENSOR_TOPICS  = ['temp', 'humidity', 'mq2', 'mq135', 'flame', 'rain', 'ldr', 'occupancy', 'magnet', 'emergency'];
const CONTROL_TOPICS = ['fan', 'led', 'pump'];
const BATTERY_ROOM_TOPICS = ['v_battery', 'v_main', 'i_room1', 'i_room2', 'i_total', 'active_source'];
const WATCH_TOPICS   = ['status', 'heart_rate', 'spo2', 'temp', 'humidity', 'gsr', 'medex', 'battery', 'finger', 'gsr_contact'];

// ── In-memory state ──
let robotLocation = 'home';
const sensorData   = {};
const controlState = {};
const watchData    = {};
let powerRoomData  = { v_battery: null, v_main: null, i_room1: null, i_room2: null, i_total: null, active_source: null };

ROOMS.forEach(room => {
  sensorData[room]   = {};
  controlState[room] = {};
  SENSOR_TOPICS.forEach(s  => { sensorData[room][s]   = null; });
  CONTROL_TOPICS.forEach(c => { controlState[room][c] = false; });
});
WATCH_TOPICS.forEach(t => { watchData[t] = null; });

// ── MQTT Client ──
const client = mqtt.connect(BROKER_URI);

client.on('connect', () => {
  console.log('[MQTT] Connected to broker');

  // Robot location
  client.subscribe('esp32/location', err => {
    if (!err) console.log('[MQTT] Subscribed to esp32/location');
  });

  // Per-room sensors + control status
  ROOMS.forEach(room => {
    SENSOR_TOPICS.forEach(t  => client.subscribe(`${room}/${t}`));
    CONTROL_TOPICS.forEach(t => client.subscribe(`${room}/${t}/status`));
  });
  WATCH_TOPICS.forEach(t => client.subscribe(`smartwatch/${t}`));
  client.subscribe('battery_room/#');
  client.subscribe('power_room/#');
  console.log('[MQTT] Subscribed to all room + battery_room topics');
});

client.on('message', (topic, message) => {
  const msg = message.toString();

  // Robot location
  if (topic === 'esp32/location') {
    robotLocation = msg;
    console.log(`[MQTT] Robot arrived at: ${robotLocation}`);
    return;
  }

  // Battery Room topics: battery_room/* or power_room/*
  if (topic.startsWith('battery_room/') || topic.startsWith('power_room/')) {
    const key = topic.split('/')[1];
    if (key === 'data') {
      try {
        const parsed = JSON.parse(msg);
        const pData = (parsed.type === 'power_room' && parsed.data) ? parsed.data : parsed;
        powerRoomData = { ...(powerRoomData || {}), ...pData };
      } catch (e) {}
    } else {
      const raw = parseFloat(msg);
      if (!powerRoomData || typeof powerRoomData !== 'object') powerRoomData = {};
      powerRoomData[key] = !isNaN(raw) ? raw : msg;
      console.log(`[BATT] ${key} = ${msg}`);
    }
    return;
  }

  const parts = topic.split('/');

  if (parts.length === 2 && parts[0] === 'smartwatch' && WATCH_TOPICS.includes(parts[1])) {
    watchData[parts[1]] = msg;
    return;
  }

  // Control status: room1/fan/status
  if (parts.length === 3 && parts[2] === 'status') {
    const [room, ctrl] = parts;
    if (controlState[room] && CONTROL_TOPICS.includes(ctrl)) {
      controlState[room][ctrl] = msg === '1' || msg === 'on' || msg === 'true';
      console.log(`[CTRL] ${room}/${ctrl} → ${controlState[room][ctrl] ? 'ON' : 'OFF'}`);
    }
    return;
  }

  // Sensor data: room1/temp
  if (parts.length === 2) {
    const [room, sensor] = parts;
    if (sensorData[room] && SENSOR_TOPICS.includes(sensor)) {
      sensorData[room][sensor] = msg;
    }
  }
});

client.on('error', err => console.error('[MQTT] Error:', err.message));

// ── API: move robot ──
app.get('/move/:room', (req, res) => {
  const { room } = req.params;
  const valid = ['home', 'room1', 'room2'];

  if (!valid.includes(room)) {
    return res.status(400).json({ error: 'Invalid room. Use: home, room1, room2' });
  }

  client.publish('esp32/location', room, { qos: 1 }, (err) => {
    if (err) {
      console.error('[MQTT] Publish error:', err);
      return res.status(500).json({ error: 'MQTT publish failed' });
    }
    console.log(`[CMD] Dispatching robot → ${room}`);
    res.json({ success: true, dispatched: room });
  });
});

// ── API: full status (robot + sensors + controls) ──
app.get('/status', (req, res) => {
  res.json({
    location: robotLocation,
    sensors:  sensorData,
    controls: controlState,
    watch: watchData,
    power_room: powerRoomData,
  });
});

// ── API: per-room sensor data ──
app.get('/sensors/:room', (req, res) => {
  const { room } = req.params;
  if (!sensorData[room]) {
    return res.status(404).json({ error: 'Room not found' });
  }
  res.json(sensorData[room]);
});

// ── API: toggle control (fan/led/pump) ──
app.post('/control/:room/:device', (req, res) => {
  const { room, device } = req.params;

  if (!controlState[room]) {
    return res.status(404).json({ error: 'Room not found' });
  }
  if (!CONTROL_TOPICS.includes(device)) {
    return res.status(400).json({ error: 'Invalid device. Use: fan, led, pump' });
  }

  const state = req.body.state ? '1' : '0';
  client.publish(`${room}/${device}/set`, state, { qos: 1 }, (err) => {
    if (err) {
      return res.status(500).json({ error: 'MQTT publish failed' });
    }
    controlState[room][device] = !!req.body.state;
    console.log(`[CTRL] ${room}/${device}/set → ${state}`);
    res.json({ success: true, room, device, state: !!req.body.state });
  });
});

// ── API: health check ──
app.get('/health', (req, res) => {
  res.json({ ok: true, mqtt: client.connected, broker: BROKER_IP });
});

// ── Catch-all: serve React for any route ──
app.use((req, res) => {
  res.sendFile(path.join(DIST_DIR, 'index.html'));
});




// ── Start server ──
app.listen(PORT, '0.0.0.0', () => {
  console.log(`[SERVER] Running at http://${BROKER_IP}:${PORT}`);
  console.log(`[SERVER] Health: http://${BROKER_IP}:${PORT}/health`);
});
