'use client';

import { useEffect, useState } from 'react';
import { AGENT_LIBRARY, AgentPreset, SkillCategory } from '@/lib/agent-library';
import { loadCustomAgents, removeCustomAgent, upsertCustomAgent } from '@/lib/custom-agents';
import {
  CustomCategory,
  addCustomCategory,
  deleteCustomCategory,
  loadCustomCategories,
  recolorCustomCategory,
  renameCustomCategory,
} from '@/lib/categories';
import { useOverlayClose } from '@/lib/use-overlay-close';

interface AgentLibraryModalProps {
  onAdd: (preset: AgentPreset) => void;
  onClose: () => void;
}

const CUSTOM_AGENTS_VIEW = 'custom';

export function AgentLibraryModal({ onAdd, onClose }: AgentLibraryModalProps) {
  const overlayClose = useOverlayClose(onClose);
  const [customAgents, setCustomAgents] = useState<AgentPreset[]>([]);
  const [customCategories, setCustomCategories] = useState<CustomCategory[]>([]);
  const [newCategoryName, setNewCategoryName] = useState('');
  const [newCategoryIcon, setNewCategoryIcon] = useState('📁');
  const [newCategoryColor, setNewCategoryColor] = useState('#8e44ad');
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');

  useEffect(() => {
    setCustomAgents(loadCustomAgents());
    setCustomCategories(loadCustomCategories());
  }, []);

  // A custom agent tagged with any category's name also shows up browsing
  // that category, alongside any built-in presets it has.
  const categories: (SkillCategory & { isCustom?: boolean; color?: string })[] = [
    { id: CUSTOM_AGENTS_VIEW, name: 'My Saved Agents', icon: '⭐', presets: customAgents },
    ...AGENT_LIBRARY.map((c) => ({
      ...c,
      presets: [...c.presets, ...customAgents.filter((a) => a.categories?.includes(c.name))],
    })),
    ...customCategories.map((c) => ({
      id: c.id,
      name: c.name,
      icon: c.icon,
      color: c.color,
      presets: customAgents.filter((a) => a.categories?.includes(c.name)),
      isCustom: true,
    })),
  ];

  const categoryColors = new Map(customCategories.map((c) => [c.name, c.color]));
  const allCategoryNames = [...AGENT_LIBRARY.map((c) => c.name), ...customCategories.map((c) => c.name)];

  const [categoryId, setCategoryId] = useState(CUSTOM_AGENTS_VIEW);
  const category = categories.find((c) => c.id === categoryId) ?? categories[0];

  function deletePreset(name: string) {
    removeCustomAgent(name);
    setCustomAgents((prev) => prev.filter((p) => p.name !== name));
  }

  function togglePresetCategory(preset: AgentPreset, categoryName: string) {
    const current = preset.categories ?? [];
    const next = current.includes(categoryName)
      ? current.filter((c) => c !== categoryName)
      : [...current, categoryName];
    const updated = { ...preset, categories: next };
    upsertCustomAgent(updated);
    setCustomAgents((prev) => prev.map((p) => (p.name === preset.name ? updated : p)));
  }

  function handleAddCategory() {
    if (!newCategoryName.trim()) return;
    const next = addCustomCategory(newCategoryName, newCategoryIcon, newCategoryColor);
    setCustomCategories(next);
    setNewCategoryName('');
    setNewCategoryIcon('📁');
  }

  function handleRenameCategory(id: string) {
    if (!renameValue.trim()) {
      setRenamingId(null);
      return;
    }
    setCustomCategories(renameCustomCategory(id, renameValue));
    setCustomAgents(loadCustomAgents());
    setRenamingId(null);
  }

  function handleRecolorCategory(id: string, color: string) {
    setCustomCategories(recolorCustomCategory(id, color));
  }

  function handleDeleteCategory(id: string) {
    setCustomCategories(deleteCustomCategory(id));
    setCustomAgents(loadCustomAgents());
    if (categoryId === id) setCategoryId(CUSTOM_AGENTS_VIEW);
  }

  return (
    <div className="modal-overlay active" {...overlayClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 640 }}>
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
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.icon} {c.name}
                    {c.id !== CUSTOM_AGENTS_VIEW &&
                      customAgents.some((a) => a.categories?.includes(c.name)) &&
                      ' ⭐'}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="modal-section">
            <div className="modal-section-title">Manage Custom Categories</div>
            {customCategories.length === 0 && (
              <div className="empty-state">No custom categories yet — add one below.</div>
            )}
            {customCategories.map((c) => (
              <div className="agent-list-item" key={c.id}>
                <span className="category-dot" style={{ background: c.color }} />
                {renamingId === c.id ? (
                  <input
                    autoFocus
                    value={renameValue}
                    onChange={(e) => setRenameValue(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleRenameCategory(c.id)}
                    onBlur={() => handleRenameCategory(c.id)}
                    style={{ flex: 1 }}
                  />
                ) : (
                  <div className="agent-info">
                    <div className="agent-name">
                      {c.icon} {c.name}
                    </div>
                  </div>
                )}
                <input
                  type="color"
                  value={c.color}
                  onChange={(e) => handleRecolorCategory(c.id, e.target.value)}
                  title="Category color"
                  style={{ width: 28, height: 24, padding: 0, border: 'none' }}
                />
                <button
                  className="btn-icon"
                  title="Rename"
                  onClick={() => {
                    setRenamingId(c.id);
                    setRenameValue(c.name);
                  }}
                >
                  ✏️
                </button>
                <button
                  className="btn-icon delete"
                  title="Delete category (agents in it become Uncategorized, not deleted)"
                  onClick={() => handleDeleteCategory(c.id)}
                >
                  🗑️
                </button>
              </div>
            ))}
            <div className="bulk-assign-bar" style={{ marginTop: 8 }}>
              <input
                type="text"
                value={newCategoryIcon}
                onChange={(e) => setNewCategoryIcon(e.target.value)}
                style={{ width: 44, textAlign: 'center' }}
                title="Icon (emoji)"
              />
              <input
                type="color"
                value={newCategoryColor}
                onChange={(e) => setNewCategoryColor(e.target.value)}
                title="Category color"
                style={{ width: 32, height: 32, padding: 0, border: 'none' }}
              />
              <input
                type="text"
                placeholder="New category name"
                value={newCategoryName}
                onChange={(e) => setNewCategoryName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleAddCategory()}
              />
              <button className="control-btn" onClick={handleAddCategory}>
                + Add Category
              </button>
            </div>
          </div>

          <div className="modal-section">
            <div className="modal-section-title">
              {categoryId === CUSTOM_AGENTS_VIEW ? 'Saved Agents' : 'Agents in this Category'}
            </div>
            {category.presets.length === 0 && (
              <div className="empty-state">
                {categoryId === CUSTOM_AGENTS_VIEW
                  ? 'No saved agents yet — any agent you add or edit in a conversation is automatically saved here, and stays even after you delete it from that conversation, until you erase it below.'
                  : 'No agents in this category yet — check the boxes below to add one.'}
              </div>
            )}
            {category.presets.map((preset) => {
              const isCustom = customAgents.some((a) => a.name === preset.name);
              return (
                <div className="agent-list-item" key={preset.name} style={{ alignItems: 'flex-start' }}>
                  <div className="avatar" style={{ background: preset.color }}>
                    {preset.role.charAt(0).toUpperCase()}
                  </div>
                  <div className="agent-info">
                    <div className="agent-name">
                      {preset.name} — {preset.role}
                    </div>
                    <div className="agent-instructions">{preset.instructions}</div>
                    {preset.categories && preset.categories.length > 0 && (
                      <div className="category-badges">
                        {preset.categories.map((cat) => (
                          <span
                            key={cat}
                            className="category-badge"
                            style={{ background: categoryColors.get(cat) ?? '#999' }}
                          >
                            {cat}
                          </span>
                        ))}
                      </div>
                    )}
                    {isCustom && (
                      <div className="category-checklist">
                        {allCategoryNames.map((name) => (
                          <label key={name} className="category-checkbox">
                            <input
                              type="checkbox"
                              checked={preset.categories?.includes(name) ?? false}
                              onChange={() => togglePresetCategory(preset, name)}
                            />
                            {name}
                          </label>
                        ))}
                      </div>
                    )}
                  </div>
                  <button className="btn-icon" onClick={() => onAdd(preset)} title="Add to conversation">
                    ➕
                  </button>
                  {categoryId === CUSTOM_AGENTS_VIEW && isCustom && (
                    <button
                      className="btn-icon delete"
                      onClick={() => deletePreset(preset.name)}
                      title="Erase from library permanently"
                    >
                      🗑️
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
