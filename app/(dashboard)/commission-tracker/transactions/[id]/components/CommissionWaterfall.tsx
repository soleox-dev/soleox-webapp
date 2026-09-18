// app/commission-tracker/transactions/[id]/components/CommissionWaterfall.tsx
import React, { useState } from 'react';
import { AgentConfig, DynamicRule, CommissionEntityOption } from '../types';
import { DecimalInput } from './DecimalInput';

interface CommissionWaterfallProps {
  isCollapsed: boolean;
  onToggleSection: () => void;
  salesPrice: number;
  setSalesPrice: (val: number) => void;
  gciPerc: number;
  setGciPerc: (val: number) => void;
  agents: AgentConfig[];
  onOpenAddAgentModal: () => void;
  onRemoveAgent: (name: string) => void;
  onToggleAgentSplitType: (id: string) => void;
  onSplitValueChange: (id: string, val: number) => void;
  dealResult: any;
  offTheTopRules: DynamicRule[];
  onAddOffTopRule?: (rule: DynamicRule) => void;
  onDeleteOffTopRule: (id: string) => void;
  onToggleOffTopRuleType: (id: string) => void;
  onUpdateOffTopRuleValue: (id: string, val: number) => void;
  postSplitRulesByAgent: Record<string, DynamicRule[]>;
  onAddAgentPostSplitRule?: (agentName: string, rule: DynamicRule) => void;
  onDeleteAgentPostSplitRule: (agentName: string, ruleId: string) => void;
  onToggleAgentPostSplitType: (agentName: string, ruleId: string) => void;
  onUpdateAgentPostSplitValue: (agentName: string, ruleId: string, val: number) => void;
  knownEntities?: CommissionEntityOption[];
  preventMinus: (e: React.KeyboardEvent<HTMLInputElement>) => void;
  formatNumberWithCommas: (val: number | string) => string;
}

