import React from 'react';
import './VitalCard.css';

export default function VitalCard({ title, value, unit, statusColor, icon, animate }) {
  return (
    <div className={`glass-panel vital-card fade-in`} style={{ '--status-color': statusColor }}>
      <div className="vital-header">
        <span className="vital-title">{title}</span>
        <span className="vital-icon">{icon}</span>
      </div>
      <div className="vital-body">
        <span className={`vital-value ${animate ? 'animate-pulse' : ''}`}>{value}</span>
        {unit && <span className="vital-unit">{unit}</span>}
      </div>
    </div>
  );
}
