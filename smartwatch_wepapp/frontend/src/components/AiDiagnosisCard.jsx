import React from 'react';
import './AiDiagnosisCard.css';

/**
 * AiDiagnosisCard Component
 *
 * Professional Clinical AI Diagnostic Card displaying:
 *  - Risk & Priority level with glowing status badge
 *  - Primary Diagnosis hero banner
 *  - Confidence meter percentage
 *  - Recommended Action & First Aid protocol
 *  - Clinical Reasoning & telemetry biomarkers
 */
export default function AiDiagnosisCard({ aiData }) {
  if (!aiData) return null;

  const riskKey = aiData.risk?.toLowerCase() || 'medium';

  // Risk level theme configuration
  const RISK_THEMES = {
    critical: {
      color: '#ef4444',
      bg: 'rgba(239, 68, 68, 0.06)',
      border: 'rgba(239, 68, 68, 0.3)',
      badgeBg: '#ef4444',
      icon: '🚨',
      tag: 'CRITICAL ATTENTION',
    },
    high: {
      color: '#f97316',
      bg: 'rgba(249, 115, 22, 0.06)',
      border: 'rgba(249, 115, 22, 0.3)',
      badgeBg: '#f97316',
      icon: '⚠️',
      tag: 'HIGH PRIORITY',
    },
    medium: {
      color: '#f59e0b',
      bg: 'rgba(245, 158, 11, 0.06)',
      border: 'rgba(245, 158, 11, 0.3)',
      badgeBg: '#d97706',
      icon: '⚡',
      tag: 'MEDIUM PRIORITY',
    },
    low: {
      color: '#10b981',
      bg: 'rgba(16, 185, 129, 0.06)',
      border: 'rgba(16, 185, 129, 0.3)',
      badgeBg: '#10b981',
      icon: '✅',
      tag: 'LOW RISK',
    },
  };

  const theme = RISK_THEMES[riskKey] || RISK_THEMES.medium;
  const confidenceVal = parseFloat(aiData.confidence) || 0;

  return (
    <div
      className="ai-card-container fade-in"
      style={{
        '--risk-color': theme.color,
        '--risk-bg': theme.bg,
        '--risk-border': theme.border,
      }}
    >
      {/* ── Top Header Bar ── */}
      <div className="ai-card-header">
        <div className="ai-header-left">
          <div className="ai-brain-badge">
            <span className="ai-brain-icon">🧠</span>
            <span className="ai-live-pulse" />
          </div>
          <div>
            <div className="ai-sys-title">MEDGUARDIAN AI DIAGNOSTICS</div>
            <div className="ai-sys-sub">Real-Time Clinical Pattern Recognition</div>
          </div>
        </div>

        <div className="ai-priority-badge" style={{ backgroundColor: theme.badgeBg }}>
          <span className="priority-icon">{theme.icon}</span>
          <span>{aiData.priority || theme.tag}</span>
        </div>
      </div>

      {/* ── Primary Diagnosis Hero Section ── */}
      <div className="ai-hero-panel">
        <div className="hero-left">
          <div className="hero-eyebrow">PRIMARY DIAGNOSIS</div>
          <h2 className="hero-diagnosis-title" style={{ color: theme.color }}>
            {aiData.diagnosis || 'Unspecified Condition'}
          </h2>
        </div>

        <div className="hero-right">
          <div className="confidence-score-box">
            <div className="confidence-num" style={{ color: theme.color }}>
              {confidenceVal.toFixed(1)}%
            </div>
            <div className="confidence-label">
              {aiData.reliability || 'AI'} Match Confidence
            </div>
          </div>
        </div>
      </div>

      {/* Confidence Meter Bar */}
      <div className="ai-meter-bar">
        <div
          className="ai-meter-fill"
          style={{
            width: `${Math.min(100, confidenceVal)}%`,
            backgroundColor: theme.color,
            boxShadow: `0 0 12px ${theme.color}`,
          }}
        />
      </div>

      {/* ── Action & Protocol Grid ── */}
      <div className="ai-details-grid">
        {/* Recommended Action */}
        <div className="ai-detail-card action-card">
          <div className="detail-header">
            <span className="detail-icon">🩺</span>
            <span className="detail-title">RECOMMENDED ACTION</span>
          </div>
          <div className="detail-content highlight-text">
            {aiData.action || 'Medical Assessment Suggested'}
          </div>
        </div>

        {/* First Aid & Protocol */}
        <div className="ai-detail-card firstaid-card">
          <div className="detail-header">
            <span className="detail-icon">🚑</span>
            <span className="detail-title">FIRST AID PROTOCOL</span>
          </div>
          <div className="detail-content">
            {aiData.first_aid || 'Monitor patient vitals continuously.'}
          </div>
        </div>
      </div>

      {/* ── Clinical Reasoning & Biomarkers ── */}
      {aiData.reasoning && aiData.reasoning.length > 0 && (
        <div className="ai-reasoning-card">
          <div className="reasoning-header">
            <span className="reasoning-icon">📋</span>
            <span className="reasoning-title">CLINICAL REASONING & BIOMARKER PATTERNS</span>
          </div>

          <div className="reasoning-list">
            {aiData.reasoning.map((item, idx) => (
              <div key={idx} className="reasoning-item">
                <span className="reasoning-bullet">▸</span>
                <span className="reasoning-text">{item}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
