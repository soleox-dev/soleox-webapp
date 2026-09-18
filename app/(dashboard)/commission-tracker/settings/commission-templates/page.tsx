'use client';

import React, { useState } from 'react';

interface TemplateLogicRule {
  id: string;
  stage: 'Off-The-Top' | 'Pre-Split' | 'Post-Split';
  entity_name: string;
  rule_type: 'PERCENT' | 'AMOUNT';
  default_value: number;
}

interface CommissionTemplate {
  id: string;
  template_name: string;
  description: string;
  is_default: boolean;
  status: 'Active' | 'Inactive';
  rules: TemplateLogicRule[];
}

export default function CommissionTemplatesSettingsPage() {
  const [templates, setTemplates] = useState<CommissionTemplate[]>([
    {
      id: 'tmpl_001',
      template_name: 'Standard Individual Brokerage Split',
      description: 'Default 70/30 agent split with 2.5% KW Royalty and standard TC & Risk fees.',
      is_default: true,
      status: 'Active',
      rules: [
        { id: 'r1', stage: 'Off-The-Top', entity_name: 'KW Royalty Fee', rule_type: 'PERCENT', default_value: 0.025 },
        { id: 'r2', stage: 'Off-The-Top', entity_name: 'TC Services Co.', rule_type: 'AMOUNT', default_value: 280 },
        { id: 'r3', stage: 'Post-Split', entity_name: 'Risk Management Pool', rule_type: 'AMOUNT', default_value: 60 },
        { id: 'r4', stage: 'Post-Split', entity_name: 'Brokerage Review Desk', rule_type: 'AMOUNT', default_value: 25 },
      ],
    },
    {
      id: 'tmpl_002',
      template_name: 'Team Lead 50/50 Split Model',
      description: 'Waterfall designed for team deals with a 50% team lead override before agent post-splits.',
      is_default: false,
      status: 'Active',
      rules: [
        { id: 'r5', stage: 'Off-The-Top', entity_name: 'KW Royalty Fee', rule_type: 'PERCENT', default_value: 0.025 },
        { id: 'r6', stage: 'Pre-Split', entity_name: 'Team Lead Override', rule_type: 'PERCENT', default_value: 0.50 },
        { id: 'r7', stage: 'Post-Split', entity_name: 'Risk Management Pool', rule_type: 'AMOUNT', default_value: 60 },
      ],
    },
    {
      id: 'tmpl_003',
      template_name: 'High Volume Agent Cap Blueprint',
      description: 'Reduced off-the-top structure for agents who have achieved 100% cap status.',
      is_default: false,
      status: 'Active',
      rules: [
        { id: 'r8', stage: 'Off-The-Top', entity_name: 'TC Services Co.', rule_type: 'AMOUNT', default_value: 280 },
        { id: 'r9', stage: 'Post-Split', entity_name: 'Brokerage Review Desk', rule_type: 'AMOUNT', default_value: 25 },
      ],
    },
  ]);

  const [selectedTemplateId, setSelectedTemplateId] = useState<string>('tmpl_001');
  const [isModalOpen, setIsModalOpen] = useState<boolean>(false);
  const [editingTemplate, setEditingTemplate] = useState<CommissionTemplate | null>(null);

  // Form State
  const [formData, setFormData] = useState<Partial<CommissionTemplate>>({
    template_name: '',
    description: '',
    is_default: false,
    status: 'Active',
  });

  const activeTemplate = templates.find((t) => t.id === selectedTemplateId) || templates[0];

  const handleOpenAdd = () => {
    setEditingTemplate(null);
    setFormData({
      template_name: '',
      description: '',
      is_default: false,
      status: 'Active',
    });
    setIsModalOpen(true);
  };

  const handleOpenEdit = (tmpl: CommissionTemplate) => {
    setEditingTemplate(tmpl);
    setFormData(tmpl);
    setIsModalOpen(true);
  };

  const handleSaveTemplate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.template_name) return;

    if (editingTemplate) {
      setTemplates((prev) =>
        prev.map((tmpl) =>
          tmpl.id === editingTemplate.id ? ({ ...tmpl, ...formData } as CommissionTemplate) : tmpl
        )
      );
    } else {
      const newTmpl: CommissionTemplate = {
        id: `tmpl_${Date.now()}`,
        template_name: formData.template_name || '',
        description: formData.description || '',
        is_default: Boolean(formData.is_default),
        status: (formData.status as 'Active' | 'Inactive') || 'Active',
        rules: [
          { id: `r_${Date.now()}_1`, stage: 'Off-The-Top', entity_name: 'KW Royalty Fee', rule_type: 'PERCENT', default_value: 0.025 },
          { id: `r_${Date.now()}_2`, stage: 'Post-Split', entity_name: 'Risk Management Pool', rule_type: 'AMOUNT', default_value: 60 },
        ],
      };
      setTemplates((prev) => [...prev, newTmpl]);
      setSelectedTemplateId(newTmpl.id);
    }

    setIsModalOpen(false);
  };

  const toggleSetDefault = (id: string) => {
    setTemplates((prev) =>
      prev.map((tmpl) => ({
        ...tmpl,
        is_default: tmpl.id === id,
      }))
    );
  };

  const formatValue = (rule: TemplateLogicRule) => {
    if (rule.rule_type === 'PERCENT') {
      const pct = rule.default_value > 1 ? rule.default_value : rule.default_value * 100;
      return `${pct.toFixed(1)}%`;
    }
    return `$${rule.default_value.toLocaleString('en-US', { minimumFractionDigits: 2 })}`;
  };

  return (
    <div className="space-y-6">
      {/* Header Bar */}
      <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-5 shadow-md flex justify-between items-center transition-colors">
        <div>
          <h2 className="text-sm font-bold text-slate-900 dark:text-white uppercase tracking-wider">
            Commission Waterfall Templates
          </h2>
          <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
            Database Tables: <code className="font-mono text-emerald-600 dark:text-emerald-400">commission_templates</code>, <code className="font-mono text-emerald-600 dark:text-emerald-400">parameters</code>, <code className="font-mono text-emerald-600 dark:text-emerald-400">logic</code>
          </p>
        </div>

        <button
          onClick={handleOpenAdd}
          className="px-4 py-2 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs rounded-lg shadow-sm transition flex items-center gap-1.5"
        >
          <span>+ Create New Blueprint</span>
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: Blueprint Directory */}
        <div className="lg:col-span-5 space-y-3">
          <span className="text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider block px-1">
            Available Blueprints ({templates.length})
          </span>

          <div className="space-y-2.5">
            {templates.map((tmpl) => {
              const isSelected = tmpl.id === selectedTemplateId;
              return (
                <div
                  key={tmpl.id}
                  onClick={() => setSelectedTemplateId(tmpl.id)}
                  className={`p-4 rounded-xl border cursor-pointer transition flex flex-col justify-between space-y-3 ${
                    isSelected
                      ? 'bg-emerald-500/10 dark:bg-emerald-950/40 border-emerald-500 text-slate-900 dark:text-white shadow-md'
                      : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600'
                  }`}
                >
                  <div className="flex justify-between items-start">
                    <div>
                      <h3 className="text-xs font-bold text-slate-900 dark:text-white">{tmpl.template_name}</h3>
                      <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1 leading-relaxed">
                        {tmpl.description}
                      </p>
                    </div>
                  </div>

                  <div className="flex justify-between items-center pt-2 border-t border-slate-200/60 dark:border-slate-700/60">
                    <div className="flex items-center gap-1.5">
                      {tmpl.is_default && (
                        <span className="px-2 py-0.5 rounded text-[9px] font-extrabold bg-emerald-500/20 text-emerald-800 dark:text-emerald-300 border border-emerald-500/30">
                          DEFAULT
                        </span>
                      )}
                      <span className="text-[10px] text-slate-400 font-mono">
                        {tmpl.rules.length} Rules Attached
                      </span>
                    </div>

                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleOpenEdit(tmpl);
                      }}
                      className="text-[11px] text-slate-500 hover:text-slate-900 dark:hover:text-white font-bold underline"
                    >
                      Edit Blueprint
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Right Column: Template Execution Rules Details */}
        <div className="lg:col-span-7 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl shadow-md p-5 space-y-5 transition-colors">
          {activeTemplate && (
            <>
              <div className="flex justify-between items-start border-b border-slate-200 dark:border-slate-700 pb-4">
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="text-sm font-bold text-slate-900 dark:text-white uppercase tracking-wider">
                      {activeTemplate.template_name}
                    </h2>
                    {activeTemplate.is_default && (
                      <span className="px-2 py-0.5 bg-emerald-500/20 text-emerald-800 dark:text-emerald-300 border border-emerald-500/30 text-[9px] font-bold rounded">
                        SYSTEM DEFAULT
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                    {activeTemplate.description}
                  </p>
                </div>

                {!activeTemplate.is_default && (
                  <button
                    onClick={() => toggleSetDefault(activeTemplate.id)}
                    className="text-xs bg-slate-100 dark:bg-slate-900 hover:bg-slate-200 dark:hover:bg-slate-700 text-emerald-700 dark:text-emerald-400 border border-emerald-500/30 px-3 py-1.5 rounded-lg font-bold transition"
                  >
                    Set as Default
                  </button>
                )}
              </div>

              {/* Waterfall Calculation Steps */}
              <div className="space-y-4">
                <span className="text-xs font-bold text-slate-900 dark:text-white uppercase tracking-wider block">
                  ⚡ Pre-configured Logic Sequence
                </span>

                <div className="space-y-2">
                  {activeTemplate.rules.map((rule, idx) => (
                    <div
                      key={rule.id}
                      className="flex justify-between items-center p-3 bg-slate-50 dark:bg-slate-900 rounded-lg border border-slate-200 dark:border-slate-700 text-xs"
                    >
                      <div className="flex items-center gap-3">
                        <span className="w-5 h-5 rounded-full bg-slate-200 dark:bg-slate-800 flex items-center justify-center font-bold text-[10px] text-slate-600 dark:text-slate-300">
                          {idx + 1}
                        </span>
                        <div>
                          <span className="text-[10px] font-bold uppercase text-emerald-600 dark:text-emerald-400 block">
                            {rule.stage}
                          </span>
                          <span className="font-bold text-slate-900 dark:text-white">{rule.entity_name}</span>
                        </div>
                      </div>

                      <div className="text-right">
                        <span className="px-2 py-0.5 rounded bg-slate-200 dark:bg-slate-800 font-mono text-[10px] font-bold mr-2 text-slate-700 dark:text-slate-300">
                          {rule.rule_type}
                        </span>
                        <span className="font-mono font-bold text-emerald-600 dark:text-emerald-400">
                          {formatValue(rule)}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      {/* MODAL: ADD / EDIT BLUEPRINT */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex justify-center items-center p-4">
          <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 w-full max-w-lg rounded-xl p-6 shadow-2xl space-y-4">
            <div className="flex justify-between items-center border-b border-slate-200 dark:border-slate-700 pb-3">
              <h3 className="text-lg font-bold text-slate-900 dark:text-white">
                {editingTemplate ? 'Edit Commission Blueprint' : 'Create Commission Blueprint'}
              </h3>
              <button
                onClick={() => setIsModalOpen(false)}
                className="text-slate-400 hover:text-slate-900 dark:hover:text-white font-bold"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSaveTemplate} className="space-y-4 text-xs">
              <div>
                <label className="block text-slate-500 dark:text-slate-400 font-bold mb-1">Blueprint Name *</label>
                <input
                  type="text"
                  required
                  value={formData.template_name || ''}
                  onChange={(e) => setFormData({ ...formData, template_name: e.target.value })}
                  placeholder="e.g. Standard Individual Brokerage Split"
                  className="w-full bg-slate-100 dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg p-2 text-slate-900 dark:text-white focus:outline-none focus:border-emerald-500 font-medium"
                />
              </div>

              <div>
                <label className="block text-slate-500 dark:text-slate-400 font-bold mb-1">Description</label>
                <textarea
                  rows={3}
                  value={formData.description || ''}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  placeholder="Describe when this waterfall logic should be applied..."
                  className="w-full bg-slate-100 dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg p-2 text-slate-900 dark:text-white focus:outline-none focus:border-emerald-500 font-medium"
                />
              </div>

              <div className="flex justify-between items-center pt-2 border-t border-slate-200 dark:border-slate-700">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={Boolean(formData.is_default)}
                    onChange={(e) => setFormData({ ...formData, is_default: e.target.checked })}
                    className="rounded border-slate-300 dark:border-slate-700 text-emerald-500 focus:ring-emerald-500"
                  />
                  <span className="font-bold text-slate-700 dark:text-slate-300">Set as System Default Template</span>
                </label>

                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setIsModalOpen(false)}
                    className="px-3 py-1.5 bg-slate-100 dark:bg-slate-900 text-slate-600 dark:text-slate-400 border border-slate-300 dark:border-slate-700 rounded-lg font-bold hover:bg-slate-200 dark:hover:bg-slate-700"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-4 py-1.5 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold rounded-lg shadow-sm"
                  >
                    Save Blueprint
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}