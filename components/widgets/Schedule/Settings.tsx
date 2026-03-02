import React, { useState } from 'react';
import { useDashboard } from '../../../context/useDashboard';
import {
  WidgetData,
  ScheduleConfig,
  ScheduleItem,
  WidgetType,
} from '../../../types';
import {
  Type,
  Clock,
  CheckCircle2,
  Plus,
  Trash2,
  Pencil,
  X,
  Save,
  GripVertical,
  Timer,
  Palette,
  Settings2,
} from 'lucide-react';
import { Toggle } from '../../common/Toggle';
import { Button } from '../../common/Button';

const AVAILABLE_WIDGETS: { type: WidgetType; label: string }[] = [
  { type: 'time-tool', label: 'Timer' },
  { type: 'clock', label: 'Clock' },
  { type: 'poll', label: 'Poll' },
  { type: 'text', label: 'Text' },
  { type: 'traffic', label: 'Traffic Light' },
  { type: 'sound', label: 'Sound Level' },
  { type: 'checklist', label: 'Checklist' },
  { type: 'random', label: 'Randomizer' },
  { type: 'dice', label: 'Dice' },
  { type: 'drawing', label: 'Drawing' },
  { type: 'qr', label: 'QR Code' },
  { type: 'embed', label: 'Embed' },
  { type: 'webcam', label: 'Webcam' },
  { type: 'scoreboard', label: 'Scoreboard' },
  { type: 'weather', label: 'Weather' },
  { type: 'lunchCount', label: 'Lunch Count' },
];

const FONTS = [
  { id: 'global', label: 'Inherit', icon: 'G' },
  { id: 'font-mono', label: 'Digital', icon: '01' },
  { id: 'font-sans', label: 'Modern', icon: 'Aa' },
  { id: 'font-handwritten', label: 'School', icon: '✏️' },
];

