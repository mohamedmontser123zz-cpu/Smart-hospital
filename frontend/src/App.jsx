import React, { useState, useEffect, useCallback, useRef } from 'react';
import { BACKEND, CONTROL_DEFS } from './config/constants';
import { useMqtt } from './hooks/useMqtt';
import { useEmergencyAlarm } from './hooks/useEmergencyAlarm';
import Header    from './components/Header';
import TabNav    from './components/TabNav';
import RobotView from './components/RobotView';
import RoomPanel from './components/RoomPanel';
import PowerRoomView from './components/PowerRoomView';
import WatchView from './components/WatchView';
import LoginPage from './components/LoginPage';
import './App.css';
import './PowerRoomStyle.css';
/**
 * App — top-level orchestrator
 *
 * Responsibilities:
 *  - Provides the active-tab state
 *  - Calls useMqtt() to get live sensor / control data
 *  - Implements dispatchRobot (HTTP) and toggleControl (MQTT publish)
 *  - Renders layout shell + routes to the correct view
 *
 * All UI details live in their dedicated component files:
 *  src/components/Header.jsx
 *  src/components/TabNav.jsx
 *  src/components/RobotView.jsx
 *  src/components/RoomPanel.jsx
 *
 * All configuration (sensor list, room list, …) is in:
 *  src/config/constants.js
 *
 * MQTT logic is in:
 *  src/hooks/useMqtt.js
 */
