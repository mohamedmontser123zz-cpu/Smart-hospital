import { useState, useEffect } from 'react';

const API_BASE = ''; // Defaulting to relative path for production on Pi

export function useWatchData() {
  const [data, setData] = useState(null);

  useEffect(() => {
    // Load initial snapshot
    fetch(`${API_BASE}/api/watch`)
      .then(r => r.json())
      .then(setData)
      .catch(err => console.error("Error fetching initial watch snapshot:", err));

    // Then stream live updates via SSE
    const es = new EventSource(`${API_BASE}/api/watch/stream`);
    
    es.onmessage = (e) => {
      try {
        const update = JSON.parse(e.data);
        setData(prev => ({ ...prev, ...update }));
      } catch(err) {
        console.error("Error parsing SSE data", err);
      }
    };

    es.onerror = (e) => {
      console.error("SSE Connection Error", e);
    }

    return () => es.close();
  }, []);

  return data;
}
