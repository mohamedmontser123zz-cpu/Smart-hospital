// Status dot color map used by the MQTT pill badge
const STATUS_COLOR = {
  connected:    '#10b981',
  error:        '#ef4444',
  disconnected: '#f59e0b',
  connecting:   '#64748b',
};

/**
 * Header
 *
 * Props:
 *  - mqttStatus  string  – 'connecting' | 'connected' | 'disconnected' | 'error'
 */
export default function Header({ mqttStatus }) {
  return (
    <header className="header">
      <div className="header-left">
        <div className="logo-mark">✚</div>
        <div>
          <div className="logo-title">MEDIBOT<span>OS</span></div>
          <div className="logo-sub">Smart Hospital Control v2</div>
        </div>
      </div>

      <div className="header-right">
        <div className="mqtt-pill" style={{ '--dot': STATUS_COLOR[mqttStatus] }}>
          <span className="mqtt-dot" />
          <span>{mqttStatus.toUpperCase()}</span>
        </div>
      </div>
    </header>
  );
}
