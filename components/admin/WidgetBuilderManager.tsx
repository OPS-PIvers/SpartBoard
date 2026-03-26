import React, { useState } from 'react';
import { Plus, Pencil, Trash2, Eye, EyeOff, Code2, Puzzle } from 'lucide-react';
import { CustomWidgetDoc } from '@/types';
import { useCustomWidgets } from '@/context/useCustomWidgets';
import { useDialog } from '@/context/useDialog';
import { WidgetBuilderModal } from './WidgetBuilder/index';

export const WidgetBuilderManager: React.FC = () => {
  const { customWidgets, loading, setPublished, deleteCustomWidget } =
    useCustomWidgets();
  const { showConfirm } = useDialog();

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingWidget, setEditingWidget] = useState<CustomWidgetDoc | null>(
    null
  );
  const [togglingId, setTogglingId] = useState<string | null>(null);

  const handleNew = () => {
    setEditingWidget(null);
    setIsModalOpen(true);
  };

  const handleEdit = (widget: CustomWidgetDoc) => {
    setEditingWidget(widget);
    setIsModalOpen(true);
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
    setEditingWidget(null);
  };

  const handleTogglePublished = async (widget: CustomWidgetDoc) => {
    setTogglingId(widget.id);
    try {
      await setPublished(widget.id, !widget.published);
    } finally {
      setTogglingId(null);
    }
  };

  const handleDelete = async (widget: CustomWidgetDoc) => {
    const confirmed = await showConfirm(
      `Delete "${widget.title}"? This cannot be undone.`
    );
    if (!confirmed) return;
    await deleteCustomWidget(widget.id);
  };

  return (
    <div className="flex flex-col gap-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-bold text-white">Widget Builder</h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Create and manage custom widgets for your dashboard.
          </p>
        </div>
        <button
          onClick={handleNew}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors"
        >
          <Plus size={14} />
          New Widget
        </button>
      </div>

      {/* Table */}
      {loading ? (
        <div className="text-slate-400 text-sm py-6 text-center">
          Loading widgets...
        </div>
      ) : customWidgets.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <Puzzle size={48} className="text-slate-600 mb-3" />
          <p className="text-slate-400 font-medium">No custom widgets yet.</p>
          <p className="text-slate-500 text-sm mt-1">
            Click &quot;New Widget&quot; to create your first one.
          </p>
        </div>
      ) : (
        <div className="overflow-auto rounded-xl border border-slate-700">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-800 border-b border-slate-700">
                <th className="px-4 py-2.5 text-left text-xs font-semibold text-slate-400 uppercase tracking-wide">
                  Icon
                </th>
                <th className="px-4 py-2.5 text-left text-xs font-semibold text-slate-400 uppercase tracking-wide">
                  Name
                </th>
                <th className="px-4 py-2.5 text-left text-xs font-semibold text-slate-400 uppercase tracking-wide">
                  Mode
                </th>
                <th className="px-4 py-2.5 text-left text-xs font-semibold text-slate-400 uppercase tracking-wide">
                  Status
                </th>
                <th className="px-4 py-2.5 text-left text-xs font-semibold text-slate-400 uppercase tracking-wide">
                  Access
                </th>
                <th className="px-4 py-2.5 text-left text-xs font-semibold text-slate-400 uppercase tracking-wide">
                  Updated
                </th>
                <th className="px-4 py-2.5 text-left text-xs font-semibold text-slate-400 uppercase tracking-wide">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody>
              {customWidgets.map((widget, i) => (
                <tr
                  key={widget.id}
                  className={`border-b border-slate-700/50 hover:bg-slate-800/50 transition-colors ${
                    i % 2 === 0 ? 'bg-slate-900' : 'bg-slate-900/60'
                  }`}
                >
                  {/* Icon */}
                  <td className="px-4 py-3">
                    <div
                      className={`w-8 h-8 rounded-lg ${widget.color} flex items-center justify-center text-base leading-none`}
                    >
                      {widget.icon}
                    </div>
                  </td>

                  {/* Name */}
                  <td className="px-4 py-3">
                    <p className="font-medium text-white">{widget.title}</p>
                    {widget.description && (
                      <p className="text-xs text-slate-500 truncate max-w-48">
                        {widget.description}
                      </p>
                    )}
                    <p className="text-xs text-slate-600 font-mono">
                      {widget.slug}
                    </p>
                  </td>

                  {/* Mode */}
                  <td className="px-4 py-3">
                    <span className="flex items-center gap-1.5 text-xs text-slate-300">
                      {widget.mode === 'code' ? (
                        <>
                          <Code2 size={12} className="text-amber-400" />
                          Code
                        </>
                      ) : (
                        <>
                          <Puzzle size={12} className="text-blue-400" />
                          Block
                        </>
                      )}
                    </span>
                  </td>

                  {/* Status */}
                  <td className="px-4 py-3">
                    <span
                      className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                        widget.published
                          ? 'bg-emerald-900/40 text-emerald-300 border border-emerald-700'
                          : 'bg-slate-700 text-slate-400 border border-slate-600'
                      }`}
                    >
                      {widget.published ? 'Published' : 'Draft'}
                    </span>
                  </td>

                  {/* Access */}
                  <td className="px-4 py-3">
                    <span
                      className={`text-xs font-medium capitalize ${
                        widget.accessLevel === 'admin'
                          ? 'text-red-400'
                          : widget.accessLevel === 'beta'
                            ? 'text-amber-400'
                            : 'text-emerald-400'
                      }`}
                    >
                      {widget.accessLevel}
                    </span>
                  </td>

                  {/* Updated */}
                  <td className="px-4 py-3 text-xs text-slate-400">
                    {new Date(widget.updatedAt).toLocaleDateString()}
                  </td>

                  {/* Actions */}
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => handleEdit(widget)}
                        className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-700 rounded transition-colors"
                        title="Edit widget"
                      >
                        <Pencil size={13} />
                      </button>

                      <button
                        onClick={() => handleTogglePublished(widget)}
                        disabled={togglingId === widget.id}
                        className={`p-1.5 rounded transition-colors disabled:opacity-50 ${
                          widget.published
                            ? 'text-emerald-400 hover:text-slate-300 hover:bg-slate-700'
                            : 'text-slate-400 hover:text-emerald-400 hover:bg-slate-700'
                        }`}
                        title={widget.published ? 'Unpublish' : 'Publish'}
                      >
                        {widget.published ? (
                          <EyeOff size={13} />
                        ) : (
                          <Eye size={13} />
                        )}
                      </button>

                      <button
                        onClick={() => handleDelete(widget)}
                        className="p-1.5 text-slate-400 hover:text-red-400 hover:bg-red-900/20 rounded transition-colors"
                        title="Delete widget"
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Modal */}
      <WidgetBuilderModal
        isOpen={isModalOpen}
        onClose={handleCloseModal}
        existingWidget={editingWidget}
      />
    </div>
  );
};
