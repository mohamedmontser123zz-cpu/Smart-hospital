const express = require('express');
const mqtt    = require('mqtt');
const cors    = require('cors');
const fs      = require('fs');
const path    = require('path');
const { spawn } = require('child_process');

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

let lastSeen = Date.now();

mqttClient.on('connect', () => {
  console.log('[MQTT] Connected');
  Object.keys(watchData).forEach(t => mqttClient.subscribe(`smartwatch/${t}`));
});

mqttClient.on('message', (topic, message) => {
  const key = topic.replace('smartwatch/', '');
  if (key in watchData) {
    watchData[key] = message.toString();
    // Update offline detection
    if (key === 'status') lastSeen = Date.now();
    // Push to all SSE listeners
    const payload = JSON.stringify({ [key]: watchData[key] });
    sseClients.forEach(res => res.write(`data: ${payload}\n\n`));
  }
});

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
  const scriptPath = path.join(__dirname, '../ai/worker.py');
  
  // Try to use 'python' or 'python3' based on environment, but typically 'python' is fine on Windows
  aiWorker = spawn('python', [scriptPath], {
      cwd: path.join(__dirname, '../ai')
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
          // Push AI update to SSE clients
          const payload = JSON.stringify({ ai_prediction: aiData });
          sseClients.forEach(client => client.write(`data: ${payload}\n\n`));
        } else {
            console.error("[AI] Error from worker:", parsed.error);
        }
      } catch (e) {
        // Sometimes pandas outputs warnings to stdout, we just ignore non-json lines
      }
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

// Send data to AI worker every 3 seconds if finger is on
setInterval(() => {
  if (watchData.status === 'online' && watchData.heart_rate && watchData.spo2 && watchData.finger === '1') {
      if (aiWorker) {
          const postData = JSON.stringify({
            heart_rate: watchData.heart_rate,
            spo2: watchData.spo2,
            temperature: watchData.temp || 0,
            medex: watchData.medex || 0
          });
          aiWorker.stdin.write(postData + '\n');
      }
  } else if (watchData.finger !== '1' && aiData !== null) {
      // Clear AI data if finger is removed
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

// ── SSE: real-time stream (no polling needed) ─────────────────
app.get('/api/watch/stream', (req, res) => {
  res.setHeader('Content-Type',  'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection',    'keep-alive');
  // Send initial snapshot just in case
  const initialData = { ...watchData, ai_prediction: aiData };
  res.write(`data: ${JSON.stringify(initialData)}\n\n`);
  sseClients.add(res);
  req.on('close', () => sseClients.delete(res));
});

// ── File-based User Logic ────────────────────────────────────
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

app.listen(3001, () => console.log('[SERVER] Running on port 3001'));