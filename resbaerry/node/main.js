const express = require('express');
const mqtt    = require('mqtt');
const cors    = require('cors');
const path    = require('path');
const os      = require('os');
const fs      = require('fs');
const { spawn } = require('child_process');

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

// ── Find own IP — prefer the hotspot interface (10.42.x.x) ──
function getOwnIP() {
  const nets = os.networkInterfaces();
  let fallback = '127.0.0.1';
  for (const name of Object.keys(nets)) {
    for (const net of nets[name]) {
      if (net.family === 'IPv4' && !net.internal) {
        // nmcli hotspot always assigns 10.42.0.1 — prefer this subnet
        if (net.address.startsWith('10.42.')) return net.address;
        fallback = net.address;
      }
    }
  }
  return fallback;
}

const BROKER_IP  = getOwnIP();
const BROKER_URI = `mqtt://${BROKER_IP}:1883`;
console.log(`[MQTT] Connecting to broker at ${BROKER_URI}`);

// ── Topics matching the React client ──
const ROOMS          = ['room1', 'room2'];
const SENSOR_TOPICS  = ['temp', 'humidity', 'mq2', 'mq135', 'flame', 'rain', 'ldr', 'occupancy', 'magnet', 'emergency'];
const CONTROL_TOPICS = ['fan', 'led', 'pump'];
const WATCH_TOPICS   = ['status', 'heart_rate', 'spo2', 'temp', 'humidity', 'gsr', 'medex', 'battery', 'finger', 'gsr_contact'];

// ── In-memory state ──
let robotLocation = 'home';
const sensorData   = {};
const controlState = {};
const watchData    = {};
let powerRoomData  = null;

ROOMS.forEach(room => {
  sensorData[room]   = {};
  controlState[room] = {};
  SENSOR_TOPICS.forEach(s  => { sensorData[room][s]   = null; });
  CONTROL_TOPICS.forEach(c => { controlState[room][c] = false; });
});
WATCH_TOPICS.forEach(t => { watchData[t] = null; });

const sseClients = new Set();
let lastSeen = Date.now();

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
    }
    const payload = JSON.stringify({ power_room: powerRoomData });
    sseClients.forEach(res => res.write(`data: ${payload}\n\n`));
    return;
  }

  const parts = topic.split('/');

  if (parts.length === 2 && parts[0] === 'smartwatch' && WATCH_TOPICS.includes(parts[1])) {
    const key = parts[1];
    watchData[key] = msg;
    if (key === 'status') lastSeen = Date.now();
    const payload = JSON.stringify({ [key]: watchData[key] });
    sseClients.forEach(res => res.write(`data: ${payload}\n\n`));
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

// Offline detection loop
setInterval(() => {
  const isOnline = Date.now() - lastSeen < 5000;
  if ((watchData.status === 'online') !== isOnline) {
      watchData.status = isOnline ? 'online' : 'offline';
      const payload = JSON.stringify({ status: watchData.status });
      sseClients.forEach(res => res.write(`data: ${payload}\n\n`));
  }
}, 1000);

// ── AI Subprocess ──────────────────────────────────────────
let aiData = null;
let aiWorker = null;

function startAiWorker() {
  const scriptPath = path.join(__dirname, '..', 'ai', 'worker.py');
  
  aiWorker = spawn('python', [scriptPath], {
      cwd: path.join(__dirname, '..', 'ai')
  });

  aiWorker.stdout.on('data', (data) => {
    const lines = data.toString().split('\n');
    for (const line of lines) {
      if (!line.trim()) continue;
      try {
        const parsed = JSON.parse(line.trim());
        if (parsed.status === 'ready') {
            console.log('[AI] Python Worker is ready');
            continue;
        }
        if (!parsed.error) {
          aiData = parsed;
          const payload = JSON.stringify({ ai_prediction: aiData });
          sseClients.forEach(client => client.write(`data: ${payload}\n\n`));
          
          // Publish AI prediction over MQTT so hospital dashboard can subscribe
          client.publish('smartwatch/ai_prediction', JSON.stringify(aiData), { retain: true });
        } else {
            console.error("[AI] Error from worker:", parsed.error);
        }
      } catch (e) {}
    }
  });

  aiWorker.stderr.on('data', (data) => {
    console.error(`[AI STDERR]: ${data}`);
  });

  aiWorker.on('close', (code) => {
    console.log(`[AI] Worker process exited with code ${code}. Restarting in 5s...`);
    aiWorker = null;
    setTimeout(startAiWorker, 5000);
  });
}

startAiWorker();

setInterval(() => {
  const hr = parseFloat(watchData.heart_rate) || 0;
  const spo2Val = parseFloat(watchData.spo2) || 0;
  const tempVal = parseFloat(watchData.temp) || 0;
  const medexVal = parseFloat(watchData.medex) || 0;

  if (watchData.status === 'online' && (hr > 0 || spo2Val > 0)) {
      if (aiWorker) {
          const postData = JSON.stringify({
            heart_rate: hr > 0 ? hr : 75,
            spo2: spo2Val > 0 ? spo2Val : 98,
            temperature: tempVal > 25 ? tempVal : 36.6,
            medex: medexVal >= 0 ? medexVal : 35
          });
          aiWorker.stdin.write(postData + '\n');
      }
  } else if (watchData.status === 'offline' && aiData !== null) {
      aiData = null;
      const payload = JSON.stringify({ ai_prediction: null });
      sseClients.forEach(client => client.write(`data: ${payload}\n\n`));
  }
}, 3000);

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
    ai_prediction: aiData,
  });
});

