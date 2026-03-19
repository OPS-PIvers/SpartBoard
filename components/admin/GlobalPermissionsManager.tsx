import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { collection, doc, setDoc, getDocs } from 'firebase/firestore';
import { db } from '../../config/firebase';
import {
  AccessLevel,
  GlobalFeature,
  GlobalFeaturePermission,
} from '../../types';
import {
  Shield,
  Users,
  Globe,
  Save,
  Plus,
  Trash2,
  Zap,
  Cast,
  Share2,
  Download,
  Wand2,
  ClipboardCheck,
  BarChart,
  Smartphone,
  LayoutGrid,
  List,
  Filter,
} from 'lucide-react';
import { Toggle } from '../common/Toggle';
import { Toast } from '../common/Toast';

const GLOBAL_FEATURES: {
  id: GlobalFeature;
  label: string;
  icon: React.ElementType;
  description: string;
}[] = [
  {
    id: 'gemini-functions',
    label: 'Gemini AI Functions',
    icon: Zap,
    description: 'AI-powered mini-app generation, poll generation, and more.',
  },
  {
    id: 'live-session',
    label: 'Live Sessions',
    icon: Cast,
    description: 'Ability to host live sessions and sync with students.',
  },
  {
    id: 'remote-control',
    label: 'Remote Control',
    icon: Smartphone,
    description:
      'Control your board from your phone while you move around the classroom.',
  },
  {
    id: 'dashboard-sharing',
    label: 'Board Sharing',
    icon: Share2,
    description: 'Generate shareable links for dashboards.',
  },
  {
    id: 'dashboard-import',
    label: 'Board Importing',
    icon: Download,
    description: 'Import dashboards from JSON strings.',
  },
  {
    id: 'magic-layout',
    label: 'Magic Layout',
    icon: Wand2,
    description: 'AI-powered automatic dashboard layout generation.',
  },
  {
    id: 'smart-paste',
    label: 'Smart Paste',
    icon: ClipboardCheck,
    description: 'Intelligent clipboard handling to auto-create widgets.',
  },
  {
    id: 'smart-poll',
    label: 'Smart Polls',
    icon: BarChart,
    description: 'AI-assisted poll question and option generation.',
  },
];

