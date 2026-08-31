import { SENSOR_DEFS, CONTROL_DEFS } from '../config/constants';

/**
 * RoomPanel
 *
 * Displays all sensor cards and actuator toggles for a single room.
 *
 * Props:
 *  - room      string   – 'room1' | 'room2'
 *  - sensors   object   – { temp: '25.3', humidity: '60', … }
 *  - updated   object   – { temp: timestamp, … }  (Date.now() when last updated)
 *  - lastSeen  Date|null
 *  - controls  object   – { fan: bool, led: bool, … }
 *  - onToggle  function – (ctrlKey: string) => void
 *  - onEmergencyTrigger function – () => void
 *  - emergencyMode bool – whether emergency mode is active
 */
export default function RoomPanel({ room, sensors, updated, lastSeen, controls, onToggle, onEmergencyTrigger, emergencyMode }) {
  return (
    <div className="room-view fade-in">

      {/* ── Room header ───────────────────────────────────────────────────── */}
      <div className="room-header">
        <div>
          <div className="section-eyebrow">ENVIRONMENTAL DATA</div>
          <h2 className="room-title">
            {room === 'room1' ? 'Patient Room 1' : 'Patient Room 2'}
          </h2>
        </div>
        {lastSeen && (
          <div className="last-seen">
            Last update<br />
            <strong>{lastSeen.toLocaleTimeString()}</strong>
          </div>
        )}
      </div>

      {/* ── Emergency banner ──────────────────────────────────────────────── */}
      {sensors.emergency === '1' && (
        <div className="emergency-banner">
          <span className="emergency-icon">🚨</span>
          <span>EMERGENCY ACTIVE — Immediate attention required</span>
        </div>
      )}

      {/* ── Fire Alarm banner ──────────────────────────────────────────────── */}
      {sensors.fire_alarm === '1' && (
        <div className="emergency-banner fire-alarm-banner">
          <span className="emergency-icon">🧯</span>
          <span>FIRE DETECTED — Water pump activated, buzzer sounding for 10s</span>
        </div>
      )}

      {/* ── Buzzer active banner ───────────────────────────────────────────── */}
      {sensors.buzzer === '1' && (
        <div className="emergency-banner buzzer-banner">
          <span className="emergency-icon">🔔</span>
          <span>BUZZER ACTIVE — Alarm sounding (GPIO 26)</span>
        </div>
      )}

      {/* ── Sensor cards grid ─────────────────────────────────────────────── */}
      <div className="sensors-grid">
        {Object.entries(SENSOR_DEFS).map(([key, def]) => {
          const rawVal = sensors[key];
          const isNew  = updated[key] && Date.now() - updated[key] < 2000;
          const isBool = def.bool;
          const boolOn = rawVal === '1' || rawVal === 'true';
          const isEmergencyCard = key === 'emergency';

          // Convert raw ADC (0-4095) to percentage for sensors with '%' unit
          // Exclude 'humidity' which is already a real percentage from DHT22
          const ADC_SENSORS = ['mq2', 'mq135', 'flame', 'rain', 'ldr'];
          let displayVal = rawVal;
          if (!isBool && ADC_SENSORS.includes(key) && rawVal !== '--' && rawVal !== null && rawVal !== undefined) {
            const num = parseFloat(rawVal);
            if (!isNaN(num)) {
              displayVal = ((num / 4095) * 100).toFixed(1);
            }
          }

          return (
            <div
              key={key}
              className={`sensor-card ${isNew ? 'flash' : ''} ${isEmergencyCard && boolOn ? 'emergency-card' : ''} ${isEmergencyCard ? 'emergency-clickable' : ''}`}
              style={{ '--c': def.color }}
              onClick={isEmergencyCard ? onEmergencyTrigger : undefined}
              role={isEmergencyCard ? 'button' : undefined}
              tabIndex={isEmergencyCard ? 0 : undefined}
            >
              <div className="sensor-glow" />
              <div className="sensor-top">
                <span className="sensor-icon">{def.icon}</span>
                <span className={`sensor-live-dot ${isNew ? 'on' : ''}`} />
              </div>
              <div className="sensor-name">{def.label}</div>
              <div className={`sensor-value ${isBool ? (boolOn ? 'bool-on' : 'bool-off') : ''}`}>
                {isBool
                  ? (rawVal === '--' ? '--' : boolOn ? 'YES' : 'NO')
                  : displayVal}
              </div>
              {!isBool && <div className="sensor-unit">{def.unit}</div>}
              {isEmergencyCard && (
                <div className="emergency-trigger-label">
                  {emergencyMode ? '⚠ ACTIVE' : '▶ CLICK TO ACTIVATE'}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* ── Room controls ─────────────────────────────────────────────────── */}
      <div className="section-eyebrow" style={{ marginTop: '2rem' }}>ROOM CONTROLS</div>
      <div className="controls-grid">
        {Object.entries(CONTROL_DEFS).map(([key, def]) => {
          const isOn = controls[key];
          return (
            <button
              key={key}
              className={`control-btn ${isOn ? 'on' : 'off'}`}
              onClick={() => onToggle(key)}
            >
              <span className="control-icon">{def.icon}</span>
              <div className="control-info">
                <div className="control-label">{def.label}</div>
                <div className={`control-status ${isOn ? 'on' : 'off'}`}>
                  {isOn ? 'ON' : 'OFF'}
                </div>
              </div>
              <div className={`control-toggle ${isOn ? 'on' : 'off'}`}>
                <div className="control-toggle-knob" />
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

