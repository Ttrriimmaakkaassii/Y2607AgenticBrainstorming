'use client';

import { useEffect, useState } from 'react';
import { ChangeLogEntry, loadChangeLog } from '@/lib/changelog';

export function ChangeLogPanel() {
  const [entries, setEntries] = useState<ChangeLogEntry[]>([]);

  useEffect(() => {
    setEntries(loadChangeLog());
  }, []);

  const sorted = entries.slice().sort((a, b) => b.timestamp - a.timestamp);

  return (
    <>
      <div className="modal-section">
        <div className="modal-section-title">Change Log ({sorted.length})</div>
        {sorted.length === 0 && (
          <div className="empty-state">No changes recorded yet — settings and agent edits will show up here.</div>
        )}
        {sorted.map((entry) => (
          <div className="changelog-entry" key={entry.id}>
            <div className="changelog-time">{new Date(entry.timestamp).toLocaleString()}</div>
            <div className="changelog-body">
              <span className="changelog-label">{entry.label}</span> · <span className="changelog-field">{entry.field}</span>
              <div className="changelog-diff">
                <span className="changelog-old">{entry.oldValue}</span>
                <span className="changelog-arrow"> → </span>
                <span className="changelog-new">{entry.newValue}</span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </>
  );
}
