/**
 * TabNav
 *
 * Renders the three tab buttons (Robot / Room 1 / Room 2).
 *
 * Props:
 *  - activeTab   string    – currently selected tab id
 *  - lastSeen    object    – { room1: Date|null, room2: Date|null }
 *  - onSelect    function  – (tabId: string) => void
 */
export default function TabNav({ activeTab, lastSeen, onSelect }) {
  const tabs = [
    { id: 'robot', label: '🤖  ROBO' },
    { id: 'room1', label: '①  ROOM 1' },
    { id: 'room2', label: '② ROOM 2' },
    { id: 'power_room', label: '🪫  POWER ROOM' },
    { id: 'watch', label: '⌚ WATCH' },
  ];

  return (
    <nav className="tab-nav">
      {tabs.map(t => (
        <button
          key={t.id}
          className={`tab-btn ${activeTab === t.id ? 'active' : ''}`}
          onClick={() => onSelect(t.id)}
        >
          {t.label}
          {(t.id === 'room1' || t.id === 'room2') && lastSeen[t.id] && (
            <span className="tab-live">LIVE</span>
          )}
        </button>
      ))}
    </nav>
  );
}