export const ScheduleSettings: React.FC<{ widget: WidgetData }> = ({
  widget,
}) => {
  const { updateWidget } = useDashboard();
  const config = widget.config as ScheduleConfig;
  const items = config.items ?? [];

  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [tempItem, setTempItem] = useState<ScheduleItem | null>(null);

  const handleStartEdit = (index: number) => {
    setEditingIndex(index);
    setTempItem({ ...items[index] });
  };

  const handleStartAdd = () => {
    setEditingIndex(-1);
    setTempItem({
      id: crypto.randomUUID(),
      time: '',
      task: '',
      startTime: '',
      endTime: '',
      mode: 'clock',
      linkedWidgets: [],
    });
  };

  const handleSave = () => {
    if (!tempItem) return;

    // Sync legacy time field with startTime when startTime is non-empty
    const shouldSyncStartTime =
      typeof tempItem.startTime === 'string' &&
      tempItem.startTime.trim() !== '';

    const itemToSave: ScheduleItem = {
      ...tempItem,
      // Sync time from startTime, or omit if both are empty
      time: shouldSyncStartTime ? tempItem.startTime : tempItem.time,
      // Ensure ID
      id: tempItem.id ?? crypto.randomUUID(),
    };

    const newItems = [...items];
    if (editingIndex === -1) {
      newItems.push(itemToSave);
    } else if (editingIndex !== null) {
      newItems[editingIndex] = itemToSave;
    }

    updateWidget(widget.id, {
      config: { ...config, items: newItems } as ScheduleConfig,
    });
    setEditingIndex(null);
    setTempItem(null);
  };

  const handleDelete = (index: number) => {
    if (confirm('Are you sure you want to delete this event?')) {
      const newItems = [...items];
      newItems.splice(index, 1);
      updateWidget(widget.id, {
        config: { ...config, items: newItems } as ScheduleConfig,
      });
    }
  };

  const handleMove = (index: number, direction: 'up' | 'down') => {
    if (direction === 'up' && index === 0) return;
    if (direction === 'down' && index === items.length - 1) return;

    const newItems = [...items];
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    [newItems[index], newItems[targetIndex]] = [
      newItems[targetIndex],
      newItems[index],
    ];

    updateWidget(widget.id, {
      config: { ...config, items: newItems } as ScheduleConfig,
    });
  };

  // Render Edit Form
  if (editingIndex !== null && tempItem) {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between border-b pb-2">
          <h3 className="text-sm font-bold text-slate-800">
            {editingIndex === -1 ? 'Add Event' : 'Edit Event'}
          </h3>
          <button
            type="button"
            onClick={() => setEditingIndex(null)}
            aria-label="Close event editor"
            className="text-slate-400 hover:text-slate-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-500 focus-visible:ring-offset-2 focus-visible:ring-offset-white rounded-full"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="space-y-3">
          <div>
            <label className="text-xs font-semibold text-slate-500 uppercase">
              Task Name
            </label>
            <input
              className="w-full p-2 border rounded-lg text-sm"
              value={tempItem.task}
              onChange={(e) =>
                setTempItem({ ...tempItem, task: e.target.value })
              }
              placeholder="e.g. Math Class"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold text-slate-500 uppercase">
                Start Time
              </label>
              <input
                type="time"
                className="w-full p-2 border rounded-lg text-sm"
                value={tempItem.startTime ?? ''}
                onChange={(e) =>
                  setTempItem({ ...tempItem, startTime: e.target.value })
                }
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-500 uppercase">
                End Time
              </label>
              <input
                type="time"
                className="w-full p-2 border rounded-lg text-sm"
                value={tempItem.endTime ?? ''}
                onChange={(e) =>
                  setTempItem({ ...tempItem, endTime: e.target.value })
                }
              />
            </div>
          </div>

          <div>
            <label className="text-xs font-semibold text-slate-500 uppercase mb-2 block">
              Display Mode
            </label>
            <div className="flex gap-2" role="group" aria-label="Display mode">
              <button
                type="button"
                onClick={() => setTempItem({ ...tempItem, mode: 'clock' })}
                className={`flex-1 p-2 border rounded-lg text-sm flex items-center justify-center gap-2 ${tempItem.mode === 'clock' ? 'bg-blue-50 border-blue-500 text-blue-600' : 'bg-white'}`}
                aria-pressed={tempItem.mode === 'clock'}
              >
                <Clock className="w-4 h-4" /> Clock
              </button>
              <button
                type="button"
                onClick={() => setTempItem({ ...tempItem, mode: 'timer' })}
                className={`flex-1 p-2 border rounded-lg text-sm flex items-center justify-center gap-2 ${tempItem.mode === 'timer' ? 'bg-blue-50 border-blue-500 text-blue-600' : 'bg-white'}`}
                aria-pressed={tempItem.mode === 'timer'}
              >
                <Timer className="w-4 h-4" /> Timer
              </button>
            </div>
            <p className="text-xs text-slate-400 mt-1">
              {tempItem.mode === 'clock'
                ? 'Shows start and end times (e.g. 10:00 - 10:30)'
                : 'Shows countdown when active (e.g. 25:00)'}
            </p>
          </div>

          <div>
            <label className="text-xs font-semibold text-slate-500 uppercase mb-2 block">
              Auto-Launch Widgets
            </label>
            <div className="bg-slate-50 p-2 rounded-lg border max-h-40 overflow-y-auto grid grid-cols-2 gap-2">
              {AVAILABLE_WIDGETS.map((w) => {
                const currentLinked = tempItem.linkedWidgets ?? [];
                const isSelected = currentLinked.includes(w.type);
                return (
                  <button
                    key={w.type}
                    type="button"
                    onClick={() => {
                      const newLinked = isSelected
                        ? currentLinked.filter((t) => t !== w.type)
                        : [...currentLinked, w.type];
                      setTempItem({ ...tempItem, linkedWidgets: newLinked });
                    }}
                    className={`text-xs p-2 rounded border flex items-center gap-2 ${isSelected ? 'bg-blue-100 border-blue-300 text-blue-800' : 'bg-white border-slate-200 text-slate-600'}`}
                    aria-pressed={isSelected}
                    aria-label={`${isSelected ? 'Remove' : 'Add'} ${w.label}`}
                  >
                    {isSelected && (
                      <CheckCircle2 className="w-3 h-3 text-blue-500" />
                    )}
                    {w.label}
                  </button>
                );
              })}
            </div>
            <p className="text-xs text-slate-400 mt-1">
              Selected widgets will launch automatically when this event starts.
            </p>
          </div>
        </div>

        <div className="flex gap-2 pt-4">
          <Button
            variant="secondary"
            onClick={() => setEditingIndex(null)}
            className="flex-1"
          >
            Cancel
          </Button>
          <Button variant="primary" onClick={handleSave} className="flex-1">
            <Save className="w-4 h-4 mr-2" /> Save
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Schedule Items */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <label className="text-xxs text-slate-400 uppercase tracking-widest block flex items-center gap-2">
            <Clock className="w-3 h-3" /> Schedule Events
          </label>
          <button
            onClick={handleStartAdd}
            className="text-xs flex items-center gap-1 text-blue-600 hover:text-blue-700 font-medium"
          >
            <Plus className="w-3 h-3" /> Add Event
          </button>
        </div>

        <div className="space-y-2">
          {items.map((item, i) => (
            <div
              key={
                item.id ??
                `${item.task}-${item.startTime ?? item.time}-${item.endTime ?? ''}-${item.mode}`
              }
              className="flex items-center gap-2 bg-white p-2 rounded-lg border border-slate-200 shadow-sm group"
            >
              <div className="flex flex-col items-center gap-0.5 text-slate-300">
                <button
                  type="button"
                  onClick={() => handleMove(i, 'up')}
                  disabled={i === 0}
                  className="hover:text-slate-600 disabled:opacity-30"
                  aria-label="Move event up"
                >
                  <GripVertical className="w-3 h-3" />
                </button>
                <button
                  type="button"
                  onClick={() => handleMove(i, 'down')}
                  disabled={i === items.length - 1}
                  className="hover:text-slate-600 disabled:opacity-30"
                  aria-label="Move event down"
                >
                  <GripVertical className="w-3 h-3" />
                </button>
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-bold text-slate-700 truncate">
                    {item.task}
                  </span>
                  {item.mode === 'timer' && (
                    <span className="text-xxs bg-slate-100 px-1 rounded text-slate-500">
                      Timer
                    </span>
                  )}
                </div>
                <div className="text-xs text-slate-400 font-mono">
                  {item.startTime ?? item.time}{' '}
                  {item.endTime ? `- ${item.endTime}` : ''}
                </div>
              </div>
              <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                <button
                  type="button"
                  onClick={() => handleStartEdit(i)}
                  className="p-1.5 text-slate-400 hover:text-blue-500 hover:bg-blue-50 rounded"
                  aria-label="Edit event"
                  title="Edit event"
                >
                  <Pencil className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => handleDelete(i)}
                  className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded"
                  aria-label="Delete event"
                  title="Delete event"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          ))}
          {items.length === 0 && (
            <div className="text-center py-8 text-slate-400 border-2 border-dashed rounded-xl bg-slate-50">
              <p className="text-sm">No events scheduled.</p>
              <button
                onClick={handleStartAdd}
                className="text-blue-500 text-xs mt-2 hover:underline"
              >
                Add your first event
              </button>
            </div>
          )}
        </div>
      </div>

      <hr className="border-slate-100" />

      {/* Typography */}
      <div>
        <label className="text-xxs text-slate-400 uppercase tracking-widest mb-3 block flex items-center gap-2">
          <Type className="w-3 h-3" /> Typography
        </label>
        <div className="grid grid-cols-4 gap-2">
          {FONTS.map((f) => (
            <button
              key={f.id}
              onClick={() =>
                updateWidget(widget.id, {
                  config: { ...config, fontFamily: f.id } as ScheduleConfig,
                })
              }
              className={`p-2 rounded-lg border-2 flex flex-col items-center gap-1 transition-all ${
                config.fontFamily === f.id ||
                (!config.fontFamily && f.id === 'global')
                  ? 'border-blue-500 bg-blue-50'
                  : 'border-slate-100 hover:border-slate-200'
              }`}
            >
              <span className={`text-sm ${f.id} text-slate-900`}>{f.icon}</span>
              <span className="text-xxxs uppercase text-slate-600">
                {f.label}
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* Card Style */}
      <div>
        <label className="text-xxs text-slate-400 uppercase tracking-widest mb-3 block flex items-center gap-2">
          <Palette className="w-3 h-3" /> Card Style
        </label>
        <div className="bg-slate-50 p-3 rounded-xl border border-slate-100 space-y-3">
          {/* Card Color */}
          <div>
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-slate-700">
                Card Color
              </span>
              <div className="flex items-center gap-2">
                <span className="text-xs text-slate-400 font-mono">
                  {config.cardColor ?? '#ffffff'}
                </span>
                <input
                  type="color"
                  value={config.cardColor ?? '#ffffff'}
                  onChange={(e) =>
                    updateWidget(widget.id, {
                      config: {
                        ...config,
                        cardColor: e.target.value,
                      } as ScheduleConfig,
                    })
                  }
                  className="w-8 h-8 rounded cursor-pointer border border-slate-200 p-0.5"
                  aria-label="Card color"
                  title="Choose card background color"
                />
              </div>
            </div>
          </div>

          {/* Card Opacity */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <span className="text-sm font-medium text-slate-700">
                Card Opacity
              </span>
              <span className="text-xs text-slate-500 tabular-nums">
                {Math.round((config.cardOpacity ?? 1) * 100)}%
              </span>
            </div>
            <input
              type="range"
              min="0"
              max="1"
              step="0.05"
              value={config.cardOpacity ?? 1}
              onChange={(e) =>
                updateWidget(widget.id, {
                  config: {
                    ...config,
                    cardOpacity: parseFloat(e.target.value),
                  } as ScheduleConfig,
                })
              }
              aria-label="Card opacity"
              className="w-full accent-blue-500"
            />
            <p className="text-xs text-slate-400 mt-1">
              Set to 0% for fully transparent cards — schedule items appear as
              floating text on the board background.
            </p>
          </div>
        </div>
      </div>

      <div>
        <label className="text-xxs text-slate-400 uppercase tracking-widest mb-3 block flex items-center gap-2">
          <CheckCircle2 className="w-3 h-3" /> Auto-Checkoff
        </label>

        <div className="bg-slate-50 p-3 rounded-xl border border-slate-100 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-slate-700">
              Auto-Complete Items
            </span>
            <Toggle
              checked={config.autoProgress ?? false}
              onChange={(checked) =>
                updateWidget(widget.id, {
                  config: {
                    ...config,
                    autoProgress: checked,
                  } as ScheduleConfig,
                })
              }
            />
          </div>

          <p className="text-xs text-slate-500">
            Automatically check off items when their time passes.
          </p>
        </div>
      </div>

      <hr className="border-slate-100" />

      {/* Building Sync */}
      <div>
        <label className="text-xxs text-slate-400 uppercase tracking-widest mb-3 block flex items-center gap-2">
          <Settings2 className="w-3 h-3" /> Building Integration
        </label>
        <div className="bg-slate-50 p-3 rounded-xl border border-slate-100 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-slate-700">
              Sync Building Schedule
            </span>
            <Toggle
              checked={config.isBuildingSyncEnabled ?? true}
              onChange={(checked) =>
                updateWidget(widget.id, {
                  config: {
                    ...config,
                    isBuildingSyncEnabled: checked,
                  } as ScheduleConfig,
                })
              }
            />
          </div>
          <p className="text-xs text-slate-500">
            Automatically show district defaults for your building.
          </p>
        </div>
      </div>
    </div>
  );
};