app.get('/api/watch/stream', (req, res) => {
  res.setHeader('Content-Type',  'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection',    'keep-alive');
  const initialData = { ...watchData, ai_prediction: aiData, power_room: powerRoomData };
  res.write(`data: ${JSON.stringify(initialData)}\n\n`);
  sseClients.add(res);
  req.on('close', () => sseClients.delete(res));
});

const usersFile = path.join(__dirname, 'users.txt');

function loadUsers() {
    if (!fs.existsSync(usersFile)) {
        const defaults = ['user@example.com,password123,Alex'];
        fs.writeFileSync(usersFile, defaults.join('\n') + '\n');
    }
    const content = fs.readFileSync(usersFile, 'utf8');
    const users = [];
    content.split('\n').forEach(line => {
        if (line.trim()) {
            const [email, password, name] = line.split(',');
            users.push({ email, password, name });
        }
    });
    return users;
}

app.post('/login', (req, res) => {
    const { email, password } = req.body;
    const users = loadUsers();
    const user = users.find(u => u.email === email && u.password === password);
    if (user) {
        res.json({ success: true, user: { email: user.email, name: user.name } });
    } else {
        res.status(401).json({ success: false, message: 'Invalid email or password' });
    }
});

app.post('/signup', (req, res) => {
    const { email, password, name } = req.body;
    if (!email || !password || !name) {
        return res.status(400).json({ success: false, message: 'All fields are required' });
    }
    const users = loadUsers();
    if (users.some(u => u.email === email)) {
        return res.status(409).json({ success: false, message: 'User already exists' });
    }
    fs.appendFileSync(usersFile, `${email},${password},${name}\n`);
    res.json({ success: true, user: { email, name } });
});

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
app.use('/watch', (req, res) => {
  res.sendFile(path.join(DIST_DIR, 'watch', 'index.html'));
});

app.use((req, res) => {
  res.sendFile(path.join(DIST_DIR, 'index.html'));
});




// ── Start server ──
app.listen(PORT, '0.0.0.0', () => {
  console.log(`[SERVER] Running at http://${BROKER_IP}:${PORT}`);
  console.log(`[SERVER] Health: http://${BROKER_IP}:${PORT}/health`);
});