export const GlobalPermissionsManager: React.FC = () => {
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('list');
  const [permissions, setPermissions] = useState<
    Map<string, GlobalFeaturePermission>
  >(new Map());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<Set<string>>(new Set());
  const [message, setMessage] = useState<{
    type: 'success' | 'error';
    text: string;
  } | null>(null);
  const [unsavedChanges, setUnsavedChanges] = useState<Set<string>>(new Set());

  // Filter state
  const [filterEnabled, setFilterEnabled] = useState<'all' | 'on' | 'off'>(
    'all'
  );
  const [filterAvailability, setFilterAvailability] = useState<
    'all' | AccessLevel
  >('all');

  const showMessage = useCallback((type: 'success' | 'error', text: string) => {
    setMessage({ type, text });
    const timeoutId = setTimeout(() => setMessage(null), 3000);
    return () => clearTimeout(timeoutId);
  }, []);

  const loadPermissions = useCallback(async () => {
    try {
      setLoading(true);
      const snapshot = await getDocs(collection(db, 'global_permissions'));
      const permMap = new Map<string, GlobalFeaturePermission>();

      snapshot.forEach((doc) => {
        const data = doc.data() as GlobalFeaturePermission;
        permMap.set(data.featureId, data);
      });

      setPermissions(permMap);
    } catch (error) {
      console.error('Error loading global permissions:', error);
      showMessage('error', 'Failed to load permissions');
    } finally {
      setLoading(false);
    }
  }, [showMessage]);

  useEffect(() => {
    void loadPermissions();
  }, [loadPermissions]);

  const getPermission = (featureId: GlobalFeature): GlobalFeaturePermission => {
    return (
      permissions.get(featureId) ?? {
        featureId,
        accessLevel: 'public',
        betaUsers: [],
        enabled: true,
        config: featureId === 'gemini-functions' ? { dailyLimit: 20 } : {},
      }
    );
  };

  const updatePermission = (
    featureId: GlobalFeature,
    updates: Partial<GlobalFeaturePermission>
  ) => {
    const current = getPermission(featureId);
    const updated = { ...current, ...updates };
    setPermissions(new Map(permissions).set(featureId, updated));
    setUnsavedChanges(new Set(unsavedChanges).add(featureId));
  };

  const savePermission = async (featureId: GlobalFeature) => {
    try {
      setSaving(new Set(saving).add(featureId));
      const permission = getPermission(featureId);

      await setDoc(doc(db, 'global_permissions', featureId), permission);

      setUnsavedChanges((prev) => {
        const next = new Set(prev);
        next.delete(featureId);
        return next;
      });

      showMessage('success', `Saved ${featureId} settings`);
    } catch (error) {
      console.error('Error saving permission:', error);
      showMessage('error', `Failed to save ${featureId} settings`);
    } finally {
      setSaving((prev) => {
        const next = new Set(prev);
        next.delete(featureId);
        return next;
      });
    }
  };

  const addBetaUser = (featureId: GlobalFeature, email: string) => {
    const trimmedEmail = email.trim().toLowerCase();
    if (!trimmedEmail) return;

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(trimmedEmail)) {
      showMessage('error', 'Please enter a valid email address.');
      return;
    }

    const permission = getPermission(featureId);
    if (!permission.betaUsers.includes(trimmedEmail)) {
      updatePermission(featureId, {
        betaUsers: [...permission.betaUsers, trimmedEmail],
      });
    }
  };

  const removeBetaUser = (featureId: GlobalFeature, email: string) => {
    const permission = getPermission(featureId);
    updatePermission(featureId, {
      betaUsers: permission.betaUsers.filter((e) => e !== email),
    });
  };

  const getAccessLevelIcon = (level: AccessLevel) => {
    switch (level) {
      case 'admin':
        return <Shield className="w-4 h-4" />;
      case 'beta':
        return <Users className="w-4 h-4" />;
      case 'public':
        return <Globe className="w-4 h-4" />;
    }
  };

  const getAccessLevelColor = (level: AccessLevel) => {
    switch (level) {
      case 'admin':
        return 'bg-purple-100 text-purple-700 border-purple-300';
      case 'beta':
        return 'bg-blue-100 text-blue-700 border-blue-300';
      case 'public':
        return 'bg-green-100 text-green-700 border-green-300';
    }
  };

  const filteredFeatures = useMemo(() => {
    const sorted = [...GLOBAL_FEATURES].sort((a, b) =>
      a.label.localeCompare(b.label)
    );
    return sorted.filter((feature) => {
      const perm = permissions.get(feature.id) ?? {
        featureId: feature.id,
        accessLevel: 'public' as AccessLevel,
        betaUsers: [] as string[],
        enabled: true,
        config: feature.id === 'gemini-functions' ? { dailyLimit: 20 } : {},
      };
      if (filterEnabled === 'on' && !perm.enabled) return false;
      if (filterEnabled === 'off' && perm.enabled) return false;
      if (
        filterAvailability !== 'all' &&
        perm.accessLevel !== filterAvailability
      )
        return false;
      return true;
    });
  }, [permissions, filterEnabled, filterAvailability]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-slate-600">Loading global settings...</div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {message && (
        <Toast
          message={message.text}
          type={message.type}
          onClose={() => setMessage(null)}
        />
      )}

      {/* Header with View Toggle */}
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-bold text-slate-700">Global Settings</h2>
        <div className="flex bg-slate-100 p-1 rounded-lg border border-slate-200">
          <button
            onClick={() => setViewMode('grid')}
            className={`p-2 rounded-md transition-all ${
              viewMode === 'grid'
                ? 'bg-white text-brand-blue-primary shadow-sm'
                : 'text-slate-400 hover:text-slate-600'
            }`}
            title="Grid View"
          >
            <LayoutGrid size={20} />
          </button>
          <button
            onClick={() => setViewMode('list')}
            className={`p-2 rounded-md transition-all ${
              viewMode === 'list'
                ? 'bg-white text-brand-blue-primary shadow-sm'
                : 'text-slate-400 hover:text-slate-600'
            }`}
            title="List View"
          >
            <List size={20} />
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3 p-3 bg-slate-50 border border-slate-200 rounded-xl mb-2">
        <div className="flex items-center gap-1.5 text-slate-500">
          <Filter className="w-4 h-4" />
          <span className="text-xs font-bold uppercase tracking-wide">
            Filter
          </span>
        </div>

        {/* Enabled filter */}
        <div className="flex items-center gap-1">
          <span className="text-xs text-slate-500 font-medium">Enabled:</span>
          {(['all', 'on', 'off'] as const).map((val) => (
            <button
              key={val}
              onClick={() => setFilterEnabled(val)}
              className={`px-2.5 py-1 rounded-md text-xs font-semibold border transition-all ${
                filterEnabled === val
                  ? 'bg-brand-blue-primary text-white border-brand-blue-primary'
                  : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300'
              }`}
            >
              {val === 'all' ? 'All' : val === 'on' ? 'On' : 'Off'}
            </button>
          ))}
        </div>

        <div className="w-px h-5 bg-slate-200" />

        {/* Availability filter */}
        <div className="flex items-center gap-1">
          <span className="text-xs text-slate-500 font-medium">
            Availability:
          </span>
          {(['all', 'admin', 'beta', 'public'] as const).map((val) => (
            <button
              key={val}
              onClick={() => setFilterAvailability(val)}
              className={`px-2.5 py-1 rounded-md text-xs font-semibold border transition-all ${
                filterAvailability === val
                  ? 'bg-brand-blue-primary text-white border-brand-blue-primary'
                  : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300'
              }`}
            >
              {val === 'all'
                ? 'All'
                : val.charAt(0).toUpperCase() + val.slice(1)}
            </button>
          ))}
        </div>
      </div>

      <>
        {filteredFeatures.length === 0 && (
          <div className="py-12 text-center text-slate-400">
            <Filter className="w-8 h-8 mx-auto mb-2 opacity-30" />
            <p className="font-medium">
              No features match the current filters.
            </p>
          </div>
        )}
        <div
          className={
            viewMode === 'grid'
              ? 'grid grid-cols-1 md:grid-cols-2 gap-6'
              : 'space-y-3'
          }
        >
          {filteredFeatures.map((feature) => {
            const permission = getPermission(feature.id);
            const isSaving = saving.has(feature.id);

            if (viewMode === 'list') {
              return (
                <div
                  key={feature.id}
                  className="bg-white border-2 border-slate-200 rounded-xl hover:border-brand-blue-light transition-colors overflow-hidden"
                >
                  <div className="flex items-center gap-4 p-3">
                    {/* Identity Section */}
                    <div className="flex items-center gap-3 w-72 shrink-0">
                      <div className="bg-brand-blue-lighter p-2 rounded-lg text-brand-blue-primary shrink-0">
                        <feature.icon className="w-5 h-5" />
                      </div>
                      <div className="flex-1 min-w-0 text-left">
                        <h4 className="font-bold text-slate-800 text-sm truncate">
                          {feature.label}
                        </h4>
                        <p className="text-xxs text-slate-500 truncate">
                          {feature.description}
                        </p>
                      </div>
                    </div>

                    <div className="w-px h-8 bg-slate-100 mx-2" />

                    {/* Enabled Toggle */}
                    <div className="flex flex-col items-center gap-1">
                      <span className="text-xxs font-bold text-slate-400 uppercase">
                        Enabled
                      </span>
                      <Toggle
                        checked={permission.enabled}
                        onChange={(checked) =>
                          updatePermission(feature.id, {
                            enabled: checked,
                          })
                        }
                        size="sm"
                      />
                    </div>

                    {/* Access Level Controls */}
                    <div className="flex items-center gap-1 ml-4">
                      {(['admin', 'beta', 'public'] as AccessLevel[]).map(
                        (level) => (
                          <button
                            key={level}
                            onClick={() =>
                              updatePermission(feature.id, {
                                accessLevel: level,
                              })
                            }
                            className={`px-2 py-1.5 rounded-md border text-xs font-medium flex items-center gap-1 transition-all ${
                              permission.accessLevel === level
                                ? getAccessLevelColor(level)
                                : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300'
                            }`}
                          >
                            {getAccessLevelIcon(level)}
                            <span className="capitalize">{level}</span>
                          </button>
                        )
                      )}
                    </div>

                    {/* Feature Specific Config (Gemini Limit) */}
                    {feature.id === 'gemini-functions' && (
                      <div className="flex items-center gap-2 ml-4 px-4 py-1.5 bg-purple-50 rounded-lg border border-purple-100">
                        <span className="text-xxs font-bold text-purple-700 uppercase tracking-tight">
                          Daily Limit
                        </span>
                        <input
                          type="number"
                          min="1"
                          max="1000"
                          value={
                            (permission.config?.dailyLimit as number) ?? 20
                          }
                          onChange={(e) => {
                            const val = parseInt(e.target.value);
                            updatePermission(feature.id, {
                              config: {
                                ...permission.config,
                                dailyLimit: isNaN(val) ? 20 : val,
                              },
                            });
                          }}
                          className="w-16 px-2 py-0.5 border border-purple-200 rounded text-xs font-mono focus:outline-none focus:ring-1 focus:ring-purple-500"
                        />
                      </div>
                    )}

                    <div className="flex-1" />

                    {/* Actions */}
                    <div className="flex items-center gap-2 ml-4 pl-4 border-l border-slate-100">
                      <button
                        onClick={() => savePermission(feature.id)}
                        disabled={isSaving || !unsavedChanges.has(feature.id)}
                        className={`p-2 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
                          unsavedChanges.has(feature.id)
                            ? 'bg-orange-600 hover:bg-orange-700 text-white'
                            : 'text-slate-300 hover:bg-brand-blue-primary hover:text-white'
                        }`}
                        title={
                          unsavedChanges.has(feature.id)
                            ? 'Save Changes'
                            : 'No changes to save'
                        }
                      >
                        <Save className="w-4 h-4" />
                      </button>
                    </div>
                  </div>

                  {/* Beta Users Panel */}
                  {permission.accessLevel === 'beta' && (
                    <div className="border-t border-slate-100 bg-slate-50 p-4 text-left">
                      <label className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-3 block">
                        Beta Testers
                      </label>
                      <div className="flex flex-wrap gap-2 mb-3">
                        {permission.betaUsers.map((email) => (
                          <div
                            key={email}
                            className="flex items-center gap-2 px-3 py-1 bg-white border border-blue-100 rounded-full group shadow-sm"
                          >
                            <span className="text-xs font-medium text-slate-700">
                              {email}
                            </span>
                            <button
                              onClick={() => removeBetaUser(feature.id, email)}
                              className="text-red-500 hover:text-red-700 p-0.5 rounded-full transition-colors"
                            >
                              <Trash2 className="w-3 h-3" />
                            </button>
                          </div>
                        ))}
                      </div>

                      <div className="flex gap-2 max-w-md">
                        <input
                          type="email"
                          placeholder="user@example.com"
                          className="flex-1 px-3 py-1.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-blue-primary bg-white shadow-sm"
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              addBetaUser(
                                feature.id,
                                (e.target as HTMLInputElement).value
                              );
                              (e.target as HTMLInputElement).value = '';
                            }
                          }}
                        />
                        <button
                          onClick={(e) => {
                            const input = e.currentTarget
                              .previousElementSibling as HTMLInputElement;
                            addBetaUser(feature.id, input.value);
                            input.value = '';
                          }}
                          className="p-1.5 bg-brand-blue-primary text-white rounded-lg hover:bg-brand-blue-dark transition-colors shadow-sm"
                        >
                          <Plus className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            }

            return (
              <div
                key={feature.id}
                className="bg-white border-2 border-slate-200 rounded-2xl p-6 hover:border-brand-blue-light transition-all text-left"
              >
                <div className="flex items-center gap-4 mb-6">
                  <div className="bg-brand-blue-lighter p-3 rounded-xl text-brand-blue-primary">
                    <feature.icon className="w-6 h-6" />
                  </div>
                  <div>
                    <h4 className="font-bold text-slate-800 text-lg">
                      {feature.label}
                    </h4>
                    <p className="text-xs text-slate-500 leading-relaxed">
                      {feature.description}
                    </p>
                  </div>
                </div>

                {/* Enabled Toggle */}
                <div className="flex items-center justify-between mb-6 p-4 bg-slate-50 rounded-xl border border-slate-100">
                  <span className="text-sm font-bold text-slate-700 uppercase tracking-tight">
                    Feature Enabled
                  </span>
                  <Toggle
                    checked={permission.enabled}
                    onChange={(checked) =>
                      updatePermission(feature.id, {
                        enabled: checked,
                      })
                    }
                    size="md"
                  />
                </div>

                {/* Access Level */}
                <div className="mb-6">
                  <label className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-3 block">
                    Who can access this?
                  </label>
                  <div className="grid grid-cols-3 gap-3">
                    {(['admin', 'beta', 'public'] as AccessLevel[]).map(
                      (level) => (
                        <button
                          key={level}
                          onClick={() =>
                            updatePermission(feature.id, {
                              accessLevel: level,
                            })
                          }
                          className={`px-3 py-3 rounded-xl border-2 text-xs font-bold flex flex-col items-center justify-center gap-2 transition-all ${
                            permission.accessLevel === level
                              ? getAccessLevelColor(level)
                              : 'bg-white text-slate-500 border-slate-200 hover:border-slate-300'
                          }`}
                        >
                          {getAccessLevelIcon(level)}
                          <span className="capitalize">{level}</span>
                        </button>
                      )
                    )}
                  </div>
                </div>

                {/* Beta Users */}
                {permission.accessLevel === 'beta' && (
                  <div className="mb-6 animate-in slide-in-from-top-2">
                    <label className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-3 block">
                      Beta Testers
                    </label>
                    <div className="space-y-2 mb-3">
                      {permission.betaUsers.map((email) => (
                        <div
                          key={email}
                          className="flex items-center justify-between p-2.5 bg-blue-50 border border-blue-100 rounded-lg group"
                        >
                          <span className="text-xs font-medium text-slate-700">
                            {email}
                          </span>
                          <button
                            onClick={() => removeBetaUser(feature.id, email)}
                            className="text-red-500 hover:bg-red-100 p-1.5 rounded-lg transition-colors opacity-0 group-hover:opacity-100"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      ))}
                    </div>

                    <div className="flex gap-2">
                      <input
                        type="email"
                        placeholder="user@example.com"
                        className="flex-1 px-4 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-brand-blue-primary"
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            addBetaUser(
                              feature.id,
                              (e.target as HTMLInputElement).value
                            );
                            (e.target as HTMLInputElement).value = '';
                          }
                        }}
                      />
                      <button
                        onClick={(e) => {
                          const input = e.currentTarget
                            .previousElementSibling as HTMLInputElement;
                          addBetaUser(feature.id, input.value);
                          input.value = '';
                        }}
                        className="p-2.5 bg-brand-blue-primary text-white rounded-xl hover:bg-brand-blue-dark transition-colors shadow-md"
                      >
                        <Plus className="w-5 h-5" />
                      </button>
                    </div>
                  </div>
                )}

                {/* Feature Specific Config (Gemini Limit) */}
                {feature.id === 'gemini-functions' && (
                  <div className="mb-6 p-4 bg-purple-50 rounded-xl border border-purple-100">
                    <label className="text-xs font-bold text-purple-700 uppercase tracking-widest mb-2 block">
                      Daily Usage Limit (Standard Users)
                    </label>
                    <div className="flex items-center gap-4">
                      <input
                        type="number"
                        min="1"
                        max="1000"
                        value={(permission.config?.dailyLimit as number) ?? 20}
                        onChange={(e) => {
                          const val = parseInt(e.target.value);
                          updatePermission(feature.id, {
                            config: {
                              ...permission.config,
                              dailyLimit: isNaN(val) ? 20 : val,
                            },
                          });
                        }}
                        className="w-24 px-3 py-2 border border-purple-200 rounded-lg text-sm font-mono focus:outline-none focus:ring-2 focus:ring-purple-500"
                      />
                      <span className="text-xs text-purple-600 font-medium">
                        generations per day
                      </span>
                    </div>
                    <p className="text-xxs text-purple-500 mt-2 leading-tight">
                      Administrators have unlimited usage. Standard users will
                      see a &quot;limit reached&quot; message after this many
                      generations.
                    </p>
                  </div>
                )}

                {/* Save Button */}
                <button
                  onClick={() => savePermission(feature.id)}
                  disabled={isSaving || !unsavedChanges.has(feature.id)}
                  className={`w-full py-3 rounded-xl transition-all flex items-center justify-center gap-2 font-bold text-sm shadow-md disabled:opacity-50 ${
                    unsavedChanges.has(feature.id)
                      ? 'bg-orange-600 hover:bg-orange-700 text-white'
                      : 'bg-brand-blue-primary hover:bg-brand-blue-dark text-white'
                  }`}
                >
                  {isSaving ? (
                    'Saving...'
                  ) : (
                    <>
                      <Save className="w-4 h-4" />
                      {unsavedChanges.has(feature.id)
                        ? 'Save Changes'
                        : 'Settings Up-to-Date'}
                    </>
                  )}
                </button>
              </div>
            );
          })}
        </div>
      </>
    </div>
  );
};
