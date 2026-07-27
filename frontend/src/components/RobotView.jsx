import { ROOMS } from '../config/constants';

/**
 * RobotView
 *
 * Renders the Robot tab:
 *  • Floor map with animated robot marker
 *  • Dispatch command buttons
 *  • Quick sensor summary cards for both rooms
 *
 * Props:
 *  - robotPos      string    – 'home' | 'room1' | 'room2'
 *  - robotMoving   bool      – true while dispatch is in-flight
 *  - dispatchMsg   string    – status text shown below buttons
 *  - sensors       object    – { room1: {…}, room2: {…} }
 *  - onDispatch    function  – (roomId: string) => void
 *  - onRoomSelect  function  – (roomId: string) => void  (for "View full data →")
 */
export default function RobotView({
  robotPos,
  robotMoving,
  dispatchMsg,
  sensors,
  onDispatch,
  onRoomSelect,
}) {
  // Map room id → horizontal percentage on the floor-map strip
  const posLeft = { home: '8%', room1: '50%', room2: '92%' };

  return (
    <div className="robot-view fade-in">

      {/* ── Floor map ────────────────────────────────────────────────────── */}
      <div className="map-card">
        <div className="map-label">FLOOR MAP — WING A</div>
        <div className="floor-map">
          <div className="corridor" />

          {ROOMS.map((room, i) => {
            const pct = i === 0 ? 8 : i === 1 ? 50 : 92;
            const isHere = robotPos === room.id;
            return (
              <div
                key={room.id}
                className={`room-node ${isHere ? 'here' : ''}`}
                style={{ left: `${pct}%` }}
              >
                <div className="room-icon">{room.icon}</div>
                <div className="room-name">{room.label}</div>
                <div className="room-desc">{room.desc}</div>
              </div>
            );
          })}

          {/* Robot marker */}
          <div
            className={`robot-dot ${robotMoving ? 'moving' : ''}`}
            style={{ left: posLeft[robotPos] ?? '8%' }}
          >
            <span>🤖</span>
          </div>
        </div>
      </div>

      {/* ── Dispatch controls ─────────────────────────────────────────────── */}
      <div className="dispatch-section">
        <div className="section-eyebrow">DISPATCH COMMANDS</div>
        <div className="dispatch-grid">
          {ROOMS.map(room => (
            <button
              key={room.id}
              className={`dispatch-btn ${robotPos === room.id ? 'current' : ''} ${robotMoving ? 'locked' : ''}`}
              onClick={() => onDispatch(room.id)}
              disabled={robotMoving || robotPos === room.id}
            >
              <span className="dispatch-icon">{room.icon}</span>
              <div>
                <div className="dispatch-label">{room.label}</div>
                <div className="dispatch-sub">{room.desc}</div>
              </div>
              {robotPos === room.id && <span className="here-badge">HERE</span>}
            </button>
          ))}
        </div>

        {dispatchMsg && (
          <div className={`dispatch-msg ${robotMoving ? 'moving' : 'arrived'}`}>
            {robotMoving ? '⟳ ' : '✓ '}{dispatchMsg}
          </div>
        )}
      </div>

      {/* ── Quick sensor summary ──────────────────────────────────────────── */}
      <div className="section-eyebrow" style={{ marginTop: '2rem' }}>
        QUICK SENSOR OVERVIEW
      </div>
      <div className="quick-grid">
        {['room1', 'room2'].map(room => (
          <div
            key={room}
            className="quick-card"
            onClick={() => onRoomSelect(room)}
          >
            <div className="quick-title">{room === 'room1' ? 'ROOM 1' : 'ROOM 2'}</div>

            <div className="quick-row">
              <span>🌡 Temp</span>
              <strong>
                {sensors[room].temp !== '--' ? `${sensors[room].temp} °C` : '--'}
              </strong>
            </div>

            <div className="quick-row">
              <span>💧 Humidity</span>
              <strong>
                {sensors[room].humidity !== '--' ? `${sensors[room].humidity} %` : '--'}
              </strong>
            </div>

            <div className="quick-row">
              <span>🚶 Occupancy</span>
              <strong className={sensors[room].occupancy === '1' ? 'ok' : 'muted'}>
                {sensors[room].occupancy === '1' ? 'DETECTED'
                  : sensors[room].occupancy === '0' ? 'CLEAR' : '--'}
              </strong>
            </div>

            <div className="quick-row">
              <span>🚨 Emergency</span>
              <strong className={sensors[room].emergency === '1' ? 'danger' : 'muted'}>
                {sensors[room].emergency === '1' ? 'ACTIVE'
                  : sensors[room].emergency === '0' ? 'CLEAR' : '--'}
              </strong>
            </div>

            <div className="quick-more">View full data →</div>
          </div>
        ))}
      </div>
    </div>
  );
}
