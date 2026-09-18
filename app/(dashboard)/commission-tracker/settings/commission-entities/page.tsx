'use client';

import React, { useState, useEffect, useRef, useMemo } from 'react';

export interface CommissionEntity {
  id: string;
  client_id?: string;
  entity_name: string;
  entity_type: 'REFERRAL' | 'FRANCHISE' | 'BROKERAGE' | 'TEAM' | 'VENDOR' | 'EQUITY' | 'OTHER' | string;
  contact_name?: string;
  contact_email?: string;
  tax_id?: string;
  is_active: boolean;
  has_payments?: boolean;
  [key: string]: any;
}

interface DialogState {
  isOpen: boolean;
  type: 'CONFIRM' | 'ALERT';
  title: string;
  message: string;
  confirmText?: string;
  confirmVariant?: 'danger' | 'emerald' | 'primary';
  onConfirm?: () => void;
}

const ENTITY_TYPES = ['REFERRAL', 'FRANCHISE', 'BROKERAGE', 'TEAM', 'VENDOR', 'EQUITY', 'OTHER'];

export default function CommissionEntitiesPage() {
  const [entities, setEntities] = useState<CommissionEntity[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingEntity, setEditingEntity] = useState<CommissionEntity | null>(null);
  const [formData, setFormData] = useState<Partial<CommissionEntity>>({});

  // Custom Modal Dialog State
  const [dialog, setDialog] = useState<DialogState>({
    isOpen: false,
    type: 'CONFIRM',
    title: '',
    message: '',
  });

  const entityNameInputRef = useRef<HTMLInputElement>(null);

  const loadEntities = async () => {
    setIsLoading(true);
    try {
      const res = await fetch('/api/commission-entities');
      const data = await res.json();
      if (data.success && Array.isArray(data.entities)) {
        setEntities(data.entities);
      }
    } catch (err) {
      console.error('Failed to fetch commission entities:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadEntities();
  }, []);

  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (isModalOpen) {
        e.preventDefault();
        e.returnValue = '';
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [isModalOpen]);

  useEffect(() => {
    if (isModalOpen) {
      const timer = setTimeout(() => {
        entityNameInputRef.current?.focus();
      }, 50);
      return () => clearTimeout(timer);
    }
  }, [isModalOpen]);

  // Client-side viewing: Quick search & column sorting
  const [searchQuery, setSearchQuery] = useState('');
  const [sortField, setSortField] = useState('entity_name');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');

  const handleSort = (fieldKey: string) => {
    if (sortField === fieldKey) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(fieldKey);
      setSortOrder('asc');
    }
  };

  const processedEntities = useMemo(() => {
    let result = [...entities];

    // Global quick search across all entity fields (in-memory viewing)
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      result = result.filter((ent) => {
        return Object.entries(ent).some(([key, val]) => {
          if (val === undefined || val === null) return false;
          if (typeof val === 'object') {
            return Object.values(val).some((subVal) =>
              String(subVal ?? '').toLowerCase().includes(q)
            );
          }
          if (key === 'is_active') {
            const statusLabel = val ? 'active' : 'inactive';
            return statusLabel.includes(q);
          }
          return String(val).toLowerCase().includes(q);
        });
      });
    }

    // Sort by selected column (in-memory viewing)
    result.sort((a, b) => {
      let aVal = a[sortField];
      let bVal = b[sortField];

      if (aVal === undefined || aVal === null) aVal = '';
      if (bVal === undefined || bVal === null) bVal = '';

      if (typeof aVal === 'boolean' && typeof bVal === 'boolean') {
        return sortOrder === 'asc'
          ? (aVal === bVal ? 0 : aVal ? -1 : 1)
          : (aVal === bVal ? 0 : aVal ? 1 : -1);
      }

      if (typeof aVal === 'number' && typeof bVal === 'number') {
        return sortOrder === 'asc' ? aVal - bVal : bVal - aVal;
      }

      const strA = String(aVal);
      const strB = String(bVal);
      return sortOrder === 'asc'
        ? strA.localeCompare(strB, undefined, { numeric: true, sensitivity: 'base' })
        : strB.localeCompare(strA, undefined, { numeric: true, sensitivity: 'base' });
    });

    return result;
  }, [entities, searchQuery, sortField, sortOrder]);

  const showAlert = (title: string, message: string) => {
    setDialog({
      isOpen: true,
      type: 'ALERT',
      title,
      message,
    });
  };

  const showConfirm = (
    title: string,
    message: string,
    onConfirm: () => void,
    confirmText = 'Confirm',
    confirmVariant: 'danger' | 'emerald' | 'primary' = 'primary'
  ) => {
    setDialog({
      isOpen: true,
      type: 'CONFIRM',
      title,
      message,
      confirmText,
      confirmVariant,
      onConfirm,
    });
  };

  const closeDialog = () => {
    setDialog((prev) => ({ ...prev, isOpen: false }));
  };

  const handleOpenAdd = () => {
    setEditingEntity(null);
    setFormData({
      id: `[DEMO] ENT_${Math.floor(1000 + Math.random() * 9000)}`,
      entity_type: 'BROKERAGE',
      is_active: true,
    });
    setIsModalOpen(true);
  };

  const handleOpenEdit = (entity: CommissionEntity) => {
    setEditingEntity(entity);
    setFormData(entity);
    setIsModalOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.entity_name || isSubmitting) return;

    setIsSubmitting(true);
    const isEditing = Boolean(editingEntity);
    const targetEntity: CommissionEntity = {
      id: formData.id || `[DEMO] ENT_${Math.floor(1000 + Math.random() * 9000)}`,
      entity_name: formData.entity_name || '',
      entity_type: formData.entity_type || 'BROKERAGE',
      is_active: formData.is_active !== undefined ? formData.is_active : true,
      ...formData,
    };

    try {
      const res = await fetch('/api/commission-entities', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          entity: targetEntity,
          action: isEditing ? 'UPDATE' : 'CREATE',
        }),
      });

      if (!res.ok) throw new Error('Failed to save entity');

      setIsModalOpen(false);
      await loadEntities();
    } catch (err) {
      console.error('Save error:', err);
      showAlert('Save Error', 'Failed to save changes to the database.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const toggleStatus = (entity: CommissionEntity) => {
    if (actionLoadingId === entity.id) return;

    const nextStatus = !entity.is_active;
    const actionLabel = nextStatus ? 'activate' : 'inactivate';

    showConfirm(
      'Confirm Status Change',
      `Are you sure you want to ${actionLabel} "${entity.entity_name}"?`,
      async () => {
        closeDialog();
        setActionLoadingId(entity.id);

        const updatedEntity = { ...entity, is_active: nextStatus };

        try {
          const res = await fetch('/api/commission-entities', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ entity: updatedEntity, action: 'UPDATE' }),
          });

          if (!res.ok) throw new Error('Failed to update status');

          await loadEntities();
        } catch (err) {
          console.error('Status toggle failed:', err);
          showAlert('Update Failed', 'Failed to update entity status.');
        } finally {
          setActionLoadingId(null);
        }
      },
      nextStatus ? 'Activate' : 'Inactivate',
      nextStatus ? 'emerald' : 'primary'
    );
  };

  const handleDelete = (entity: CommissionEntity) => {
    if (entity.has_payments) {
      showAlert(
        'Action Restricted',
        `Cannot delete "${entity.entity_name}" because it has historical payments attached. You can set its status to Inactive instead.`
      );
      return;
    }

    showConfirm(
      'Delete Entity',
      `Are you sure you want to permanently delete "${entity.entity_name}"? This action cannot be undone.`,
      async () => {
        closeDialog();
        setActionLoadingId(entity.id);
        try {
          const res = await fetch(`/api/commission-entities?id=${encodeURIComponent(entity.id)}&client_id=DEMO`, {
            method: 'DELETE',
          });

          if (!res.ok) throw new Error('Failed to delete entity');

          await loadEntities();
        } catch (err) {
          console.error('Delete failed:', err);
          showAlert('Delete Failed', 'Failed to delete entity.');
        } finally {
          setActionLoadingId(null);
        }
      },
      'Delete Permanently',
      'danger'
    );
  };

  return (
    <div className="space-y-6">
      {/* Header Bar */}
      <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-5 shadow-md flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 transition-colors">
        <div>
          <h2 className="text-sm font-bold text-slate-900 dark:text-white uppercase tracking-wider">
            Commission Entities Management
          </h2>
          <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
            Database Table: <code className="font-mono text-emerald-600 dark:text-emerald-400">commission_entities</code>
            {!isLoading && (
              <span className="ml-1 text-slate-400">
                • Showing {processedEntities.length} of {entities.length} Entities
              </span>
            )}
          </p>
        </div>

        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 w-full sm:w-auto">
          {/* Quick Search */}
          <div className="relative w-full sm:w-72">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search all fields..."
              className="w-full bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg px-3.5 py-2 text-xs text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:border-emerald-500 font-medium"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-2.5 top-2 text-xs text-slate-400 hover:text-slate-900 dark:hover:text-white cursor-pointer"
              >
                ✕
              </button>
            )}
          </div>

          <button
            onClick={handleOpenAdd}
            className="px-4 py-2 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs rounded-lg shadow-sm transition flex items-center justify-center gap-1.5 whitespace-nowrap cursor-pointer"
          >
            <span>+ Add New Entity</span>
          </button>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl shadow-md overflow-hidden transition-colors">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-100 dark:bg-slate-950 text-slate-500 dark:text-slate-400 font-bold uppercase border-b border-slate-200 dark:border-slate-700 select-none">
              <tr>
                {[
                  { key: 'id', label: 'Entity ID' },
                  { key: 'entity_name', label: 'Entity Name' },
                  { key: 'entity_type', label: 'Entity Type' },
                  { key: 'contact_name', label: 'Contact Name' },
                  { key: 'contact_email', label: 'Contact Email' },
                  { key: 'tax_id', label: 'Tax ID (EIN)' },
                  { key: 'is_active', label: 'Status', alignCenter: true },
                ].map((col) => (
                  <th
                    key={col.key}
                    onClick={() => handleSort(col.key)}
                    className={`p-3.5 whitespace-nowrap cursor-pointer hover:text-slate-900 dark:hover:text-white transition group ${
                      col.alignCenter ? 'text-center' : ''
                    }`}
                  >
                    <div className={`flex items-center gap-1.5 ${col.alignCenter ? 'justify-center' : ''}`}>
                      <span>{col.label}</span>
                      <span className="text-slate-400 dark:text-slate-600 group-hover:opacity-100 transition">
                        {sortField === col.key ? (sortOrder === 'asc' ? '↑' : '↓') : '↕'}
                      </span>
                    </div>
                  </th>
                ))}
                <th className="p-3.5 text-center whitespace-nowrap">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 dark:divide-slate-700/60 font-medium text-slate-800 dark:text-slate-200">
              {isLoading ? (
                <tr>
                  <td colSpan={8} className="p-5 text-center text-slate-400">
                    Loading commission entities...
                  </td>
                </tr>
              ) : processedEntities.length === 0 ? (
                <tr>
                  <td colSpan={8} className="p-5 text-center text-slate-400 italic">
                    {searchQuery ? `No matching commission entities found for "${searchQuery}".` : 'No commission entities found.'}
                  </td>
                </tr>
              ) : (
                processedEntities.map((ent) => {
                  const isActionLoading = actionLoadingId === ent.id;

                  return (
                    <tr
                      key={ent.id}
                      className={`hover:bg-slate-50 dark:hover:bg-slate-700/30 transition ${
                        !ent.is_active ? 'bg-slate-50/50 dark:bg-slate-900/40 opacity-70' : ''
                      }`}
                    >
                      <td className="p-3.5 whitespace-nowrap font-bold">
                        <button
                          onClick={() => handleOpenEdit(ent)}
                          className="text-emerald-600 dark:text-emerald-400 hover:underline transition text-left cursor-pointer"
                        >
                          {ent.id}
                        </button>
                      </td>

                      <td className="p-3.5 whitespace-nowrap">
                        <button
                          onClick={() => handleOpenEdit(ent)}
                          className="font-bold text-slate-900 dark:text-white hover:text-emerald-600 dark:hover:text-emerald-400 hover:underline transition text-left cursor-pointer"
                        >
                          {ent.entity_name}
                        </button>
                      </td>

                      <td className="p-3.5 whitespace-nowrap">
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-100 dark:bg-slate-900 border border-slate-300 dark:border-slate-700 uppercase">
                          {ent.entity_type || 'BROKERAGE'}
                        </span>
                      </td>

                      <td className="p-3.5 whitespace-nowrap text-slate-700 dark:text-slate-300">
                        {ent.contact_name || '—'}
                      </td>

                      <td className="p-3.5 whitespace-nowrap text-slate-500 dark:text-slate-400">
                        {ent.contact_email || '—'}
                      </td>

                      <td className="p-3.5 whitespace-nowrap font-mono text-slate-600 dark:text-slate-300">
                        {ent.tax_id || '—'}
                      </td>

                      {/* Status Button with Spinning State */}
                      <td className="p-3.5 text-center whitespace-nowrap">
                        <button
                          disabled={isActionLoading}
                          onClick={() => toggleStatus(ent)}
                          className={`px-2 py-0.5 rounded text-[10px] font-bold border uppercase transition cursor-pointer disabled:opacity-50 flex items-center justify-center gap-1 mx-auto ${
                            ent.is_active
                              ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/30'
                              : 'bg-slate-200 dark:bg-slate-900 text-slate-400 border-slate-300 dark:border-slate-700'
                          }`}
                        >
                          {isActionLoading ? (
                            <>
                              <span className="animate-spin text-[10px]">⏳</span>
                              <span>Updating...</span>
                            </>
                          ) : (
                            ent.is_active ? 'Active' : 'Inactive'
                          )}
                        </button>
                      </td>

                      <td className="p-3.5 text-center whitespace-nowrap">
                        <div className="flex items-center justify-center gap-1.5">
                          <button
                            disabled={isActionLoading}
                            onClick={() => handleOpenEdit(ent)}
                            className="text-xs bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 border border-slate-300 dark:border-slate-700 px-2.5 py-1 rounded font-bold transition cursor-pointer disabled:opacity-50"
                          >
                            Edit
                          </button>

                          <button
                            disabled={isActionLoading}
                            onClick={() => handleDelete(ent)}
                            className="text-rose-500 hover:text-rose-600 font-bold p-1 rounded hover:bg-rose-500/10 cursor-pointer disabled:opacity-50"
                            title="Delete entity"
                          >
                            {isActionLoading ? <span className="animate-spin inline-block">⏳</span> : '🗑️'}
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex justify-center items-center p-4">
          <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 w-full max-w-lg rounded-xl p-6 shadow-2xl space-y-4">
            <div className="flex justify-between items-center border-b border-slate-200 dark:border-slate-700 pb-3">
              <h3 className="text-lg font-bold text-slate-900 dark:text-white">
                {editingEntity ? `Edit Entity: ${editingEntity.entity_name}` : 'Add New Entity'}
              </h3>
              <button
                disabled={isSubmitting}
                onClick={() => setIsModalOpen(false)}
                tabIndex={-1}
                className="text-slate-400 hover:text-slate-900 dark:hover:text-white font-bold cursor-pointer disabled:opacity-50"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSave} className="space-y-3 text-xs">
              <div>
                <label className="block text-slate-500 dark:text-slate-400 font-bold mb-1">Entity ID</label>
                <input
                  type="text"
                  disabled
                  tabIndex={-1}
                  value={String(formData.id || editingEntity?.id || 'Auto-generated')}
                  className="w-full bg-slate-200 dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg p-2 text-slate-500 font-mono cursor-not-allowed"
                />
              </div>

              <div>
                <label className="block text-slate-500 dark:text-slate-400 font-bold mb-1">Entity Name *</label>
                <input
                  ref={entityNameInputRef}
                  type="text"
                  required
                  tabIndex={1}
                  disabled={isSubmitting}
                  value={String(formData.entity_name || '')}
                  onChange={(e) => setFormData({ ...formData, entity_name: e.target.value })}
                  className="w-full bg-slate-100 dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg p-2 text-slate-900 dark:text-white font-medium focus:outline-none focus:border-emerald-500 disabled:opacity-50"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-500 dark:text-slate-400 font-bold mb-1">Entity Type *</label>
                  <select
                    required
                    tabIndex={2}
                    disabled={isSubmitting}
                    value={String(formData.entity_type || 'BROKERAGE')}
                    onChange={(e) => setFormData({ ...formData, entity_type: e.target.value })}
                    className="w-full bg-slate-100 dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg p-2 text-slate-900 dark:text-white font-medium focus:outline-none focus:border-emerald-500 disabled:opacity-50"
                  >
                    {ENTITY_TYPES.map((type) => (
                      <option key={type} value={type}>
                        {type}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-slate-500 dark:text-slate-400 font-bold mb-1">Tax ID / EIN</label>
                  <input
                    type="text"
                    tabIndex={3}
                    disabled={isSubmitting}
                    value={String(formData.tax_id || '')}
                    onChange={(e) => setFormData({ ...formData, tax_id: e.target.value })}
                    className="w-full bg-slate-100 dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg p-2 text-slate-900 dark:text-white font-mono focus:outline-none focus:border-emerald-500 disabled:opacity-50"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-500 dark:text-slate-400 font-bold mb-1">Contact Name</label>
                  <input
                    type="text"
                    tabIndex={4}
                    disabled={isSubmitting}
                    value={String(formData.contact_name || '')}
                    onChange={(e) => setFormData({ ...formData, contact_name: e.target.value })}
                    className="w-full bg-slate-100 dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg p-2 text-slate-900 dark:text-white font-medium focus:outline-none focus:border-emerald-500 disabled:opacity-50"
                  />
                </div>

                <div>
                  <label className="block text-slate-500 dark:text-slate-400 font-bold mb-1">Contact Email</label>
                  <input
                    type="email"
                    tabIndex={5}
                    disabled={isSubmitting}
                    value={String(formData.contact_email || '')}
                    onChange={(e) => setFormData({ ...formData, contact_email: e.target.value })}
                    className="w-full bg-slate-100 dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg p-2 text-slate-900 dark:text-white font-medium focus:outline-none focus:border-emerald-500 disabled:opacity-50"
                  />
                </div>
              </div>

              <div className="pt-2">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    tabIndex={6}
                    disabled={isSubmitting}
                    checked={Boolean(formData.is_active)}
                    onChange={(e) => setFormData({ ...formData, is_active: e.target.checked })}
                    className="rounded border-slate-300 dark:border-slate-700 text-emerald-500 focus:ring-emerald-500 disabled:opacity-50"
                  />
                  <span className="font-bold text-slate-700 dark:text-slate-300">Active Entity</span>
                </label>
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-200 dark:border-slate-700">
                <button
                  type="button"
                  tabIndex={8}
                  disabled={isSubmitting}
                  onClick={() => setIsModalOpen(false)}
                  className="px-3 py-1.5 bg-slate-100 dark:bg-slate-900 text-slate-600 dark:text-slate-400 border border-slate-300 dark:border-slate-700 rounded-lg font-bold hover:bg-slate-200 dark:hover:bg-slate-700 cursor-pointer disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  tabIndex={7}
                  disabled={isSubmitting}
                  className="px-4 py-1.5 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold rounded-lg shadow-sm cursor-pointer disabled:opacity-50 flex items-center gap-1.5"
                >
                  {isSubmitting ? (
                    <>
                      <span className="animate-spin">⏳</span>
                      <span>Saving...</span>
                    </>
                  ) : (
                    <span>Save Entity</span>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Custom React Confirm/Alert Dialog */}
      {dialog.isOpen && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex justify-center items-center p-4 animate-in fade-in duration-200">
          <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 w-full max-w-sm rounded-xl p-5 shadow-2xl space-y-4">
            <div>
              <h3 className="text-base font-bold text-slate-900 dark:text-white">{dialog.title}</h3>
              <p className="text-xs text-slate-600 dark:text-slate-300 mt-1.5 leading-relaxed">{dialog.message}</p>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              {dialog.type === 'CONFIRM' && (
                <button
                  type="button"
                  onClick={closeDialog}
                  className="px-3.5 py-1.5 bg-slate-100 dark:bg-slate-900 text-slate-700 dark:text-slate-300 border border-slate-300 dark:border-slate-700 rounded-lg font-bold text-xs hover:bg-slate-200 dark:hover:bg-slate-700 cursor-pointer transition"
                >
                  Cancel
                </button>
              )}

              <button
                type="button"
                onClick={() => {
                  if (dialog.type === 'CONFIRM' && dialog.onConfirm) {
                    dialog.onConfirm();
                  } else {
                    closeDialog();
                  }
                }}
                className={`px-4 py-1.5 font-bold text-xs rounded-lg shadow-sm cursor-pointer transition ${
                  dialog.confirmVariant === 'danger'
                    ? 'bg-rose-600 hover:bg-rose-500 text-white'
                    : dialog.confirmVariant === 'emerald'
                    ? 'bg-emerald-500 hover:bg-emerald-400 text-slate-950'
                    : 'bg-slate-900 hover:bg-slate-800 text-white dark:bg-slate-100 dark:hover:bg-slate-200 dark:text-slate-900'
                }`}
              >
                {dialog.type === 'CONFIRM' ? dialog.confirmText || 'Confirm' : 'OK'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}