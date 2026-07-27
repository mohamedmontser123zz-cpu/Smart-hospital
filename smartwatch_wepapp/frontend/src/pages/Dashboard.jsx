import React, { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useWatchData } from '../hooks/useWatchData';
import VitalCard from '../components/VitalCard';
import AiDiagnosisCard from '../components/AiDiagnosisCard';
import './Dashboard.css';

export default function Dashboard() {
  const watch = useWatchData();
  const navigate = useNavigate();

  useEffect(() => {
    const user = localStorage.getItem('medex_user');
    if (!user) {
      navigate('/login');
    }
  }, [navigate]);

  if (!watch) {
    return (
      <div className="loading-screen">
        <div className="loader animate-pulse"></div>
        <p>Connecting to SmartWatch...</p>
      </div>
    );
  }

  // Determine MEDEX styling
  let medexColor = 'var(--success)';
  let medexLabel = 'Very Relaxed';
  if (watch.medex > 80) { medexColor = 'var(--danger)'; medexLabel = 'High Alert'; }
  else if (watch.medex > 60) { medexColor = 'var(--warning)'; medexLabel = 'Stressed'; }
  else if (watch.medex > 40) { medexColor = '#eab308'; medexLabel = 'Mild Arousal'; } // yellow
  else if (watch.medex > 20) { medexColor = '#84cc16'; medexLabel = 'Calm'; } // light green

  return (
    <div className="dashboard-container fade-in">
      <header className="dashboard-header glass-panel">
        <div>
          <h1>Patient Monitor</h1>
          <p>MEDex SmartWatch Telemetry</p>
        </div>
        <div className="status-badge" style={{ backgroundColor: watch.online ? 'rgba(16, 185, 129, 0.2)' : 'rgba(239, 68, 68, 0.2)', color: watch.online ? 'var(--success)' : 'var(--danger)' }}>
          <span className={`status-dot ${watch.online ? 'animate-pulse' : ''}`} style={{ backgroundColor: watch.online ? 'var(--success)' : 'var(--danger)' }}></span>
          {watch.online ? 'Online' : 'Offline'}
        </div>
      </header>

      {watch.ai_prediction && <AiDiagnosisCard aiData={watch.ai_prediction} />}

      <main className="dashboard-grid">
        <VitalCard
          title="Heart Rate"
          value={watch.finger_on ? watch.heart_rate : '--'}
          unit="BPM"
          statusColor="var(--danger)"
          icon="❤️"
          animate={watch.finger_on && watch.heart_rate > 0}
        />
        <VitalCard
          title="SpO2"
          value={watch.finger_on ? watch.spo2 : '--'}
          unit="%"
          statusColor="var(--accent-color)"
          icon="🩸"
          animate={watch.finger_on && watch.spo2 > 0}
        />
        <VitalCard
          title="Temperature"
          value={watch.temp}
          unit="°C"
          statusColor="var(--warning)"
          icon="🌡️"
        />
        <VitalCard
          title="Humidity"
          value={watch.humidity}
          unit="%"
          statusColor="var(--accent-color)"
          icon="💧"
        />
        <VitalCard
          title="GSR Raw"
          value={watch.gsr}
          unit="ADC"
          statusColor="#a855f7"
          icon="⚡"
        />
        
        {/* Special wide card for MEDEX index */}
        <div className="glass-panel medex-card" style={{ '--status-color': medexColor }}>
          <div className="medex-header">
            <h3>MEDex Stress Index</h3>
            <span className="medex-label" style={{ color: medexColor }}>{medexLabel}</span>
          </div>
          <div className="medex-bar-container">
            <div 
              className="medex-bar" 
              style={{ 
                width: `${Math.max(0, Math.min(100, watch.medex))}%`,
                backgroundColor: medexColor 
              }}
            ></div>
          </div>
          <div className="medex-value">
            {watch.medex} <span className="medex-unit">/ 100</span>
          </div>
        </div>

        <VitalCard
          title="Battery"
          value={watch.battery}
          unit="%"
          statusColor={watch.battery < 20 ? 'var(--danger)' : 'var(--success)'}
          icon="🔋"
        />
      </main>
      
      {!watch.finger_on && watch.online && (
        <div className="glass-panel alert-panel fade-in">
          ⚠️ Please place finger on the sensor for Heart Rate and SpO2 readings.
        </div>
      )}
    </div>
  );
}
