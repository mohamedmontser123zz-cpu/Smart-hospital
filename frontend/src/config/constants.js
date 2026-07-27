// ─── Network ──────────────────────────────────────────────────────────────────
export const BACKEND  = `http://${window.location.hostname}:80`;
export const MQTT_WS  = `ws://${window.location.hostname}:9001`;

// ─── Rooms ────────────────────────────────────────────────────────────────────
export const ROOMS = [
  { id: 'home',  label: 'BASE',   icon: '⬡', desc: 'Charging Station' },
  { id: 'room1', label: 'ROOM 1', icon: '①', desc: 'Patient Room 1'   },
  { id: 'room2', label: 'ROOM 2', icon: '②', desc: 'Patient Room 2'   },
];

// ─── Sensor definitions ───────────────────────────────────────────────────────
// To add a new sensor, add an entry here and in main.js SENSOR_TOPICS.
// Fields: label, unit, icon, color (hex), topic (MQTT sub-topic), bool (optional)
export const SENSOR_DEFS = {
  temp:      { label: 'Temperature', unit: '°C',  icon: '🌡', color: '#f97316', topic: 'temp'      },
  humidity:  { label: 'Humidity',    unit: '%',    icon: '💧', color: '#38bdf8', topic: 'humidity'  },
  mq2:       { label: 'Gas MQ2',     unit: 'ADC',  icon: '🔥', color: '#f59e0b', topic: 'mq2'       },
  mq135:     { label: 'Air Quality', unit: 'ADC',  icon: '🌫', color: '#a78bfa', topic: 'mq135'     },
  flame:     { label: 'Flame',       unit: 'ADC',  icon: '🔥', color: '#ef4444', topic: 'flame'     },
  rain:      { label: 'Raindrop',    unit: 'ADC',  icon: '☔', color: '#0ea5e9', topic: 'rain'      },
  ldr:       { label: 'Light',       unit: 'ADC',  icon: '☀',  color: '#fcd34d', topic: 'ldr'       },
  occupancy: { label: 'Occupancy',   unit: '',     icon: '🚶', color: '#10b981', topic: 'occupancy', bool: true },
  magnet:    { label: 'Door',        unit: '',     icon: '🔒', color: '#ec4899', topic: 'magnet',    bool: true },
  emergency: { label: 'Emergency',   unit: '',     icon: '🚨', color: '#ff1744', topic: 'emergency', bool: true },
};

// ─── Control / actuator definitions ──────────────────────────────────────────
// To add a new actuator, add an entry here and in main.js CONTROL_TOPICS.
// Fields: label, icon, topic (MQTT sub-topic)
export const CONTROL_DEFS = {
  fan:  { label: 'Fan',        icon: '🌀', topic: 'fan' },
  led:  { label: 'LED',        icon: '💡', topic: 'led' },
  pump: { label: 'Water Pump', icon: '🚿', topic: 'pump' },
};

export const WATCH_DEFS = {
  status:      { label: 'Connection', unit: '',    icon: 'ON', topic: 'status'      },
  heart_rate:  { label: 'Heart Rate', unit: 'BPM', icon: '♥',  topic: 'heart_rate'  },
  spo2:        { label: 'SpO2',       unit: '%',   icon: 'O2', topic: 'spo2'        },
  temp:        { label: 'Body Temp',  unit: '°C',  icon: 'T',  topic: 'temp'        },
  humidity:    { label: 'Humidity',   unit: '%',   icon: 'H',  topic: 'humidity'    },
  gsr:         { label: 'GSR Raw',    unit: 'ADC', icon: 'G',  topic: 'gsr'         },
  medex:       { label: 'MEDEX',      unit: '%',   icon: 'M',  topic: 'medex'       },
  battery:     { label: 'Battery',    unit: '%',   icon: 'B',  topic: 'battery'     },
  finger:      { label: 'Finger',     unit: '',    icon: 'F',  topic: 'finger',      bool: true },
  gsr_contact: { label: 'GSR Contact', unit: '',   icon: 'C',  topic: 'gsr_contact', bool: true },
};

// ─── Power / Battery Room definitions ─────────────────────────────────────────
// Topics published by the Battery Room ESP32 on battery_room/<topic>
export const POWER_ROOM_TOPICS = ['v_battery', 'v_main', 'v_room1', 'v_room2', 'i_room1', 'i_room2', 'i_total', 'active_source'];

export const emptyPowerRoom = () => ({
  v_battery: null,
  v_main: null,
  v_room1: null,
  v_room2: null,
  i_room1: null,
  i_room2: null,
  i_total: null,
  active_source: null,
});

export const emptyWatch = () =>
  Object.fromEntries(Object.keys(WATCH_DEFS).map(k => [k, '--']));

// ─── State factories ──────────────────────────────────────────────────────────
/** Returns { fan: false, led: false, … } for each entry in CONTROL_DEFS */
export const emptyControls = () =>
  Object.fromEntries(Object.keys(CONTROL_DEFS).map(k => [k, false]));

/** Returns { temp: '--', humidity: '--', … } for each entry in SENSOR_DEFS */
export const emptySensors = () =>
  Object.fromEntries(Object.keys(SENSOR_DEFS).map(k => [k, '--']));
