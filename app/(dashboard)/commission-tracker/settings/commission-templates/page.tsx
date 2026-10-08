'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

interface CommissionTemplate {
  id: string;
  template_name: string;
  description?: string | null;
  is_default?: boolean | null;
  is_active?: boolean | null;
}

const underlineShell =
  'group/field relative block w-full underline-field rounded-t-md border-b border-b-slate-300 pl-2.5 pr-2.5 pt-1 pb-0.5 transition-colors focus-within:border-b-emerald-500 focus-within:shadow-[0_1px_0_rgb(16_185_129/0.45),0_6px_12px_-6px_rgb(16_185_129/0.8)] dark:border-b-slate-600';
const underlineLabel =
  'block truncate text-[10px] leading-3 font-medium text-slate-500 dark:text-slate-400 group-focus-within/field:text-emerald-600 dark:group-focus-within/field:text-emerald-400';
const underlineControl =
  'w-full border-0 bg-transparent p-0 text-xs leading-4 font-medium text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-0 dark:text-white dark:placeholder:text-slate-500';

export default function CommissionTemplatesPage() {
  const router = useRouter();
  const [templates, setTemplates] = useState<CommissionTemplate[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [templateName, setTemplateName] = useState('');
  const [description, setDescription] = useState('');

  const loadTemplates = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/commission-templates');
      const data = await response.json();
      if (!response.ok || !data.success) {
        throw new Error(data.error || 'Failed to load commission templates.');
      }
      setTemplates(Array.isArray(data.templates) ? data.templates : []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load commission templates.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void loadTemplates();
  }, []);

  const handleCreate = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!templateName.trim() || isSaving) return;
    setIsSaving(true);
    setError(null);
    try {
      const response = await fetch('/api/commission-templates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          template: {
            template_name: templateName.trim(),
            description: description.trim() || null,
            client_id: 'DEMO',
            is_active: true,
            is_default: templates.length === 0,
          },
          action: 'CREATE',
        }),
      });
      const data = await response.json();
      if (!response.ok || !data.success) {
        throw new Error(data.error || 'Failed to create the template.');
      }
      router.push(`/commission-tracker/settings/commission-templates/${data.template.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create the template.');
      setIsSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-5 shadow-md flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-bold text-slate-900 dark:text-white uppercase tracking-wider">
            Commission Templates
          </h2>
          <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
            Create a template, then define its parameters and calculation steps.
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            setTemplateName('');
            setDescription('');
            setIsModalOpen(true);
          }}
          className="px-4 py-2 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs rounded-lg cursor-pointer"
        >
          New Template
        </button>
      </div>

      {error && <p className="text-xs text-rose-600 dark:text-rose-400">{error}</p>}

      <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl shadow-md overflow-hidden">
        {isLoading ? (
          <p className="p-6 text-xs text-slate-500 dark:text-slate-400">Loading templates...</p>
        ) : templates.length === 0 ? (
          <p className="p-6 text-xs text-slate-500 dark:text-slate-400">
            No commission templates yet. Create one to start adding parameters.
          </p>
        ) : (
          <ul className="divide-y divide-slate-200 dark:divide-slate-700">
            {templates.map((template) => (
              <li key={template.id}>
                <Link
                  href={`/commission-tracker/settings/commission-templates/${template.id}`}
                  className="flex items-center justify-between gap-4 px-5 py-4 hover:bg-slate-50 dark:hover:bg-slate-900/50 transition cursor-pointer"
                >
                  <div>
                    <p className="text-sm font-bold text-slate-900 dark:text-white">{template.template_name}</p>
                    {template.description && (
                      <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">{template.description}</p>
                    )}
                  </div>
                  <span className="text-slate-400 text-xs">➔</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>

      {isModalOpen && (
        <div className="app-modal fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex justify-center items-center p-4">
          <form
            onSubmit={handleCreate}
            className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 w-full max-w-lg rounded-xl p-6 shadow-2xl space-y-4"
          >
            <h3 className="text-lg font-bold text-slate-900 dark:text-white">New Commission Template</h3>
            <label className={underlineShell}>
              <span className={underlineLabel}>Template name</span>
              <input
                required
                value={templateName}
                onChange={(event) => setTemplateName(event.target.value)}
                className={`${underlineControl} h-5`}
              />
            </label>
            <label className={underlineShell}>
              <span className={underlineLabel}>Description</span>
              <textarea
                rows={3}
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                className={`${underlineControl} min-h-16 resize-none py-1`}
              />
            </label>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="px-3 py-1.5 text-xs font-bold rounded-lg border border-slate-300 dark:border-slate-700 text-slate-600 dark:text-slate-300 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSaving}
                className="px-4 py-1.5 text-xs font-bold rounded-lg bg-emerald-500 hover:bg-emerald-400 text-slate-950 cursor-pointer disabled:opacity-50"
              >
                {isSaving ? 'Creating...' : 'Create Template'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
