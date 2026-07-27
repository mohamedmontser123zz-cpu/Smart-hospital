import { useState, useEffect, useRef } from 'react';
import mqtt from 'mqtt';
import {
  MQTT_WS,
  SENSOR_DEFS,
  CONTROL_DEFS,
  WATCH_DEFS,
  POWER_ROOM_TOPICS,
  emptySensors,
  emptyControls,
  emptyWatch,
  emptyPowerRoom,
} from '../config/constants';

/**
 * useMqtt
 *
 * Manages the MQTT WebSocket connection for the entire app.
 *
 * Returns:
 *  - mqttStatus   – 'connecting' | 'connected' | 'disconnected' | 'error'
 *  - robotPos     – current robot location id ('home' | 'room1' | 'room2')
 *  - robotMoving  – true while a dispatch is in-flight
 *  - dispatchMsg  – human-readable status string for the dispatch panel
 *  - sensors      – { room1: { temp, humidity, … }, room2: { … } }
 *  - updated      – { room1: { temp: timestamp, … }, room2: { … } }
 *  - lastSeen     – { room1: Date|null, room2: Date|null }
 *  - controls     – { room1: { fan: bool, led: bool }, room2: { … } }
 *  - setRobotMoving / setDispatchMsg – used by dispatchRobot in App
 *  - publishControl(room, ctrlKey, newState) – publish a control command
 *  - powerRoomData – { v_battery, v_main, i_room1, i_room2, i_total, active_source }
 */
export function useMqtt() {
  const [mqttStatus,   setMqttStatus]   = useState('connecting');
  const [robotPos,     setRobotPos]     = useState('home');
  const [robotMoving,  setRobotMoving]  = useState(false);
  const [dispatchMsg,  setDispatchMsg]  = useState('');
  const [sensors,      setSensors]      = useState({ room1: emptySensors(), room2: emptySensors() });
  const [updated,      setUpdated]      = useState({ room1: {}, room2: {} });
  const [lastSeen,     setLastSeen]     = useState({ room1: null, room2: null });
  const [controls,     setControls]     = useState({ room1: emptyControls(), room2: emptyControls() });
  const [watch,        setWatch]        = useState(emptyWatch());
  const [watchUpdated, setWatchUpdated] = useState({});
  const [watchLastSeen, setWatchLastSeen] = useState(null);
  const [powerRoomData, setPowerRoomData] = useState(emptyPowerRoom());
  const [powerRoomUpdated, setPowerRoomUpdated] = useState({});
  const [powerRoomLastSeen, setPowerRoomLastSeen] = useState(null);

  const clientRef = useRef(null);

  useEffect(() => {
    const client = mqtt.connect(MQTT_WS);
    clientRef.current = client;

    client.on('connect', () => {
      setMqttStatus('connected');
      ['room1', 'room2'].forEach(room => {
        Object.values(SENSOR_DEFS).forEach(s  => client.subscribe(`${room}/${s.topic}`));
        Object.values(CONTROL_DEFS).forEach(c => client.subscribe(`${room}/${c.topic}/status`));
      });
      Object.values(WATCH_DEFS).forEach(w => client.subscribe(`smartwatch/${w.topic}`));
      client.subscribe('smartwatch/ai_prediction');
      client.subscribe('esp32/location');
      // Subscribe to all battery_room and power_room topics
      client.subscribe('battery_room/#');
      client.subscribe('power_room/#');
    });

    client.on('error',      () => setMqttStatus('error'));
    client.on('disconnect', () => setMqttStatus('disconnected'));

    client.on('message', (topic, message) => {
      const msg = message.toString();

      // ── Robot location echo ──────────────────────────────────────────────
      if (topic === 'esp32/location') {
        setRobotPos(msg);
        setRobotMoving(false);
        setDispatchMsg(`Arrived at ${msg}`);
        return;
      }

      // ── Battery Room topics (battery_room/* or power_room/*) ───
      if (topic.startsWith('battery_room/') || topic.startsWith('power_room/')) {
        const key = topic.split('/')[1];

        if (key === 'data') {
          try {
            const parsed = JSON.parse(msg);
            const pData = (parsed.type === 'power_room' && parsed.data) ? parsed.data : parsed;
            setPowerRoomData(prev => ({ ...(prev || {}), ...pData }));
            setPowerRoomUpdated(prev => ({ ...prev, data: Date.now() }));
            setPowerRoomLastSeen(new Date());
          } catch (e) {
            console.error('Invalid power room JSON:', e);
          }
          return;
        }

        const numVal = parseFloat(msg);
        const parsedVal = !isNaN(numVal) ? numVal : msg;

        setPowerRoomData(prev => ({
          ...(prev || {}),
          [key]: parsedVal,
        }));
        setPowerRoomUpdated(prev => ({ ...prev, [key]: Date.now() }));
        setPowerRoomLastSeen(new Date());
        return;
      }

      const parts = topic.split('/');
      const [room, key] = parts;

      // ── Smart watch data (e.g. smartwatch/heart_rate) ───────────────────
      if (parts.length === 2 && room === 'smartwatch') {
        if (key === 'ai_prediction') {
          try {
            setWatch(prev => ({ ...prev, ai_prediction: JSON.parse(msg) }));
          } catch(e) {
            console.error("Invalid AI JSON", e);
          }
          return;
        }

        const watchKey = Object.keys(WATCH_DEFS).find(k => WATCH_DEFS[k].topic === key);
        if (!watchKey) return;
        setWatch(prev => ({ ...prev, [watchKey]: msg }));
        setWatchUpdated(prev => ({ ...prev, [watchKey]: Date.now() }));
        setWatchLastSeen(new Date());
        return;
      }

      // ── Control status (e.g. room1/fan/status) ───────────────────────────
      if (parts.length === 3 && parts[2] === 'status') {
        const ctrlKey = Object.keys(CONTROL_DEFS).find(k => CONTROL_DEFS[k].topic === key);
        if (ctrlKey) {
          setControls(prev => ({
            ...prev,
            [room]: { ...prev[room], [ctrlKey]: msg === '1' || msg === 'on' || msg === 'true' },
          }));
        }
        return;
      }

      // ── Sensor reading ────────────────────────────────────────────────────
      const sensorKey = Object.keys(SENSOR_DEFS).find(k => SENSOR_DEFS[k].topic === key);
      if (!sensorKey) return;

      setSensors(prev => ({ ...prev, [room]: { ...prev[room], [sensorKey]: msg } }));
      setUpdated(prev => ({ ...prev, [room]: { ...prev[room], [sensorKey]: Date.now() } }));
      setLastSeen(prev => ({ ...prev, [room]: new Date() }));
    });

    return () => client.end();
  }, []);

  /** Publish a fan/led/… command: room1/fan/set → '1' or '0' */
  const publishControl = (room, ctrlKey, newState) => {
    const client = clientRef.current;
    if (!client) return;
    const topic = `${room}/${CONTROL_DEFS[ctrlKey].topic}/set`;
    client.publish(topic, newState ? '1' : '0');
  };

  return {
    mqttStatus,
    robotPos, setRobotPos,
    robotMoving, setRobotMoving,
    dispatchMsg, setDispatchMsg,
    sensors,
    updated,
    lastSeen,
    controls, setControls,
    watch,
    watchUpdated,
    watchLastSeen,
    powerRoomData,
    powerRoomUpdated,
    powerRoomLastSeen,
    publishControl,
  };
}
