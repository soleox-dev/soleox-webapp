'use client';

import React, { useState } from 'react';

interface CommissionRule {
  id: string;
  name: string;
  category: 'Off-The-Top' | 'Post-Split';
  entity: string;
  type: 'PERCENT' | 'AMOUNT';
  defaultValue: number;
  description: string;
  appliesTo: 'All Transactions' | 'Agents Only' | 'Team Leads Only';
  status: 'Active' | 'Inactive';
}

export default function CommissionRulesSettingsPage() {
  const [search, setSearch] = useState('');
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);

  // Default waterfall system rules state
  const [rules, setRules] = useState<CommissionRule[]>([
    {
      id: 'RULE-001',
      name: 'Outside Referral Default',
      category: 'Off-The-Top',
      entity: 'Referral Brokerage',
      type: 'PERCENT',
      defaultValue: 0.20, // 20%
      description: 'Standard 20% deduction calculated off Gross Commission Income (GCI).',
      appliesTo: 'All Transactions',
      status: 'Active',
    },
    {
      id: 'RULE-002',
      name: 'TC Fee (Transaction Coordinator)',
      category: 'Off-The-Top',
      entity: 'TC Coordinator',
      type: 'AMOUNT',
      defaultValue: 280, // $280 flat
      description: 'Flat transaction management fee deducted prior to agent splits.',
      appliesTo: 'All Transactions',
      status: 'Active',
    },
    {
      id: 'RULE-003',
      name: 'Risk Management / E&O Insurance',
      category: 'Post-Split',
      entity: 'Risk Mgmt Fund',
      type: 'AMOUNT',
      defaultValue: 60, // $60
      description: 'Per-transaction E&O insurance fee deducted from agent net payout.',
      appliesTo: 'Agents Only',
      status: 'Active',
    },
    {
      id: 'RULE-004',
      name: 'Broker Review Fee',
      category: 'Post-Split',
      entity: 'Brokerage Ops',
      type: 'AMOUNT',
      defaultValue: 25, // $25
      description: 'Compliance file audit and broker sign-off fee per agent split.',
      appliesTo: 'Agents Only',
      status: 'Active',
    },
  ]);

  const [newRule, setNewRule] = useState({
    name: '',
    category: 'Off-The-Top' as 'Off-The-Top' | 'Post-Split',
    entity: '',
    type: 'PERCENT' as 'PERCENT' | 'AMOUNT',
    defaultValue: 0,
    description: '',
    appliesTo: 'All Transactions' as 'All Transactions' | 'Agents Only' | 'Team Leads Only',
  });

  const formatRuleValue = (type: 'PERCENT' | 'AMOUNT', val: number) => {
    if (type === 'PERCENT') {
      return `${(val * 100).toFixed(1)}%`;
    }
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(val);
  };

  const filteredRules = rules.filter(
    (r) =>
      r.name.toLowerCase().includes(search.toLowerCase()) ||
      r.entity.toLowerCase().includes(search.toLowerCase()) ||
      r.category.toLowerCase().includes(search.toLowerCase())
  );

  const handleAddRule = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newRule.name || !newRule.entity) return;

    const created: CommissionRule = {
      id: `RULE-${Date.now().toString().slice(-3)}`,
      name: newRule.name,
      category: newRule.category,
      entity: newRule.entity,
      type: newRule.type,
      defaultValue: newRule.type === 'PERCENT' ? newRule.defaultValue / 100 : newRule.defaultValue,
      description: newRule.description || 'Custom waterfall rule.',
      appliesTo: newRule.appliesTo,
      status: 'Active',
    };

    setRules([...rules, created]);
    setIsAddModalOpen(false);
    setNewRule({
      name: '',
      category: 'Off-The-Top',
      entity: '',
      type: 'PERCENT',
      defaultValue: 0,
      description: '',
      appliesTo: 'All Transactions',
    });
  };

  const toggleRuleStatus = (id: string) => {
    setRules((prev) =>
      prev.map((r) => (r.id === id ? { ...r, status: r.status === 'Active' ? 'Inactive' : 'Active' } : r))
    );
  };

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-6">
      
      {/* Header Card */}
      <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-6 shadow-xl flex justify-between items-center transition-colors">
        <div>
          <h1 className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">
            Global Commission Rules & Waterfall Templates
          </h1>
          <p className="text-slate-500 dark:text-slate-400 text-sm mt-1">
            Configure default off-the-top deductions, post-split fees, and global compliance rules.
          </p>
        </div>

        <button
          onClick={() => setIsAddModalOpen(true)}
          className="bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-lg text-sm font-semibold shadow transition active:scale-95 flex items-center gap-2"
        >
          <span>+ Create New Rule</span>
        </button>
      </div>

      {/* Rules Table Section */}
      <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-6 shadow-xl space-y-4 transition-colors">
        <div className="flex justify-between items-center gap-4">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search rules by name, category, or entity..."
            className="w-full md:w-80 bg-slate-100 dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg px-3.5 py-2 text-sm text-slate-900 dark:text-white focus:outline-none focus:border-emerald-500"
          />
          <span className="text-xs text-slate-500 dark:text-slate-400 font-bold">
            {filteredRules.length} System Rules Configured
          </span>
        </div>

        <div className="overflow-x-auto border border-slate-200 dark:border-slate-700 rounded-lg">
          <table className="w-full text-left text-xs divide-y divide-slate-200 dark:divide-slate-700">
            <thead className="bg-slate-50 dark:bg-slate-900/80 text-slate-500 dark:text-slate-400 font-bold uppercase tracking-wider">
              <tr>
                <th className="p-3.5">Rule Name & Details</th>
                <th className="p-3.5">Waterfall Stage</th>
                <th className="p-3.5">Target Entity</th>
                <th className="p-3.5">Default Value</th>
                <th className="p-3.5">Applies To</th>
                <th className="p-3.5 text-right">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 dark:divide-slate-800 font-medium">
              {filteredRules.map((rule) => (
                <tr key={rule.id} className="hover:bg-slate-100/50 dark:hover:bg-slate-800/50 transition">
                  <td className="p-3.5">
                    <div className="font-bold text-slate-900 dark:text-white">{rule.name}</div>
                    <div className="text-[11px] text-slate-500 dark:text-slate-400">{rule.description}</div>
                  </td>
                  <td className="p-3.5">
                    <span
                      className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                        rule.category === 'Off-The-Top'
                          ? 'bg-amber-500/10 text-amber-700 dark:text-amber-400 border border-amber-500/30'
                          : 'bg-indigo-500/10 text-indigo-700 dark:text-indigo-400 border border-indigo-500/30'
                      }`}
                    >
                      {rule.category}
                    </span>
                  </td>
                  <td className="p-3.5 text-slate-800 dark:text-slate-200 font-semibold">
                    {rule.entity}
                  </td>
                  <td className="p-3.5 text-emerald-600 dark:text-emerald-400 font-bold text-sm">
                    {formatRuleValue(rule.type, rule.defaultValue)}
                  </td>
                  <td className="p-3.5 text-slate-500 dark:text-slate-400">
                    {rule.appliesTo}
                  </td>
                  <td className="p-3.5 text-right">
                    <button
                      onClick={() => toggleRuleStatus(rule.id)}
                      className={`px-2.5 py-1 rounded-full text-[10px] font-bold border transition ${
                        rule.status === 'Active'
                          ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30'
                          : 'bg-slate-200 dark:bg-slate-700 text-slate-500 border-slate-300 dark:border-slate-600'
                      }`}
                    >
                      {rule.status}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal: Add Rule */}
      {isAddModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex justify-center items-center p-4">
          <form
            onSubmit={handleAddRule}
            className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 w-full max-w-lg rounded-xl p-6 shadow-2xl space-y-4"
          >
            <div className="flex justify-between items-center border-b border-slate-200 dark:border-slate-700 pb-3">
              <h3 className="text-lg font-bold text-emerald-600 dark:text-emerald-400">
                ⚙️ Add Commission Rule
              </h3>
              <button
                type="button"
                onClick={() => setIsAddModalOpen(false)}
                className="text-slate-400 hover:text-slate-900 dark:hover:text-white font-bold"
              >
                ✕
              </button>
            </div>

            <div className="space-y-3">
              <div>
                <label className="text-xs text-slate-500 dark:text-slate-400 block mb-1">Rule Name (*)</label>
                <input
                  type="text"
                  required
                  value={newRule.name}
                  onChange={(e) => setNewRule({ ...newRule, name: e.target.value })}
                  placeholder="e.g. Franchise Royalty Fee"
                  className="w-full bg-slate-100 dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-900 dark:text-white focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-slate-500 dark:text-slate-400 block mb-1">Waterfall Stage</label>
                  <select
                    value={newRule.category}
                    onChange={(e) => setNewRule({ ...newRule, category: e.target.value as any })}
                    className="w-full bg-slate-100 dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-900 dark:text-white focus:outline-none focus:border-emerald-500"
                  >
                    <option value="Off-The-Top">Off-The-Top</option>
                    <option value="Post-Split">Post-Split</option>
                  </select>
                </div>

                <div>
                  <label className="text-xs text-slate-500 dark:text-slate-400 block mb-1">Target Entity (*)</label>
                  <input
                    type="text"
                    required
                    value={newRule.entity}
                    onChange={(e) => setNewRule({ ...newRule, entity: e.target.value })}
                    placeholder="e.g. Corporate HQ"
                    className="w-full bg-slate-100 dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-900 dark:text-white focus:outline-none focus:border-emerald-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-slate-500 dark:text-slate-400 block mb-1">Calculation Type</label>
                  <select
                    value={newRule.type}
                    onChange={(e) => setNewRule({ ...newRule, type: e.target.value as any })}
                    className="w-full bg-slate-100 dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-900 dark:text-white focus:outline-none focus:border-emerald-500"
                  >
                    <option value="PERCENT">Percentage (%)</option>
                    <option value="AMOUNT">Flat Amount ($)</option>
                  </select>
                </div>

                <div>
                  <label className="text-xs text-slate-500 dark:text-slate-400 block mb-1">
                    Default Value ({newRule.type === 'PERCENT' ? '%' : '$'})
                  </label>
                  <input
                    type="number"
                    step="any"
                    required
                    value={newRule.defaultValue}
                    onChange={(e) => setNewRule({ ...newRule, defaultValue: Number(e.target.value) })}
                    className="w-full bg-slate-100 dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-900 dark:text-white focus:outline-none focus:border-emerald-500"
                  />
                </div>
              </div>

              <div>
                <label className="text-xs text-slate-500 dark:text-slate-400 block mb-1">Description</label>
                <textarea
                  rows={2}
                  value={newRule.description}
                  onChange={(e) => setNewRule({ ...newRule, description: e.target.value })}
                  placeholder="Explain when and how this rule applies..."
                  className="w-full bg-slate-100 dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-900 dark:text-white focus:outline-none focus:border-emerald-500 resize-none"
                />
              </div>
            </div>

            <div className="pt-3 border-t border-slate-200 dark:border-slate-700 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setIsAddModalOpen(false)}
                className="px-4 py-2 rounded-lg text-xs font-semibold text-slate-500 hover:text-slate-900 dark:hover:text-white"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-lg text-xs font-bold"
              >
                Save Rule Definition
              </button>
            </div>
          </form>
        </div>
      )}

    </div>
  );
}