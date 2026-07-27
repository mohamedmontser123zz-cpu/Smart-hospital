/**
 * PowerRoomView Component
 *
 * Displays telemetry from the Battery Room firmware:
 *  - Two Voltage Sources: Primary (Main Grid, GPIO 35) & Backup (Battery Pack, GPIO 34)
 *  - Two Room Currents: Room 1 (GPIO 36) & Room 2 (GPIO 39)
 *  - Total Output Current (sum of Room 1 + Room 2)
 *  - Active Power Source indicator (Primary vs Backup)
 *
 * Handles both flat MQTT topics (battery_room/v_main) and JSON payloads.
 */
export default function PowerRoomView({ data, updated = {}, lastSeen }) {
  // Raw values from MQTT or payload root
  const root = data?.power_room || data?.data || data || {};

  const vBattRaw   = root?.v_battery   ?? root?.battery?.v;      // centivolts or volts
  const vMainRaw   = root?.v_main      ?? root?.main?.v;         // centivolts or volts
  const iRoom1Raw  = root?.i_room1     ?? root?.room1?.i;        // milliamps or amps
  const iRoom2Raw  = root?.i_room2     ?? root?.room2?.i;        // milliamps or amps
  const iTotalRaw  = root?.i_total     ?? root?.total_current;   // milliamps or amps
  const activeRaw  = root?.active_source ?? root?.battery?.active; // 0 or 1

  // Parse & convert to standard human-readable units (Volts & Amperes)
  const parseVoltage = (raw) => {
    if (raw === null || raw === undefined || raw === '--') return null;
    const num = parseFloat(raw);
    if (isNaN(num)) return null;
    return Math.abs(num) > 50 ? (num / 100.0).toFixed(2) : num.toFixed(2);
  };

  const parseCurrent = (raw) => {
    if (raw === null || raw === undefined || raw === '--') return null;
    const num = parseFloat(raw);
    if (isNaN(num)) return null;
    return Math.abs(num) > 100 ? (Math.abs(num) / 1000.0).toFixed(2) : Math.abs(num).toFixed(2);
  };

  const vBatt  = parseVoltage(vBattRaw);
  const vMain  = parseVoltage(vMainRaw);
  const iRoom1 = parseCurrent(iRoom1Raw);
  const iRoom2 = parseCurrent(iRoom2Raw);
  let iTotal = parseCurrent(iTotalRaw);

  if (iTotal === null && (iRoom1 !== null || iRoom2 !== null)) {
    iTotal = (parseFloat(iRoom1 || 0) + parseFloat(iRoom2 || 0)).toFixed(2);
  }

  // Active source logic (1 or true = Backup Battery Active, 0 or false = Primary Main Grid Active)
  const hasActiveSource = activeRaw !== null && activeRaw !== undefined && activeRaw !== '--';
  const battActive = hasActiveSource && (activeRaw === 1 || activeRaw === '1' || activeRaw === true || activeRaw === 'true');

  // Overall check for telemetry arrival
  const hasData = hasActiveSource || [vBatt, vMain, iRoom1, iRoom2, iTotal].some(v => v !== null);

  // Helper formatter: returns numeric string or '--'
  const fmt = (val) => (val !== null && val !== undefined ? val : '--');

  // Calculate powers in Watts
  const pMain  = (vMain !== null && iTotal !== null && !battActive) ? (parseFloat(vMain) * parseFloat(iTotal)).toFixed(2) : (vMain !== null ? '0.00' : '--');
  const pBatt  = (vBatt !== null && iTotal !== null && battActive)  ? (parseFloat(vBatt) * parseFloat(iTotal)).toFixed(2) : (vBatt !== null ? '0.00' : '--');
  const pRoom1 = (vMain !== null && iRoom1 !== null) ? (parseFloat(vMain || vBatt || 12) * parseFloat(iRoom1)).toFixed(2) : '--';
  const pRoom2 = (vMain !== null && iRoom2 !== null) ? (parseFloat(vMain || vBatt || 12) * parseFloat(iRoom2)).toFixed(2) : '--';

  // Flash update indicator
  const isNew = updated && Object.values(updated).some(t => t && Date.now() - t < 2000);

  // Low battery alert
  const isLowBatt = battActive && vBatt !== null && parseFloat(vBatt) < 11.0;

  return (
    <div className="room-view fade-in">

      {/* ── Room Header ── */}
      <div className="room-header">
        <div>
          <div className="section-eyebrow">POWER & BATTERY MANAGEMENT</div>
          <h2 className="room-title">
            Power Room Dashboard
          </h2>
        </div>
        {lastSeen && (
          <div className="last-seen">
            Last update<br />
            <strong>{lastSeen.toLocaleTimeString()}</strong>
          </div>
        )}
      </div>

      {/* ── Emergency / Alert Banner ── */}
      {isLowBatt && (
        <div className="emergency-banner">
          <span className="emergency-icon">🚨</span>
          <span>LOW BACKUP BATTERY VOLTAGE ({vBatt}V) — Backup battery running low!</span>
        </div>
      )}

      {/* ── Active Power Source Indicator Banner ── */}
      <div className={`power-status-banner ${battActive ? 'backup-active' : 'primary-active'}`}>
        <div className="status-banner-left">
          <span className="status-banner-icon">🔀</span>
          <div>
            <div className="status-banner-title">ACTIVE SYSTEM POWER SOURCE</div>
            <div className="status-banner-subtitle">
              Currently powered by: <strong>{!hasData ? 'OFFLINE / UNKNOWN' : (battActive ? 'BACKUP BATTERY PACK (GPIO 34)' : 'PRIMARY MAIN GRID (GPIO 35)')}</strong>
            </div>
          </div>
        </div>
        <div className={`status-pill ${battActive ? 'backup' : 'primary'}`}>
          <span className="status-dot" />
          {!hasData ? 'STANDBY' : (battActive ? 'BACKUP ACTIVE' : 'PRIMARY ACTIVE')}
        </div>
      </div>

      {/* ── SECTION 1: VOLTAGE SOURCES (SIDE-BY-SIDE: PRIMARY VS BACKUP) ── */}
      <div className="section-eyebrow" style={{ marginTop: '2rem' }}>POWER SOURCES (PRIMARY GRID VS BACKUP BATTERY)</div>

      <div className="power-split-grid">

        {/* PRIMARY SOURCE (GRID) */}
        <div className={`power-section-panel ${!battActive && hasData ? 'active-source' : ''}`}>
          <div className="panel-header">
            <div className="panel-title">
              <span className="panel-icon">🏢</span>
              <div>
                <h3>PRIMARY SOURCE</h3>
                <span className="panel-sub">MAIN GRID FEED (GPIO 35)</span>
              </div>
            </div>
            <span className={`source-badge ${!battActive && hasData ? 'online' : 'standby'}`}>
              {!battActive && hasData ? 'ACTIVE' : 'STANDBY'}
            </span>
          </div>

          <div className="panel-cards-grid">
            <div className={`sensor-card ${isNew ? 'flash' : ''}`} style={{ '--c': '#06b6d4' }}>
              <div className="sensor-glow" />
              <div className="sensor-top">
                <span className="sensor-icon">⚡</span>
                <span className={`sensor-live-dot ${isNew ? 'on' : ''}`} />
              </div>
              <div className="sensor-name">GRID VOLTAGE</div>
              <div className="sensor-value">{fmt(vMain)}</div>
              <div className="sensor-unit">V</div>
            </div>

            <div className={`sensor-card ${isNew ? 'flash' : ''}`} style={{ '--c': '#06b6d4' }}>
              <div className="sensor-glow" />
              <div className="sensor-top">
                <span className="sensor-icon">💡</span>
                <span className={`sensor-live-dot ${isNew ? 'on' : ''}`} />
              </div>
              <div className="sensor-name">GRID POWER</div>
              <div className="sensor-value">{fmt(pMain)}</div>
              <div className="sensor-unit">W</div>
            </div>
          </div>
        </div>

        {/* BACKUP SOURCE (BATTERY) */}
        <div className={`power-section-panel ${battActive && hasData ? 'active-source backup' : ''}`}>
          <div className="panel-header">
            <div className="panel-title">
              <span className="panel-icon">🔋</span>
              <div>
                <h3>BACKUP SOURCE</h3>
                <span className="panel-sub">BATTERY PACK (GPIO 34)</span>
              </div>
            </div>
            <span className={`source-badge ${battActive && hasData ? 'active-backup' : 'standby'}`}>
              {battActive && hasData ? 'ACTIVE' : 'STANDBY'}
            </span>
          </div>

          <div className="panel-cards-grid">
            <div className={`sensor-card ${isNew ? 'flash' : ''}`} style={{ '--c': '#0ea5e9' }}>
              <div className="sensor-glow" />
              <div className="sensor-top">
                <span className="sensor-icon">⚡</span>
                <span className={`sensor-live-dot ${isNew ? 'on' : ''}`} />
              </div>
              <div className="sensor-name">BATTERY VOLTAGE</div>
              <div className="sensor-value">{fmt(vBatt)}</div>
              <div className="sensor-unit">V</div>
            </div>

            <div className={`sensor-card ${isNew ? 'flash' : ''}`} style={{ '--c': '#0ea5e9' }}>
              <div className="sensor-glow" />
              <div className="sensor-top">
                <span className="sensor-icon">🔌</span>
                <span className={`sensor-live-dot ${isNew ? 'on' : ''}`} />
              </div>
              <div className="sensor-name">BATTERY CURRENT</div>
              <div className="sensor-value">{fmt(iTotal && battActive ? iTotal : '0.00')}</div>
              <div className="sensor-unit">A</div>
            </div>

            <div className={`sensor-card ${isNew ? 'flash' : ''}`} style={{ '--c': '#0ea5e9' }}>
              <div className="sensor-glow" />
              <div className="sensor-top">
                <span className="sensor-icon">💡</span>
                <span className={`sensor-live-dot ${isNew ? 'on' : ''}`} />
              </div>
              <div className="sensor-name">BATTERY POWER</div>
              <div className="sensor-value">{fmt(pBatt)}</div>
              <div className="sensor-unit">W</div>
            </div>
          </div>
        </div>

      </div>

      {/* ── SECTION 2: ROOM CONSUMPTION & BUCK CONVERTERS ── */}
      <div className="section-eyebrow" style={{ marginTop: '2.5rem' }}>ROOM POWER CONSUMPTION & BUCK CONVERTERS</div>

      <div className="power-split-grid">

        {/* ROOM 1 PANEL */}
        <div className="power-section-panel room-panel-style">
          <div className="panel-header">
            <div className="panel-title">
              <span className="panel-icon">①</span>
              <div>
                <h3>ROOM 1 POWER</h3>
                <span className="panel-sub">BUCK REGULATOR (GPIO 32 / 36)</span>
              </div>
            </div>
            <span className="source-badge room">PATIENT ROOM 1</span>
          </div>

          <div className="panel-cards-grid">
            <div className={`sensor-card ${isNew ? 'flash' : ''}`} style={{ '--c': '#10b981' }}>
              <div className="sensor-glow" />
              <div className="sensor-top">
                <span className="sensor-icon">⚡</span>
                <span className={`sensor-live-dot ${isNew ? 'on' : ''}`} />
              </div>
              <div className="sensor-name">BUCK VOLTAGE</div>
              <div className="sensor-value">{fmt(vMain || vBatt || '12.00')}</div>
              <div className="sensor-unit">V</div>
            </div>

            <div className={`sensor-card ${isNew ? 'flash' : ''}`} style={{ '--c': '#3b82f6' }}>
              <div className="sensor-glow" />
              <div className="sensor-top">
                <span className="sensor-icon">🔌</span>
                <span className={`sensor-live-dot ${isNew ? 'on' : ''}`} />
              </div>
              <div className="sensor-name">LOAD CURRENT</div>
              <div className="sensor-value">{fmt(iRoom1)}</div>
              <div className="sensor-unit">A</div>
            </div>

            <div className={`sensor-card ${isNew ? 'flash' : ''}`} style={{ '--c': '#f59e0b' }}>
              <div className="sensor-glow" />
              <div className="sensor-top">
                <span className="sensor-icon">💡</span>
                <span className={`sensor-live-dot ${isNew ? 'on' : ''}`} />
              </div>
              <div className="sensor-name">TOTAL POWER</div>
              <div className="sensor-value">{fmt(pRoom1)}</div>
              <div className="sensor-unit">W</div>
            </div>
          </div>
        </div>

        {/* ROOM 2 PANEL */}
        <div className="power-section-panel room-panel-style">
          <div className="panel-header">
            <div className="panel-title">
              <span className="panel-icon">②</span>
              <div>
                <h3>ROOM 2 POWER</h3>
                <span className="panel-sub">BUCK REGULATOR (GPIO 33 / 39)</span>
              </div>
            </div>
            <span className="source-badge room">PATIENT ROOM 2</span>
          </div>

          <div className="panel-cards-grid">
            <div className={`sensor-card ${isNew ? 'flash' : ''}`} style={{ '--c': '#10b981' }}>
              <div className="sensor-glow" />
              <div className="sensor-top">
                <span className="sensor-icon">⚡</span>
                <span className={`sensor-live-dot ${isNew ? 'on' : ''}`} />
              </div>
              <div className="sensor-name">BUCK VOLTAGE</div>
              <div className="sensor-value">{fmt(vMain || vBatt || '12.00')}</div>
              <div className="sensor-unit">V</div>
            </div>

            <div className={`sensor-card ${isNew ? 'flash' : ''}`} style={{ '--c': '#3b82f6' }}>
              <div className="sensor-glow" />
              <div className="sensor-top">
                <span className="sensor-icon">🔌</span>
                <span className={`sensor-live-dot ${isNew ? 'on' : ''}`} />
              </div>
              <div className="sensor-name">LOAD CURRENT</div>
              <div className="sensor-value">{fmt(iRoom2)}</div>
              <div className="sensor-unit">A</div>
            </div>

            <div className={`sensor-card ${isNew ? 'flash' : ''}`} style={{ '--c': '#f59e0b' }}>
              <div className="sensor-glow" />
              <div className="sensor-top">
                <span className="sensor-icon">💡</span>
                <span className={`sensor-live-dot ${isNew ? 'on' : ''}`} />
              </div>
              <div className="sensor-name">TOTAL POWER</div>
              <div className="sensor-value">{fmt(pRoom2)}</div>
              <div className="sensor-unit">W</div>
            </div>
          </div>
        </div>

      </div>

      {/* ── SECTION 3: SYSTEM TOTAL CURRENT SUMMARY ── */}
      <div className="section-eyebrow" style={{ marginTop: '2.5rem' }}>SYSTEM LOAD & TELEMETRY SUMMARY</div>
      <div className="sensors-grid">
        <div className={`sensor-card total-card ${isNew ? 'flash' : ''}`} style={{ '--c': '#8b5cf6', gridColumn: 'span 2' }}>
          <div className="sensor-glow" />
          <div className="sensor-top">
            <span className="sensor-icon">⚡</span>
            <span className={`sensor-live-dot ${isNew ? 'on' : ''}`} />
          </div>
          <div className="sensor-name">TOTAL SYSTEM OUTPUT CURRENT</div>
          <div className="sensor-desc">Combined load current across Patient Room 1 and Patient Room 2 buck outputs.</div>
          <div className="sensor-value-large" style={{ fontSize: '36px', fontWeight: '800', fontFamily: 'var(--mono)' }}>
            {fmt(iTotal)} <span style={{ fontSize: '18px', color: 'var(--muted)' }}>AMPERES (A)</span>
          </div>
        </div>
      </div>

    </div>
  );
}