'use client';

import { useEffect, useState } from 'react';
import { LLM_CATALOG, getProvider } from '@/lib/llm-catalog';
import { Agent, Effort, LLMConnection, LLMProvider } from '@/lib/types';
import { generateId } from '@/lib/id';
import { loadCustomAgents, renameCustomAgent } from '@/lib/custom-agents';
import { AGENT_LIBRARY, AgentPreset } from '@/lib/agent-library';
import { CustomCategory, loadCustomCategories } from '@/lib/categories';
import { devRef } from '@/lib/devref';
import { loadTtsApiKey, saveTtsApiKey } from '@/lib/tts-connection';
import { GEMINI_TTS_MODELS, describeGoogleTtsError, validateGeminiKey } from '@/lib/google-tts';
import {
  CUSTOM_TTS_DEFAULT_VOICE,
  loadCustomPodcastBaseUrl,
  loadCustomTtsApiKey,
  loadCustomTtsBaseUrl,
  loadCustomTtsVoice,
  saveCustomPodcastBaseUrl,
  saveCustomTtsApiKey,
  saveCustomTtsBaseUrl,
  saveCustomTtsVoice,
  testCustomTts,
} from '@/lib/custom-tts';
import { testConnection } from '@/lib/llm-client';
import { useClickOutside } from '@/lib/use-click-outside';
import { useOverlayClose } from '@/lib/use-overlay-close';

type TestStatus = 'idle' | 'testing' | 'ok' | 'fail';

interface LLMProvidersModalProps {
  connections: LLMConnection[];
  onChange: (connections: LLMConnection[]) => void;
  agents: Agent[];
  onUpdateAgents: (agents: Agent[]) => void;
  onClose: () => void;
  onToast: (message: string) => void;
  googleTtsModel: string;
  onUpdateTtsModel: (model: string) => void;
  /** When true, renders just the panel content (no overlay/modal chrome) for embedding in a tab. */
  embedded?: boolean;
}

function maskKey(key: string): string {
  if (key.length <= 4) return '••••';
  return `••••${key.slice(-4)}`;
}

function StatusDot({ status }: { status: TestStatus }) {
  const color =
    status === 'ok' ? '#2ecc71' : status === 'fail' ? '#e74c3c' : status === 'testing' ? '#f39c12' : '#999';
  const title =
    status === 'ok'
      ? 'Working'
      : status === 'fail'
      ? 'Failed — see the toast for details'
      : status === 'testing'
      ? 'Testing…'
      : 'Not tested yet';
  return (
    <span
      title={title}
      style={{
        display: 'inline-block',
        width: 10,
        height: 10,
        borderRadius: '50%',
        background: color,
        flexShrink: 0,
      }}
    />
  );
}

