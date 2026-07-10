'use client';

import { useState } from 'react';
import { AGENT_LIBRARY, AgentPreset } from '@/lib/agent-library';

interface AgentLibraryModalProps {
  onAdd: (preset: AgentPreset) => void;
  onClose: () => void;
}

export function AgentLibraryModal({ onAdd, onClose }: AgentLibraryModalProps) {
  const [categoryId, setCategoryId] = useState(AGENT_LIBRARY[0].id);
  const category = AGENT_LIBRARY.find((c) => c.id === categoryId) ?? AGENT_LIBRARY[0];

  return (
    <div className="modal-overlay active" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 560 }}>
        <div className="modal-header">
          <span className="modal-title">📚 Agent Library</span>
          <button className="modal-close" onClick={onClose}>
            ×
          </button>
        </div>
        <div className="modal-body">
          <div className="modal-section">
            <div className="modal-section-title">Skill Category</div>
            <div className="form-group">
              <select value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
                {AGENT_LIBRARY.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.icon} {c.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="modal-section">
            <div className="modal-section-title">Suggested Agents</div>
            {category.presets.map((preset) => (
              <div className="agent-list-item" key={preset.name}>
                <div className="avatar" style={{ background: preset.color }}>
                  {preset.role.charAt(0).toUpperCase()}
                </div>
                <div className="agent-info">
                  <div className="agent-name">
                    {preset.name} — {preset.role}
                  </div>
                  <div className="agent-instructions">{preset.instructions}</div>
                </div>
                <button className="btn-icon" onClick={() => onAdd(preset)} title="Add to conversation">
                  ➕
                </button>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