export function CommissionWaterfall({
  isCollapsed,
  onToggleSection,
  salesPrice,
  setSalesPrice,
  gciPerc,
  setGciPerc,
  agents,
  onOpenAddAgentModal,
  onRemoveAgent,
  onToggleAgentSplitType,
  onSplitValueChange,
  dealResult,
  offTheTopRules,
  onAddOffTopRule,
  onDeleteOffTopRule,
  onToggleOffTopRuleType,
  onUpdateOffTopRuleValue,
  postSplitRulesByAgent,
  onAddAgentPostSplitRule,
  onDeleteAgentPostSplitRule,
  onToggleAgentPostSplitType,
  onUpdateAgentPostSplitValue,
  knownEntities = [],
  preventMinus,
  formatNumberWithCommas,
}: CommissionWaterfallProps) {
  const formatCurrency = (val: number) =>
    new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(val);

  const totalOffTheTop = dealResult.offTheTopItems.reduce((acc: number, i: any) => acc + i.amount, 0);
  const commissionAfterOffTop = dealResult.grossCommission - totalOffTheTop;
  const agentNames = agents.map((a) => a.name);

  // New Off-the-Top Inline Form State
  const [isAddingOffTop, setIsAddingOffTop] = useState(false);
  const [newOffTopName, setNewOffTopName] = useState('');
  const [newOffTopEntity, setNewOffTopEntity] = useState('');
  const [newOffTopType, setNewOffTopType] = useState<'PERCENT' | 'AMOUNT'>('PERCENT');
  const [newOffTopValue, setNewOffTopValue] = useState<number>(0.1);

  // New Post-Split Inline Form State
  const [addingPostSplitForAgent, setAddingPostSplitForAgent] = useState<string | null>(null);
  const [newPostSplitName, setNewPostSplitName] = useState('');
  const [newPostSplitEntity, setNewPostSplitEntity] = useState('');
  const [newPostSplitType, setNewPostSplitType] = useState<'PERCENT' | 'AMOUNT'>('AMOUNT');
  const [newPostSplitValue, setNewPostSplitValue] = useState<number>(50);

  const handleSaveOffTop = () => {
    if (!newOffTopName.trim()) return;
    const rule: DynamicRule = {
      id: `offtop_${Date.now()}`,
      name: newOffTopName.trim(),
      entity: newOffTopEntity.trim() || 'Brokerage',
      type: newOffTopType,
      value: newOffTopValue,
    };
    if (onAddOffTopRule) onAddOffTopRule(rule);
    setNewOffTopName('');
    setNewOffTopEntity('');
    setNewOffTopValue(0.1);
    setIsAddingOffTop(false);
  };

  const handleSavePostSplit = (agentName: string) => {
    if (!newPostSplitName.trim()) return;
    const rule: DynamicRule = {
      id: `postsplit_${Date.now()}`,
      name: newPostSplitName.trim(),
      entity: newPostSplitEntity.trim() || 'Brokerage',
      type: newPostSplitType,
      value: newPostSplitValue,
    };
    if (onAddAgentPostSplitRule) onAddAgentPostSplitRule(agentName, rule);
    setNewPostSplitName('');
    setNewPostSplitEntity('');
    setNewPostSplitValue(50);
    setAddingPostSplitForAgent(null);
  };

  return (
    <section id="commission" className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl shadow-xl overflow-hidden scroll-mt-8 transition-colors">
      <div className="bg-slate-50 dark:bg-slate-800 px-6 py-4 border-b border-slate-200 dark:border-slate-700 flex justify-between items-center">
        <div className="flex items-center gap-3">
          <span className="text-lg">⚙️</span>
          <h2 className="text-lg font-semibold text-slate-900 dark:text-white">2. Commission Waterfall Engine</h2>
        </div>

        <button
          onClick={onToggleSection}
          className="w-7 h-7 rounded-lg bg-slate-100 dark:bg-slate-900 border border-slate-300 dark:border-slate-700 hover:bg-slate-200 dark:hover:bg-slate-700 flex items-center justify-center text-slate-700 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white font-bold transition text-base leading-none cursor-pointer"
          title={isCollapsed ? 'Expand Section' : 'Collapse Section'}
        >
          {isCollapsed ? '+' : '−'}
        </button>
      </div>

      {!isCollapsed && (
        <div className="p-6 grid grid-cols-1 lg:grid-cols-12 gap-6">
          <div className="lg:col-span-5 bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-700 rounded-xl p-5 space-y-6">
            <div className="flex justify-between items-center border-b border-slate-200 dark:border-slate-700 pb-3">
              <h3 className="text-sm font-bold text-slate-900 dark:text-white uppercase tracking-wider">🎛️ Input Parameters</h3>
              <button
                onClick={onOpenAddAgentModal}
                className="text-xs bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-700 dark:text-emerald-400 border border-emerald-500/40 px-2.5 py-1 rounded-lg font-semibold transition cursor-pointer"
              >
                + Add Agent
              </button>
            </div>

            <div className="space-y-3">
              <span className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider block">
                Deal Essentials
              </span>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-slate-500 dark:text-slate-400 block mb-1">
                    Sales Price ($) <span className="text-rose-500 font-bold">*</span>
                  </label>
                  <DecimalInput
                    value={salesPrice}
                    onChange={setSalesPrice}
                    useCommas={true}
                    onKeyDown={preventMinus}
                    className="w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-900 dark:text-white focus:outline-none focus:border-emerald-500 font-medium"
                  />
                </div>
                <div>
                  <label className="text-xs text-slate-500 dark:text-slate-400 block mb-1">
                    GCI Rate (%) <span className="text-rose-500 font-bold">*</span>
                  </label>
                  <DecimalInput
                    value={gciPerc}
                    onChange={setGciPerc}
                    isPercent={true}
                    onKeyDown={preventMinus}
                    className="w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-900 dark:text-white focus:outline-none focus:border-emerald-500 font-medium"
                  />
                </div>
              </div>
            </div>

            <div className="space-y-4 pt-3 border-t border-slate-200 dark:border-slate-700">
              <span className="text-xs font-bold text-emerald-700 dark:text-emerald-400 uppercase tracking-wider block">
                Agents & Split Breakdown
              </span>

              {agents.map((agent, index) => {
                const computedSplitItem = dealResult.agentSplitItems.find((s: any) => s.agentId === agent.id);

                return (
                  <div
                    key={agent.id}
                    className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg p-3.5 space-y-3 relative shadow-sm"
                  >
                    <div className="flex justify-between items-center">
                      <div className="flex items-center gap-2">
                        {index !== 0 && (
                          <button
                            onClick={() => onRemoveAgent(agent.name)}
                            className="text-xs text-rose-500 dark:text-rose-400 hover:text-rose-600 font-bold p-0.5 rounded hover:bg-rose-500/10 cursor-pointer"
                            title={`Delete ${agent.name}`}
                          >
                            🗑️
                          </button>
                        )}
                        <span className="text-xs font-bold text-slate-800 dark:text-slate-300">{agent.name}</span>
                        {index === 0 && (
                          <span className="text-[10px] bg-emerald-500/20 text-emerald-800 dark:text-emerald-300 border border-emerald-500/30 px-1.5 py-0.5 rounded font-semibold">
                            PRIMARY
                          </span>
                        )}
                        {agent.isTeamLead && index !== 0 && (
                          <span className="text-[10px] bg-amber-500/20 text-amber-800 dark:text-amber-300 border border-amber-500/30 px-1.5 py-0.5 rounded font-semibold">
                            LEAD
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3 items-end">
                      <div>
                        <div className="h-5 flex items-center justify-between mb-1">
                          <span className="text-xs text-slate-500 dark:text-slate-400">
                            {index === 0 ? 'Split %' : 'Agent Split'}
                          </span>
                          {index !== 0 && (
                            <button
                              onClick={() => onToggleAgentSplitType(agent.id)}
                              className="text-[10px] bg-slate-100 dark:bg-slate-800 border border-emerald-500/40 text-emerald-700 dark:text-emerald-400 hover:bg-emerald-500/20 px-1.5 py-0.5 rounded font-bold cursor-pointer"
                            >
                              {agent.splitType === 'PERCENT' ? '%' : '$'}
                            </button>
                          )}
                        </div>

                        {index === 0 ? (
                          <div className="bg-slate-100 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg px-3 py-2 text-sm font-semibold text-emerald-700 dark:text-emerald-400 h-[38px] flex items-center">
                            {((computedSplitItem?.percent || 0) * 100).toFixed(1)}%
                          </div>
                        ) : (
                          <div className="relative">
                            <DecimalInput
                              value={agent.splitVal}
                              onChange={(val) => onSplitValueChange(agent.id, val)}
                              isPercent={agent.splitType === 'PERCENT'}
                              useCommas={agent.splitType === 'AMOUNT'}
                              onKeyDown={preventMinus}
                              className="w-full border rounded-lg px-3 py-2 text-sm text-slate-900 dark:text-white focus:outline-none font-medium bg-white dark:bg-slate-900 border-slate-300 dark:border-slate-700 focus:border-emerald-500 pr-10 h-[38px]"
                            />
                            <span className="absolute right-2.5 top-2.5 text-xs text-slate-400 dark:text-slate-500 pointer-events-none">
                              {agent.splitType === 'PERCENT' ? '%' : 'USD'}
                            </span>
                          </div>
                        )}
                      </div>

                      <div>
                        <div className="h-5 flex items-center justify-between mb-1">
                          <span className="text-xs text-slate-500 dark:text-slate-400">Cap YTD</span>
                          <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-semibold">🗄️ DB</span>
                        </div>
                        <div className="bg-slate-100 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg px-3 py-2 text-xs font-semibold text-slate-700 dark:text-slate-300 h-[38px] flex items-center truncate">
                          {formatCurrency(agent.brokerCapPaidYTD)} / ${formatNumberWithCommas(agent.brokerCapLimit)}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="lg:col-span-7 bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-700 rounded-xl p-5 space-y-6">
            <div className="flex justify-between items-center border-b border-slate-200 dark:border-slate-700 pb-3">
              <h3 className="text-sm font-bold text-slate-900 dark:text-white uppercase tracking-wider">📊 Waterfall Execution Results</h3>
              <div className="text-right">
                <span className="text-[11px] text-slate-500 dark:text-slate-400">Gross Commission</span>
                <p className="text-base font-bold text-emerald-600 dark:text-emerald-400">{formatCurrency(dealResult.grossCommission)}</p>
              </div>
            </div>

            <div className="space-y-4">
              <div className="border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-900 p-3 space-y-2 shadow-sm">
                <div className="flex justify-between items-center border-b border-slate-200 dark:border-slate-700 pb-2">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold uppercase text-slate-800 dark:text-slate-300">1. Off-The-Top Deductions</span>
                    <button
                      type="button"
                      onClick={() => setIsAddingOffTop(true)}
                      className="text-[10px] bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-700 dark:text-emerald-400 border border-emerald-500/30 px-1.5 py-0.5 rounded font-bold cursor-pointer transition"
                      title="Add Off-The-Top deduction"
                    >
                      + Add
                    </button>
                  </div>
                  <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-semibold">Net: {formatCurrency(commissionAfterOffTop)}</span>
                </div>

                {isAddingOffTop && (
                  <div className="bg-slate-50 dark:bg-slate-800/80 p-2.5 rounded-lg border border-emerald-500/30 space-y-2 mb-2">
                    <span className="text-[11px] font-bold text-emerald-700 dark:text-emerald-400 block">Add Off-The-Top Deduction</span>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      <input
                        type="text"
                        placeholder="Rule Name (e.g. TC Fee, Referral)"
                        value={newOffTopName}
                        onChange={(e) => setNewOffTopName(e.target.value)}
                        className="bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded px-2 py-1 text-xs text-slate-900 dark:text-white focus:outline-none focus:border-emerald-500 font-medium"
                      />
                      {knownEntities.length > 0 ? (
                        <select
                          value={newOffTopEntity}
                          onChange={(e) => setNewOffTopEntity(e.target.value)}
                          className="bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded px-2 py-1 text-xs text-slate-900 dark:text-white focus:outline-none focus:border-emerald-500 font-medium"
                        >
                          <option value="">Select Payee Entity...</option>
                          {knownEntities.map((ent) => (
                            <option key={ent.id} value={ent.name}>{ent.name}</option>
                          ))}
                        </select>
                      ) : (
                        <input
                          type="text"
                          placeholder="Payee Entity (e.g. Soleox Realty)"
                          value={newOffTopEntity}
                          onChange={(e) => setNewOffTopEntity(e.target.value)}
                          className="bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded px-2 py-1 text-xs text-slate-900 dark:text-white focus:outline-none focus:border-emerald-500 font-medium"
                        />
                      )}
                    </div>
                    <div className="flex items-center justify-between pt-1">
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => setNewOffTopType((p) => p === 'PERCENT' ? 'AMOUNT' : 'PERCENT')}
                          className="bg-white dark:bg-slate-900 text-emerald-600 dark:text-emerald-400 border border-slate-300 dark:border-slate-700 px-2 py-0.5 rounded font-bold text-xs cursor-pointer"
                        >
                          {newOffTopType === 'PERCENT' ? '% Rate' : '$ Amount'}
                        </button>
                        <DecimalInput
                          value={newOffTopValue}
                          onChange={setNewOffTopValue}
                          isPercent={newOffTopType === 'PERCENT'}
                          useCommas={newOffTopType === 'AMOUNT'}
                          onKeyDown={preventMinus}
                          className="w-20 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded px-2 py-1 text-xs text-slate-900 dark:text-white text-right focus:outline-none focus:border-emerald-500 font-medium"
                        />
                      </div>
                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => setIsAddingOffTop(false)}
                          className="text-xs px-2 py-1 text-slate-500 dark:text-slate-400 hover:text-slate-700 cursor-pointer"
                        >
                          Cancel
                        </button>
                        <button
                          type="button"
                          onClick={handleSaveOffTop}
                          className="text-xs bg-emerald-600 hover:bg-emerald-700 text-white px-2.5 py-1 rounded font-semibold cursor-pointer shadow-sm"
                        >
                          Save
                        </button>
                      </div>
                    </div>
                  </div>
                )}

                {offTheTopRules.length === 0 && !isAddingOffTop && (
                  <p className="text-[11px] text-slate-400 italic py-1">No off-the-top deductions applied to this transaction.</p>
                )}

                {offTheTopRules.map((rule) => {
                  const calculatedItem = dealResult.offTheTopItems.find((i: any) => i.id === rule.id);
                  return (
                    <div key={rule.id} className="flex justify-between items-center text-xs text-slate-700 dark:text-slate-300">
                      <div className="flex items-center gap-2">
                        <button onClick={() => onDeleteOffTopRule(rule.id)} className="text-rose-500 font-bold cursor-pointer" title="Delete rule">🗑️</button>
                        <button onClick={() => onToggleOffTopRuleType(rule.id)} className="bg-slate-100 dark:bg-slate-800 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30 px-1.5 py-0.5 rounded font-bold text-[10px] cursor-pointer" title="Toggle % / $">
                          {rule.type === 'PERCENT' ? '%' : '$'}
                        </button>
                        <span>{rule.name}:</span>
                        <DecimalInput
                          value={rule.value}
                          onChange={(val) => onUpdateOffTopRuleValue(rule.id, val)}
                          isPercent={rule.type === 'PERCENT'}
                          useCommas={rule.type === 'AMOUNT'}
                          onKeyDown={preventMinus}
                          className="w-16 bg-slate-100 dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded px-1.5 py-0.5 text-xs text-slate-900 dark:text-white text-right focus:outline-none focus:border-emerald-500 font-medium"
                        />
                      </div>
                      <span>-{formatCurrency(calculatedItem?.amount || 0)}</span>
                    </div>
                  );
                })}
              </div>

              <div className="border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-900 p-3 space-y-2 shadow-sm">
                <div className="border-b border-slate-200 dark:border-slate-700 pb-2">
                  <span className="text-xs font-bold uppercase text-slate-800 dark:text-slate-300">2. Agent Splits Breakdown</span>
                </div>
                {dealResult.agentSplitItems.length === 0 ? (
                  <p className="text-[11px] text-slate-400 italic py-1">No agents assigned yet. Click "+ Add Agent" to assign a split.</p>
                ) : (
                  dealResult.agentSplitItems.map((item: any) => (
                    <div key={item.agentId} className="flex justify-between items-center text-xs text-slate-700 dark:text-slate-300">
                      <span className="font-medium text-slate-900 dark:text-white">{item.agentName} ({(item.percent * 100).toFixed(1)}% Split)</span>
                      <span className="font-bold text-emerald-600 dark:text-emerald-400">{formatCurrency(item.amount)}</span>
                    </div>
                  ))
                )}
              </div>

              <div className="border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-900 p-3 space-y-3 shadow-sm">
                <div className="border-b border-slate-200 dark:border-slate-700 pb-2">
                  <span className="text-xs font-bold uppercase text-slate-800 dark:text-slate-300">3. Post-Split Deductions Per Agent</span>
                </div>
                {agentNames.length === 0 ? (
                  <p className="text-[11px] text-slate-400 italic py-1">Assign an agent to configure post-split deductions.</p>
                ) : (
                  agentNames.map((agentName) => {
                    const agentRules = postSplitRulesByAgent[agentName] || [];
                    const itemsForAgent = dealResult.postSplitItems.filter((i: any) => i.agentName === agentName);
                    const isAddingForThisAgent = addingPostSplitForAgent === agentName;

                    return (
                      <div key={agentName} className="bg-slate-100 dark:bg-slate-800 p-2.5 rounded border border-slate-200 dark:border-slate-700 space-y-1.5">
                        <div className="flex justify-between items-center">
                          <span className="text-xs font-semibold text-emerald-700 dark:text-emerald-400 block">{agentName}</span>
                          <button
                            type="button"
                            onClick={() => setAddingPostSplitForAgent(isAddingForThisAgent ? null : agentName)}
                            className="text-[10px] text-emerald-600 dark:text-emerald-400 hover:underline font-bold cursor-pointer"
                          >
                            {isAddingForThisAgent ? 'Cancel' : '+ Add Rule'}
                          </button>
                        </div>

                        {isAddingForThisAgent && (
                          <div className="bg-white dark:bg-slate-900 p-2 rounded border border-emerald-500/30 space-y-2 mb-2">
                            <span className="text-[10px] font-bold text-slate-700 dark:text-slate-300 block">New Deduction for {agentName}</span>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                              <input
                                type="text"
                                placeholder="Rule Name (e.g. Risk Mgmt)"
                                value={newPostSplitName}
                                onChange={(e) => setNewPostSplitName(e.target.value)}
                                className="bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded px-2 py-0.5 text-[11px] text-slate-900 dark:text-white focus:outline-none focus:border-emerald-500"
                              />
                              {knownEntities.length > 0 ? (
                                <select
                                  value={newPostSplitEntity}
                                  onChange={(e) => setNewPostSplitEntity(e.target.value)}
                                  className="bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded px-2 py-0.5 text-[11px] text-slate-900 dark:text-white focus:outline-none focus:border-emerald-500"
                                >
                                  <option value="">Select Payee Entity...</option>
                                  {knownEntities.map((ent) => (
                                    <option key={ent.id} value={ent.name}>{ent.name}</option>
                                  ))}
                                </select>
                              ) : (
                                <input
                                  type="text"
                                  placeholder="Payee (e.g. Soleox Realty)"
                                  value={newPostSplitEntity}
                                  onChange={(e) => setNewPostSplitEntity(e.target.value)}
                                  className="bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded px-2 py-0.5 text-[11px] text-slate-900 dark:text-white focus:outline-none focus:border-emerald-500"
                                />
                              )}
                            </div>
                            <div className="flex items-center justify-between pt-1">
                              <div className="flex items-center gap-1.5">
                                <button
                                  type="button"
                                  onClick={() => setNewPostSplitType((p) => p === 'PERCENT' ? 'AMOUNT' : 'PERCENT')}
                                  className="bg-slate-100 dark:bg-slate-800 text-emerald-600 dark:text-emerald-400 border border-slate-300 dark:border-slate-700 px-1.5 py-0.5 rounded font-bold text-[10px] cursor-pointer"
                                >
                                  {newPostSplitType === 'PERCENT' ? '%' : '$'}
                                </button>
                                <DecimalInput
                                  value={newPostSplitValue}
                                  onChange={setNewPostSplitValue}
                                  isPercent={newPostSplitType === 'PERCENT'}
                                  useCommas={newPostSplitType === 'AMOUNT'}
                                  onKeyDown={preventMinus}
                                  className="w-16 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded px-1.5 py-0.5 text-[11px] text-slate-900 dark:text-white text-right focus:outline-none focus:border-emerald-500"
                                />
                              </div>
                              <button
                                type="button"
                                onClick={() => handleSavePostSplit(agentName)}
                                className="text-[10px] bg-emerald-600 hover:bg-emerald-700 text-white px-2 py-0.5 rounded font-semibold cursor-pointer shadow-sm"
                              >
                                Save Rule
                              </button>
                            </div>
                          </div>
                        )}

                        {agentRules.length === 0 && !isAddingForThisAgent && (
                          <p className="text-[10px] text-slate-400 italic">No post-split deductions configured for this agent.</p>
                        )}

                        {agentRules.map((rule) => {
                          const calculatedItem = itemsForAgent.find((i: any) => i.id === rule.id);
                          return (
                            <div key={rule.id} className="flex justify-between items-center text-[11px] text-slate-700 dark:text-slate-300">
                              <div className="flex items-center gap-1.5">
                                <button onClick={() => onDeleteAgentPostSplitRule(agentName, rule.id)} className="text-rose-500 cursor-pointer" title="Delete rule">🗑️</button>
                                <button onClick={() => onToggleAgentPostSplitType(agentName, rule.id)} className="bg-white dark:bg-slate-900 text-emerald-600 dark:text-emerald-400 text-[9px] px-1 rounded border border-slate-200 dark:border-slate-700 cursor-pointer" title="Toggle % / $">
                                  {rule.type === 'PERCENT' ? '%' : '$'}
                                </button>
                                <span>{rule.name}:</span>
                                <DecimalInput
                                  value={rule.value}
                                  onChange={(val) => onUpdateAgentPostSplitValue(agentName, rule.id, val)}
                                  isPercent={rule.type === 'PERCENT'}
                                  useCommas={rule.type === 'AMOUNT'}
                                  onKeyDown={preventMinus}
                                  className="w-14 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded px-1 py-0.5 text-[11px] text-slate-900 dark:text-white text-right font-medium"
                                />
                              </div>
                              <span>-{formatCurrency(calculatedItem?.amount || 0)}</span>
                            </div>
                          );
                        })}
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}