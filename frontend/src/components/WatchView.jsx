import { WATCH_DEFS } from '../config/constants';
import AiDiagnosisCard from './AiDiagnosisCard';

export default function WatchView({ watch = {}, updated = {}, lastSeen }) {
  return (
    <div className="watch-view fade-in">
      <div className="room-header">
        <div>
          <div className="section-eyebrow">SMART WATCH DATA</div>
          <h2 className="room-title">Patient Smart Watch</h2>
        </div>
        {lastSeen && (
          <div className="last-seen">
            Last update<br />
            <strong>{lastSeen.toLocaleTimeString()}</strong>
          </div>
        )}
      </div>

      {watch?.ai_prediction && <AiDiagnosisCard aiData={watch.ai_prediction} />}

      <div className="sensors-grid watch-grid">
        {Object.entries(WATCH_DEFS).map(([key, def]) => {
          const val = watch[key] ?? '--';
          const isNew = updated?.[key] && Date.now() - updated[key] < 2000;
          const boolOn = val === '1' || val === 'true' || val === 'online';
          return (
            <div key={key} className={`sensor-card ${isNew ? 'flash' : ''}`}>
              <div className="sensor-glow" style={{ '--c': '#2563eb' }} />
              <div className="sensor-top">
                <span className="sensor-icon watch-icon">{def.icon}</span>
                <span className={`sensor-live-dot ${isNew ? 'on' : ''}`} />
              </div>
              <div className="sensor-name">{def.label}</div>
              <div className={`sensor-value ${def.bool ? (boolOn ? 'bool-on' : 'bool-off') : ''}`}>
                {def.bool ? (val === '--' ? '--' : boolOn ? 'YES' : 'NO') : val}
              </div>
              {def.unit && <div className="sensor-unit">{def.unit}</div>}
            </div>
          );
        })}
      </div>
    </div>
  );
}