export default function App() {
  const [activeTab, setActiveTab] = useState('robot');
  const [emergencyMode, setEmergencyMode] = useState(false);

  // ── Smartwatch auth state (login only gates the watch tab) ─────────────────
  const [watchUser, setWatchUser] = useState(() => {
    try {
      const saved = localStorage.getItem('medex_watch_user');
      return saved ? JSON.parse(saved) : null;
    } catch { return null; }
  });

  const handleWatchLogin = (userData) => {
    setWatchUser(userData);
    localStorage.setItem('medex_watch_user', JSON.stringify(userData));
  };

  const handleWatchLogout = () => {
    setWatchUser(null);
    localStorage.removeItem('medex_watch_user');
  };

  const { startAlarm, stopAlarm } = useEmergencyAlarm();

  const {
    mqttStatus,
    robotPos,
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
  } = useMqtt();

  // ── Emergency mode toggle ─────────────────────────────────────────────────
  const emergencyTimerRef = useRef(null);

  const triggerEmergency = useCallback(() => {
    setEmergencyMode(true);
    startAlarm();

    // Auto-dismiss after 10 seconds
    if (emergencyTimerRef.current) clearTimeout(emergencyTimerRef.current);
    emergencyTimerRef.current = setTimeout(() => {
      setEmergencyMode(false);
      stopAlarm();
      emergencyTimerRef.current = null;
    }, 10000);
  }, [startAlarm, stopAlarm]);

  const dismissEmergency = useCallback(() => {
    setEmergencyMode(false);
    stopAlarm();
    if (emergencyTimerRef.current) {
      clearTimeout(emergencyTimerRef.current);
      emergencyTimerRef.current = null;
    }
  }, [stopAlarm]);

  // ── Auto-trigger emergency from MQTT sensor data (emergency btn or fire alarm) ──
  useEffect(() => {
    const room1 = sensors.room1 || {};
    const isEmergency = room1.emergency === '1';
    const isFireAlarm = room1.fire_alarm === '1';

    if ((isEmergency || isFireAlarm) && !emergencyMode) {
      triggerEmergency();
    }
  }, [sensors.room1?.emergency, sensors.room1?.fire_alarm]); // eslint-disable-line react-hooks/exhaustive-deps

  // Toggle body class so the CSS animations apply globally
  useEffect(() => {
    if (emergencyMode) {
      document.body.classList.add('emergency-active');
    } else {
      document.body.classList.remove('emergency-active');
    }
    return () => document.body.classList.remove('emergency-active');
  }, [emergencyMode]);

  // ── Robot dispatch (HTTP → backend → MQTT) ─────────────────────────────────
  const dispatchRobot = async (roomId) => {
    if (robotMoving) return;
    setRobotMoving(true);
    setDispatchMsg(`Dispatching to ${roomId}…`);
    try {
      await fetch(`${BACKEND}/move/${roomId}`);
    } catch {
      setDispatchMsg('Connection error — check backend');
      setRobotMoving(false);
    }
  };

  // ── Actuator toggle (MQTT publish + optimistic UI update) ─────────────────
  const toggleControl = (room, ctrlKey) => {
    const newState = !controls[room][ctrlKey];
    publishControl(room, ctrlKey, newState);
    // Optimistic update so the UI responds instantly
    setControls(prev => ({
      ...prev,
      [room]: { ...prev[room], [ctrlKey]: newState },
    }));
  };

  return (
    <div className={`app ${emergencyMode ? 'emergency-shake' : ''}`}>
      {/* Decorative background layers */}
      <div className="bg-grid" />
      <div className="bg-scanline" />

      {/* ── Full-page emergency overlay ──────────────────────────────── */}
      {emergencyMode && (
        <div className="emergency-overlay" onClick={dismissEmergency}>
          <div className="emergency-overlay-vignette" />
          <div className="emergency-overlay-scanlines" />
          <div className="emergency-overlay-content">
            <div className="emergency-siren-icon">🚨</div>
            <h1 className="emergency-overlay-title">EMERGENCY</h1>
            <p className="emergency-overlay-sub">IMMEDIATE ATTENTION REQUIRED</p>
            <div className="emergency-heartbeat-line">
              <svg viewBox="0 0 400 60" preserveAspectRatio="none">
                <polyline
                  className="heartbeat-path"
                  fill="none"
                  stroke="#ff1744"
                  strokeWidth="2.5"
                  points="0,30 60,30 80,30 90,8 100,52 110,30 130,30 200,30 220,30 230,8 240,52 250,30 270,30 340,30 360,30 370,8 380,52 390,30 400,30"
                />
              </svg>
            </div>
            <button className="emergency-dismiss-btn" onClick={dismissEmergency}>
              ✕ DISMISS EMERGENCY
            </button>
          </div>
        </div>
      )}

      <Header mqttStatus={mqttStatus} />

      <TabNav
        activeTab={activeTab}
        lastSeen={lastSeen}
        onSelect={setActiveTab}
      />

      <main className="main">

        {/* ── Robot tab ──────────────────────────────────────────────────── */}
        {activeTab === 'robot' && (
          <RobotView
            robotPos={robotPos}
            robotMoving={robotMoving}
            dispatchMsg={dispatchMsg}
            sensors={sensors}
            onDispatch={dispatchRobot}
            onRoomSelect={setActiveTab}
          />
        )}

        {/* ── Room tabs (room1 / room2) ──────────────────────────────────── */}
        {(activeTab === 'room1' || activeTab === 'room2') && (
          <RoomPanel
            room={activeTab}
            sensors={sensors[activeTab]}
            updated={updated[activeTab]}
            lastSeen={lastSeen[activeTab]}
            controls={controls[activeTab]}
            onToggle={(ctrlKey) => toggleControl(activeTab, ctrlKey)}
            onEmergencyTrigger={triggerEmergency}
            emergencyMode={emergencyMode}
          />
        )}
        {activeTab === 'power_room' && (
          <PowerRoomView
            data={powerRoomData}
            updated={powerRoomUpdated}
            lastSeen={powerRoomLastSeen}
          />
        )}

        {/* ── Watch tab: requires login ──────────────────────────────────── */}
        {activeTab === 'watch' && (
          watchUser ? (
            <WatchView
              watch={watch}
              updated={watchUpdated}
              lastSeen={watchLastSeen}
              user={watchUser}
              onLogout={handleWatchLogout}
            />
          ) : (
            <LoginPage onLogin={handleWatchLogin} />
          )
        )}

      </main>
    </div>
  );
}