export function LLMProvidersModal({
  connections,
  onChange,
  agents,
  onUpdateAgents,
  onClose,
  onToast,
  googleTtsModel,
  onUpdateTtsModel,
  embedded,
}: LLMProvidersModalProps) {
  const overlayClose = useOverlayClose(onClose);
  const [provider, setProvider] = useState<LLMProvider>('openai');
  const [model, setModel] = useState(LLM_CATALOG[0].models[0].id);
  const [effort, setEffort] = useState<Effort>('medium');
  const [apiKey, setApiKey] = useState('');
  const [label, setLabel] = useState('');

  const [tableAgents, setTableAgents] = useState<Agent[]>(agents);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkConnectionId, setBulkConnectionId] = useState('');
  const [ttsApiKey, setTtsApiKey] = useState(() => loadTtsApiKey());
  const [connectionTestStatus, setConnectionTestStatus] = useState<Record<string, TestStatus>>({});
  const [ttsTestStatus, setTtsTestStatus] = useState<TestStatus>('idle');
  const [customTtsBaseUrl, setCustomTtsBaseUrl] = useState(() => loadCustomTtsBaseUrl());
  const [customTtsApiKey, setCustomTtsApiKey] = useState(() => loadCustomTtsApiKey());
  const [customTtsVoice, setCustomTtsVoice] = useState(() => loadCustomTtsVoice());
  const [customPodcastBaseUrl, setCustomPodcastBaseUrl] = useState(() => loadCustomPodcastBaseUrl());
  const [customTtsTestText, setCustomTtsTestText] = useState('This is a test.');
  const [customTtsTestStatus, setCustomTtsTestStatus] = useState<TestStatus>('idle');
  const [customAgentPresets, setCustomAgentPresets] = useState<AgentPreset[]>([]);
  const [customCategories, setCustomCategories] = useState<CustomCategory[]>([]);
  const [categoryFilterOpen, setCategoryFilterOpen] = useState(false);
  const categoryFilterRef = useClickOutside<HTMLDivElement>(
    () => setCategoryFilterOpen(false),
    categoryFilterOpen
  );
  const [selectedCategoryFilters, setSelectedCategoryFilters] = useState<Set<string>>(new Set());

  useEffect(() => {
    setCustomAgentPresets(loadCustomAgents());
    setCustomCategories(loadCustomCategories());
  }, []);

  const allCategoryNames = [...AGENT_LIBRARY.map((c) => c.name), ...customCategories.map((c) => c.name)];

  function categoriesForAgent(name: string): string[] {
    return customAgentPresets.find((p) => p.name === name)?.categories ?? [];
  }

  function toggleCategoryFilter(name: string) {
    setSelectedCategoryFilters((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  }

  const visibleTableAgents =
    selectedCategoryFilters.size === 0
      ? tableAgents
      : tableAgents.filter((a) => categoriesForAgent(a.name).some((c) => selectedCategoryFilters.has(c)));

  async function testLlmConnection(connection: LLMConnection) {
    setConnectionTestStatus((prev) => ({ ...prev, [connection.id]: 'testing' }));
    const ok = await testConnection(connection);
    setConnectionTestStatus((prev) => ({ ...prev, [connection.id]: ok ? 'ok' : 'fail' }));
    onToast(ok ? `✅ ${connection.label} is working` : `❌ ${connection.label} failed — check the key/model`);
  }

  async function testTtsKey() {
    const trimmed = ttsApiKey.trim();
    if (!trimmed) {
      onToast('Enter a Gemini API key first.');
      return;
    }
    setTtsTestStatus('testing');
    const { ok, errorStatus } = await validateGeminiKey(trimmed);
    setTtsTestStatus(ok ? 'ok' : 'fail');
    if (ok) {
      onToast('✅ Gemini API key is working');
    } else if (errorStatus != null) {
      onToast(`❌ ${describeGoogleTtsError(errorStatus)}`);
    } else {
      onToast('❌ Verification request failed — check your connection and try again.');
    }
  }

  async function saveTtsKey() {
    const trimmed = ttsApiKey.trim();
    saveTtsApiKey(trimmed);
    if (!trimmed) {
      setTtsTestStatus('idle');
      onToast('🗑️ TTS API key cleared — using browser voices');
      return;
    }
    setTtsTestStatus('testing');
    onToast('🔄 Verifying key…');
    const { ok, errorStatus } = await validateGeminiKey(trimmed);
    setTtsTestStatus(ok ? 'ok' : 'fail');
    if (ok) {
      onToast('✅ Gemini API key saved and verified');
    } else if (errorStatus != null) {
      onToast(`⚠️ Key saved, but ${describeGoogleTtsError(errorStatus)}`);
    } else {
      onToast('⚠️ Key saved, but the verification request failed — check your connection and try again.');
    }
  }

  function saveCustomTts() {
    saveCustomTtsBaseUrl(customTtsBaseUrl);
    saveCustomTtsApiKey(customTtsApiKey);
    saveCustomTtsVoice(customTtsVoice);
    saveCustomPodcastBaseUrl(customPodcastBaseUrl);
    onToast(
      customTtsBaseUrl.trim() && customTtsApiKey.trim()
        ? '💾 Txt2Audio settings saved'
        : '🗑️ Txt2Audio settings cleared — using browser voices'
    );
  }

  async function testCustomTtsButton() {
    if (!customTtsBaseUrl.trim() || !customTtsApiKey.trim()) {
      onToast('Enter a base URL and API key first.');
      return;
    }
    setCustomTtsTestStatus('testing');
    const { ok, audioUrl, error } = await testCustomTts(
      customTtsBaseUrl,
      customTtsApiKey,
      customTtsVoice,
      customTtsTestText
    );
    setCustomTtsTestStatus(ok ? 'ok' : 'fail');
    if (ok && audioUrl) {
      onToast('✅ Custom TTS is working — playing test audio');
      new Audio(audioUrl).play();
    } else {
      onToast(`❌ ${error ?? 'Custom TTS test failed'}`);
    }
  }

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

  function exportConnections() {
    const blob = new Blob([JSON.stringify(connections, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'llm-connections-backup.json';
    link.click();
    URL.revokeObjectURL(url);
    onToast('📥 Downloaded connections backup — keep this file private.');
  }

  function importConnections(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(reader.result as string) as LLMConnection[];
        onChange([...connections, ...parsed]);
        onToast(`✅ Imported ${parsed.length} connection(s)`);
      } catch {
        onToast('Could not read that file — expected a connections backup JSON.');
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  }

  function updateTableAgent(id: string, connectionId: string | null) {
    const connection = connections.find((c) => c.id === connectionId);
    setTableAgents((prev) =>
      prev.map((a) =>
        a.id === id
          ? { ...a, connectionId, llmProvider: connection?.provider ?? a.llmProvider }
          : a
      )
    );
  }

  function toggleSelected(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleSelectAll() {
    setSelectedIds((prev) =>
      prev.size === visibleTableAgents.length
        ? new Set()
        : new Set(visibleTableAgents.map((a) => a.id))
    );
  }

  function applyBulkConnection() {
    if (!bulkConnectionId) {
      onToast('Pick an LLM to apply first.');
      return;
    }
    if (selectedIds.size === 0) {
      onToast('Select at least one agent first.');
      return;
    }
    const connection = connections.find((c) => c.id === bulkConnectionId);
    if (!connection) return;
    setTableAgents((prev) =>
      prev.map((a) =>
        selectedIds.has(a.id)
          ? { ...a, connectionId: connection.id, llmProvider: connection.provider }
          : a
      )
    );
    onToast(`Applied ${connection.label} to ${selectedIds.size} agent(s) — remember to Save.`);
  }

  function applyBulkActive(active: boolean) {
    if (selectedIds.size === 0) {
      onToast('Select at least one agent first.');
      return;
    }
    setTableAgents((prev) => prev.map((a) => (selectedIds.has(a.id) ? { ...a, active } : a)));
    onToast(`${active ? 'Activated' : 'Deactivated'} ${selectedIds.size} agent(s) — remember to Save.`);
  }

  function saveTable() {
    // The Alias/Name column edits an agent's actual name, not a separate
    // display-only alias — keep the Agent Library entry (and its tagged
    // categories) in sync rather than orphaning it under the old name.
    tableAgents.forEach((agent) => {
      const original = agents.find((a) => a.id === agent.id);
      if (original && original.name !== agent.name) {
        renameCustomAgent(original.name, agent.name);
      }
    });
    onUpdateAgents(tableAgents);
    onToast('✅ Agent LLM assignments saved');
  }

  const content = (
    <>
          <div className="modal-section">
            <div className="modal-section-title">Add an LLM</div>
            <div className="form-group">
              <label>Provider</label>
              <select
                {...devRef('dr8')}
                value={provider}
                onChange={(e) => handleProviderChange(e.target.value as LLMProvider)}
              >
                {LLM_CATALOG.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="form-group">
              <label>Model</label>
              <select {...devRef('dr9')} value={model} onChange={(e) => setModel(e.target.value)}>
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
                <select {...devRef('dr10')} value={effort} onChange={(e) => setEffort(e.target.value as Effort)}>
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
                {...devRef('i17')}
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder={`${selectedProviderInfo?.name} API key`}
              />
            </div>
            <div className="form-group">
              <label>Label (optional)</label>
              <input
                type="text"
                {...devRef('i18')}
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                placeholder={`${selectedProviderInfo?.name} · ${selectedModelInfo?.label}`}
              />
            </div>
            <button className="btn-primary" {...devRef('b39')} onClick={addConnection}>
              + Add LLM
            </button>
          </div>

          <div className="modal-section">
            <div className="modal-section-title">Connected LLMs</div>
            {connections.length === 0 && (
              <div className="empty-state">No LLMs added yet.</div>
            )}
            {connections.map((c, ci) => (
              <div className="agent-list-item" key={c.id}>
                <StatusDot status={connectionTestStatus[c.id] ?? 'idle'} />
                <div className="agent-info">
                  <div className="agent-name">{c.label}</div>
                  <div className="agent-instructions">
                    {getProvider(c.provider)?.name} · {c.model} · effort: {c.effort} · key {maskKey(c.apiKey)}
                  </div>
                </div>
                <button
                  className="btn-secondary"
                  {...devRef('b40')}
                  onClick={() => testLlmConnection(c)}
                  disabled={connectionTestStatus[c.id] === 'testing'}
                >
                  {connectionTestStatus[c.id] === 'testing' ? 'Testing…' : 'Test'}
                </button>
                <button
                  className="btn-icon delete"
                  {...devRef('b41')}
                  onClick={() => deleteConnection(c.id)}
                >
                  🗑️
                </button>
              </div>
            ))}
          </div>

          <div className="modal-section">
            <div className="modal-section-title">🔊 TTS API (optional)</div>
            <div className="form-group">
              <label>Gemini API Key</label>
              <input
                type="password"
                {...devRef('i19')}
                value={ttsApiKey}
                onChange={(e) => setTtsApiKey(e.target.value)}
                placeholder="Leave blank to keep using the free built-in browser voices"
              />
            </div>
            <div className="form-group">
              <label>Gemini TTS Model</label>
              <select
                {...devRef('dr11')}
                value={googleTtsModel}
                onChange={(e) => onUpdateTtsModel(e.target.value)}
              >
                {GEMINI_TTS_MODELS.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.label}
                  </option>
                ))}
              </select>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <button className="btn-secondary" {...devRef('b42')} onClick={saveTtsKey}>
                💾 Save TTS Key
              </button>
              <button
                className="btn-secondary"
                {...devRef('b43')}
                onClick={testTtsKey}
                disabled={ttsTestStatus === 'testing'}
              >
                {ttsTestStatus === 'testing' ? 'Testing…' : 'Test'}
              </button>
              <StatusDot status={ttsTestStatus} />
            </div>
            <div style={{ fontSize: 12, color: '#667781', marginTop: 6 }}>
              Optional. Adding a Gemini API key (get one free from Google AI Studio) unlocks more
              natural, realistic voices via Gemini TTS (enable it in Settings → 🎧 Audio → TTS Engine
              → Gemini TTS, and pick a model — the cheapest is selected by default). This is the same
              kind of key used for a Gemini LLM connection above, not a separate Google Cloud Console
              key. Stored only in this browser, same as your LLM keys — never synced anywhere. Without
              a key, read-aloud keeps using your browser's free built-in voices.
            </div>
          </div>

          <div className="modal-section">
            <div className="modal-section-title">🎙️ Txt2Audio (optional, BYO service)</div>
            <div className="form-group compact-field">
              <label>Base URL</label>
              <input
                type="text"
                value={customTtsBaseUrl}
                onChange={(e) => setCustomTtsBaseUrl(e.target.value)}
                placeholder="https://your-service.workers.dev"
              />
            </div>
            <div className="form-group compact-field">
              <label>Podcast Base URL (if different)</label>
              <input
                type="text"
                value={customPodcastBaseUrl}
                onChange={(e) => setCustomPodcastBaseUrl(e.target.value)}
                placeholder="Same as Base URL if left blank"
              />
            </div>
            <div className="form-group compact-field">
              <label>API Key</label>
              <input
                type="password"
                value={customTtsApiKey}
                onChange={(e) => setCustomTtsApiKey(e.target.value)}
                placeholder="Bearer token"
              />
            </div>
            <div className="form-group compact-field">
              <label>Voice</label>
              <input
                type="text"
                value={customTtsVoice}
                onChange={(e) => setCustomTtsVoice(e.target.value)}
                placeholder={CUSTOM_TTS_DEFAULT_VOICE}
              />
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <button className="btn-secondary" onClick={saveCustomTts}>
                💾 Save
              </button>
            </div>
            <div className="form-group compact-field" style={{ marginTop: 10 }}>
              <label>Test phrase</label>
              <input
                type="text"
                value={customTtsTestText}
                onChange={(e) => setCustomTtsTestText(e.target.value)}
                placeholder="Type something to hear it spoken…"
              />
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <button
                className="btn-secondary"
                onClick={testCustomTtsButton}
                disabled={customTtsTestStatus === 'testing'}
              >
                {customTtsTestStatus === 'testing' ? 'Testing…' : '▶️ Test'}
              </button>
              <StatusDot status={customTtsTestStatus} />
            </div>
            <div style={{ fontSize: 12, color: '#667781', marginTop: 6, maxWidth: 420 }}>
              Optional. Point this at any HTTP text-to-speech service that accepts{' '}
              <code>POST {'{baseUrl}'}/api/v1/audiotize</code> with{' '}
              <code>Authorization: Bearer &lt;key&gt;</code> and a JSON body of{' '}
              <code>{'{ text, voice? }'}</code>, returning raw audio bytes. Stored only in this
              browser, never synced anywhere. Pick which engine to prioritize (Browser / Gemini TTS /
              Custom TTS API) in 🎧 Audio → TTS Engine — whichever you select there is used first and
              falls back to the browser voice if it fails or isn't configured. If your service blocks
              the request with a CORS error in the browser console, it needs to add
              &quot;Access-Control-Allow-Origin&quot; response headers (including on the OPTIONS
              preflight) — that has to be fixed on the service itself, not here.
            </div>
          </div>

          <div className="modal-section">
            <div className="modal-section-title">Assign Agents to LLMs</div>
            <div className="moods-menu-wrap" style={{ marginBottom: 8 }} ref={categoryFilterRef}>
              <button
                type="button"
                className="control-btn"
                {...devRef('b44')}
                onClick={() => setCategoryFilterOpen((v) => !v)}
              >
                🏷️ Categories (
                {selectedCategoryFilters.size === 0 ? 'All' : selectedCategoryFilters.size}) ▾
              </button>
              {categoryFilterOpen && (
                <div className="moods-menu">
                  <div className="moods-menu-list">
                    <div className="moods-menu-row">
                      <label>
                        <input
                          type="checkbox"
                          {...devRef('ck6')}
                          checked={selectedCategoryFilters.size === 0}
                          onChange={() => setSelectedCategoryFilters(new Set())}
                        />
                        Show all
                      </label>
                    </div>
                    {allCategoryNames.map((name) => (
                      <div key={name} className="moods-menu-row">
                        <label>
                          <input
                            type="checkbox"
                            {...devRef('ck7')}
                            checked={selectedCategoryFilters.has(name)}
                            onChange={() => toggleCategoryFilter(name)}
                          />
                          {name}
                        </label>
                      </div>
                    ))}
                    {allCategoryNames.length === 0 && (
                      <div className="moods-menu-empty">No categories yet.</div>
                    )}
                  </div>
                </div>
              )}
            </div>
            <div className="bulk-assign-bar">
              <select
                {...devRef('dr12')}
                value={bulkConnectionId}
                onChange={(e) => setBulkConnectionId(e.target.value)}
              >
                <option value="">Assign selected to...</option>
                {connections.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.label}
                  </option>
                ))}
              </select>
              <button className="control-btn" {...devRef('b45')} onClick={applyBulkConnection}>
                Apply to selected
              </button>
              <button className="control-btn" {...devRef('b46')} onClick={() => applyBulkActive(true)}>
                Activate selected
              </button>
              <button className="control-btn" {...devRef('b47')} onClick={() => applyBulkActive(false)}>
                Deactivate selected
              </button>
            </div>
            <div className="table-scroll">
              <table className="agent-table">
                <thead>
                  <tr>
                    <th>
                      <input
                        type="checkbox"
                        {...devRef('ck8')}
                        checked={selectedIds.size === visibleTableAgents.length && visibleTableAgents.length > 0}
                        onChange={toggleSelectAll}
                      />
                    </th>
                    <th>Ref</th>
                    <th>Alias / Name</th>
                    <th>Active</th>
                    <th>Connected</th>
                    <th>LLM</th>
                    <th>Model</th>
                    <th>Effort</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleTableAgents.map((agent, ai) => {
                    const connection = connections.find((c) => c.id === agent.connectionId);
                    const isConnected = !!agent.connectionId && !!connection;
                    return (
                      <tr key={agent.id}>
                        <td>
                          <input
                            type="checkbox"
                            {...devRef('ck9')}
                            checked={selectedIds.has(agent.id)}
                            onChange={() => toggleSelected(agent.id)}
                          />
                        </td>
                        <td>{agent.refNumber}</td>
                        <td>
                          <input
                            type="text"
                            {...devRef('i20')}
                            value={agent.name}
                            onChange={(e) =>
                              setTableAgents((prev) =>
                                prev.map((a) =>
                                  a.id === agent.id ? { ...a, name: e.target.value } : a
                                )
                              )
                            }
                          />
                        </td>
                        <td>
                          <input
                            type="checkbox"
                            {...devRef('ck10')}
                            checked={agent.active}
                            title={agent.active ? 'Active' : 'Not active'}
                            onChange={(e) =>
                              setTableAgents((prev) =>
                                prev.map((a) =>
                                  a.id === agent.id ? { ...a, active: e.target.checked } : a
                                )
                              )
                            }
                          />
                        </td>
                        <td>
                          <span
                            title={isConnected ? 'Connected to an LLM' : 'No LLM connected'}
                            style={{
                              display: 'inline-block',
                              width: 10,
                              height: 10,
                              borderRadius: '50%',
                              background: isConnected ? '#2ecc71' : '#e74c3c',
                            }}
                          />
                        </td>
                        <td colSpan={3}>
                          <select
                            {...devRef('dr13')}
                            value={agent.connectionId ?? ''}
                            onChange={(e) => updateTableAgent(agent.id, e.target.value || null)}
                          >
                            <option value="">No LLM connected</option>
                            {connections.map((c) => (
                              <option key={c.id} value={c.id}>
                                {c.label} ({getProvider(c.provider)?.name} · {c.model} · {c.effort})
                              </option>
                            ))}
                          </select>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <button className="btn-primary" {...devRef('b48')} onClick={saveTable} style={{ marginTop: 8 }}>
              💾 Save Changes
            </button>
          </div>

          <div className="modal-section">
            <div className="modal-section-title">Backup / Transfer Connections</div>
            <button className="btn-secondary" {...devRef('b49')} onClick={exportConnections}>
              📥 Download Backup (.json)
            </button>
            <label className="btn-secondary" style={{ display: 'block', textAlign: 'center', cursor: 'pointer' }}>
              📤 Import Backup
              <input
                type="file"
                accept="application/json"
                {...devRef('i21')}
                onChange={importConnections}
                style={{ display: 'none' }}
              />
            </label>
          </div>

          <div className="modal-section">
            <div className="modal-section-title">Note</div>
            <div style={{ fontSize: 12, color: '#667781' }}>
              API keys are stored only in this browser (localStorage) and sent directly from your
              browser to the provider&apos;s API when an agent uses this connection. They are never
              sent to this app&apos;s server or saved to the shared database. Don&apos;t add a
              production key on a shared or public computer. Agents with no LLM connected cannot
              respond and will appear greyed out in the conversation.
            </div>
          </div>
    </>
  );

  if (embedded) return content;

  return (
    <div className="modal-overlay active" {...overlayClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 720 }}>
        <div className="modal-header">
          <span className="modal-title">🔌 LLM Providers</span>
          <button className="modal-close" onClick={onClose}>
            ×
          </button>
        </div>
        <div className="modal-body">{content}</div>
      </div>
    </div>
  );
}
