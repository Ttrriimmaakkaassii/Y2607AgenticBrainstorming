'use client';

import { useState } from 'react';
import { LLM_CATALOG, getProvider } from '@/lib/llm-catalog';
import { Effort, LLMConnection, LLMProvider } from '@/lib/types';
import { generateId } from '@/lib/id';

interface LLMProvidersModalProps {
  connections: LLMConnection[];
  onChange: (connections: LLMConnection[]) => void;
  onClose: () => void;
  onToast: (message: string) => void;
}

function maskKey(key: string): string {
  if (key.length <= 4) return '••••';
  return `••••${key.slice(-4)}`;
}

export function LLMProvidersModal({
  connections,
  onChange,
  onClose,
  onToast,
}: LLMProvidersModalProps) {
  const [provider, setProvider] = useState<LLMProvider>('openai');
  const [model, setModel] = useState(LLM_CATALOG[0].models[0].id);
  const [effort, setEffort] = useState<Effort>('medium');
  const [apiKey, setApiKey] = useState('');
  const [label, setLabel] = useState('');

  const selectedProviderInfo = getProvider(provider);
  const selectedModelInfo = selectedProviderInfo?.models.find((m) => m.id === model);

  function handleProviderChange(next: LLMProvider) {
    setProvider(next);
    const firstModel = getProvider(next)?.models[0];
    if (firstModel) setModel(firstModel.id);
  }

  function addConnection() {
    if (!apiKey.trim()) {
      onToast('Enter an API key first.');
      return;
    }
    const connection: LLMConnection = {
      id: generateId(),
      provider,
      model,
      effort,
      apiKey: apiKey.trim(),
      label: label.trim() || `${selectedProviderInfo?.name} · ${selectedModelInfo?.label}`,
    };
    onChange([...connections, connection]);
    setApiKey('');
    setLabel('');
    onToast('✅ LLM connection added');
  }

  function deleteConnection(id: string) {
    onChange(connections.filter((c) => c.id !== id));
    onToast('🗑️ LLM connection removed');
  }

  return (
    <div className="modal-overlay active" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <span className="modal-title">🔌 LLM Providers</span>
          <button className="modal-close" onClick={onClose}>
            ×
          </button>
        </div>
        <div className="modal-body">
          <div className="modal-section">
            <div className="modal-section-title">Add an LLM</div>
            <div className="form-group">
              <label>Provider</label>
              <select value={provider} onChange={(e) => handleProviderChange(e.target.value as LLMProvider)}>
                {LLM_CATALOG.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="form-group">
              <label>Model</label>
              <select value={model} onChange={(e) => setModel(e.target.value)}>
                {selectedProviderInfo?.models.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.label}
                  </option>
                ))}
              </select>
            </div>
            {selectedModelInfo?.supportsEffort && (
              <div className="form-group">
                <label>Effort</label>
                <select value={effort} onChange={(e) => setEffort(e.target.value as Effort)}>
                  <option value="low">Low</option>
                  <option value="medium">Medium</option>
                  <option value="high">High</option>
                </select>
              </div>
            )}
            <div className="form-group">
              <label>API Key</label>
              <input
                type="password"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder={`${selectedProviderInfo?.name} API key`}
              />
            </div>
            <div className="form-group">
              <label>Label (optional)</label>
              <input
                type="text"
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                placeholder={`${selectedProviderInfo?.name} · ${selectedModelInfo?.label}`}
              />
            </div>
            <button className="btn-primary" onClick={addConnection}>
              + Add LLM
            </button>
          </div>

          <div className="modal-section">
            <div className="modal-section-title">Connected LLMs</div>
            {connections.length === 0 && (
              <div className="empty-state">No LLMs added yet.</div>
            )}
            {connections.map((c) => (
              <div className="agent-list-item" key={c.id}>
                <div className="agent-info">
                  <div className="agent-name">{c.label}</div>
                  <div className="agent-instructions">
                    {getProvider(c.provider)?.name} · {c.model} · effort: {c.effort} · key {maskKey(c.apiKey)}
                  </div>
                </div>
                <button className="btn-icon delete" onClick={() => deleteConnection(c.id)}>
                  🗑️
                </button>
              </div>
            ))}
          </div>

          <div className="modal-section">
            <div className="modal-section-title">Note</div>
            <div style={{ fontSize: 12, color: '#667781' }}>
              API keys are stored only in this browser (localStorage) and sent directly from your
              browser to the provider&apos;s API when an agent uses this connection. They are never
              sent to this app&apos;s server or saved to the shared database. Don&apos;t add a
              production key on a shared or public computer.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
