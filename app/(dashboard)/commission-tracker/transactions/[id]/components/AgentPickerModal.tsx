'use client';

import React, { useState, useEffect } from 'react';
import { KnownAgentInfo } from '../types';

interface AgentPickerModalProps {
  isOpen: boolean;
  onClose: () => void;
  searchQuery: string;
  setSearchQuery: (query: string) => void;
  availableAgents: KnownAgentInfo[];
  primaryAgentName?: string;
  commissionAfterOffTop?: number;
  onConfirmAddAgent: (
    agent: KnownAgentInfo,
    splitType: 'PERCENT' | 'AMOUNT',
    splitVal: number
  ) => void;
}

export function AgentPickerModal({
  isOpen,
  onClose,
  searchQuery,
  setSearchQuery,
  availableAgents,
  primaryAgentName = 'Primary Agent',
  commissionAfterOffTop = 0,
  onConfirmAddAgent,
}: AgentPickerModalProps) {
  const [selectedAgent, setSelectedAgent] = useState<KnownAgentInfo | null>(null);
  const [splitType, setSplitType] = useState<'PERCENT' | 'AMOUNT'>('PERCENT');
  const [splitValStr, setSplitValStr] = useState<string>('');
  const [errorMsg, setErrorMsg] = useState<string>('');

  useEffect(() => {
    if (isOpen) {
      setSelectedAgent(null);
      setSplitType('PERCENT');
      setSplitValStr('');
      setErrorMsg('');
      setSearchQuery('');
    }
  }, [isOpen, setSearchQuery]);

  if (!isOpen) return null;

  const formatCurrency = (val: number) =>
    new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(val);

  const numericVal = parseFloat(splitValStr) || 0;

  const handleConfirm = () => {
    if (!selectedAgent) {
      setErrorMsg('Please select an agent first.');
      return;
    }
    if (numericVal <= 0) {
      setErrorMsg('Please enter a valid split value greater than 0.');
      return;
    }

    if (splitType === 'PERCENT') {
      const rate = numericVal > 1 ? numericVal / 100 : numericVal;
      if (rate >= 1) {
        setErrorMsg('Split percentage must be less than 100%.');
        return;
      }
      onConfirmAddAgent(selectedAgent, 'PERCENT', rate);
    } else {
      if (commissionAfterOffTop > 0 && numericVal >= commissionAfterOffTop) {
        setErrorMsg(`Split amount must be less than net commission (${formatCurrency(commissionAfterOffTop)}).`);
        return;
      }
      onConfirmAddAgent(selectedAgent, 'AMOUNT', numericVal);
    }

    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex justify-center items-center p-4">
      <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 w-full max-w-lg rounded-xl p-6 shadow-2xl space-y-4">
        <div className="flex justify-between items-center border-b border-slate-200 dark:border-slate-700 pb-3">
          <div className="flex items-center gap-2">
            <span className="text-xl">👤</span>
            <h3 className="text-base font-bold text-slate-900 dark:text-white">Add Agent to Deal</h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-slate-400 hover:text-slate-900 dark:hover:text-white font-bold cursor-pointer transition text-lg"
          >
            ✕
          </button>
        </div>

        {/* Step 1: Agent Selection */}
        <div className="space-y-2">
          <label className="text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider block">
            1. Select Agent
          </label>
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search roster by agent name..."
            className="w-full bg-slate-100 dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg px-3.5 py-2 text-xs text-slate-900 dark:text-white focus:outline-none focus:border-emerald-500 font-medium placeholder-slate-400"
          />

          <div className="max-h-40 overflow-y-auto divide-y divide-slate-200 dark:divide-slate-700/60 border border-slate-300 dark:border-slate-700 rounded-lg bg-slate-50 dark:bg-slate-900/60">
            {availableAgents.length === 0 ? (
              <div className="p-3 text-xs text-slate-500 dark:text-slate-400 text-center italic">
                No matching agents available to add
              </div>
            ) : (
              availableAgents.map((agentObj) => {
                const isSelected = selectedAgent?.name === agentObj.name;
                return (
                  <button
                    key={agentObj.name}
                    type="button"
                    onClick={() => {
                      setSelectedAgent(agentObj);
                      setErrorMsg('');
                    }}
                    className={`w-full text-left p-2.5 text-xs font-semibold transition flex justify-between items-center cursor-pointer ${
                      isSelected
                        ? 'bg-emerald-500/15 text-emerald-800 dark:text-emerald-300 border-l-4 border-emerald-500'
                        : 'text-slate-800 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <span>{agentObj.name}</span>
                      {agentObj.isTeamLead && (
                        <span className="text-[10px] bg-amber-500/20 text-amber-800 dark:text-amber-300 border border-amber-500/30 px-1.5 py-0.2 rounded font-semibold">
                          LEAD
                        </span>
                      )}
                    </div>
                    {isSelected ? (
                      <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-bold">✓ Selected</span>
                    ) : (
                      <span className="text-[10px] text-slate-400 hover:text-emerald-500 font-medium">+ Choose</span>
                    )}
                  </button>
                );
              })
            )}
          </div>
        </div>

        {/* Step 2: Split Type & Value */}
        <div className="space-y-3 pt-2 border-t border-slate-200 dark:border-slate-700">
          <label className="text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider block">
            2. Choose Split Type & Enter Value
          </label>

          {/* Toggle buttons between Percent and Amount */}
          <div className="grid grid-cols-2 gap-2 bg-slate-100 dark:bg-slate-900 p-1 rounded-lg border border-slate-200 dark:border-slate-700">
            <button
              type="button"
              onClick={() => {
                setSplitType('PERCENT');
                setErrorMsg('');
              }}
              className={`py-2 text-xs font-bold rounded-md transition flex items-center justify-center gap-1.5 cursor-pointer ${
                splitType === 'PERCENT'
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              <span>%</span>
              <span>Percent Split</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setSplitType('AMOUNT');
                setErrorMsg('');
              }}
              className={`py-2 text-xs font-bold rounded-md transition flex items-center justify-center gap-1.5 cursor-pointer ${
                splitType === 'AMOUNT'
                  ? 'bg-emerald-600 text-white shadow-sm'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              <span>$</span>
              <span>Flat Amount Split</span>
            </button>
          </div>

          {/* Numeric Value Input */}
          <div>
            <div className="flex justify-between items-center mb-1">
              <span className="text-xs text-slate-600 dark:text-slate-400 font-medium">
                {splitType === 'PERCENT' ? 'Split Percentage (%)' : 'Split Dollar Amount ($)'}
              </span>
              {commissionAfterOffTop > 0 && numericVal > 0 && (
                <span className={`text-[11px] font-semibold ${
                  splitType === 'PERCENT' ? 'text-blue-600 dark:text-blue-400' : 'text-emerald-600 dark:text-emerald-400'
                }`}>
                  {splitType === 'PERCENT'
                    ? `≈ ${formatCurrency(commissionAfterOffTop * (numericVal > 1 ? numericVal / 100 : numericVal))}`
                    : `≈ ${((numericVal / commissionAfterOffTop) * 100).toFixed(1)}% of net commission`}
                </span>
              )}
            </div>

            <div className="relative">
              <input
                type="number"
                step="any"
                min="0"
                value={splitValStr}
                onChange={(e) => {
                  setSplitValStr(e.target.value);
                  setErrorMsg('');
                }}
                placeholder="0.00"
                className={`w-full border rounded-lg pl-8 pr-12 py-2 text-sm focus:outline-none font-semibold placeholder-slate-400 dark:placeholder-slate-500 transition ${
                  splitType === 'PERCENT'
                    ? 'bg-blue-50/50 dark:bg-blue-950/30 border-blue-300 dark:border-blue-700/80 text-blue-600 dark:text-blue-400 focus:border-blue-500 focus:ring-1 focus:ring-blue-500/30'
                    : 'bg-emerald-50/50 dark:bg-emerald-950/30 border-emerald-300 dark:border-emerald-700/80 text-emerald-600 dark:text-emerald-400 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500/30'
                }`}
              />
              <span className={`absolute left-3 top-2.5 text-xs font-bold ${
                splitType === 'PERCENT' ? 'text-blue-500 dark:text-blue-400' : 'text-emerald-500 dark:text-emerald-400'
              }`}>
                {splitType === 'PERCENT' ? '%' : '$'}
              </span>
              <span className="absolute right-3 top-2.5 text-xs text-slate-400">
                {splitType === 'PERCENT' ? '%' : 'USD'}
              </span>
            </div>
          </div>
        </div>

        {/* Notice: Deducted from Primary Agent */}
        <div className="bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-500/30 rounded-lg p-2.5 text-xs text-emerald-800 dark:text-emerald-300 flex items-start gap-2">
          <span className="text-sm leading-none mt-0.5">💡</span>
          <div className="space-y-0.5">
            <span className="font-semibold block">Deducted from Primary Agent</span>
            <span className="text-[11px] text-slate-600 dark:text-slate-400 block">
              This split will be deducted directly from <strong>{primaryAgentName}</strong>&apos;s primary split.
            </span>
          </div>
        </div>

        {errorMsg && (
          <div className="p-2 text-xs bg-rose-500/10 border border-rose-500/30 text-rose-600 dark:text-rose-400 rounded font-medium">
            ⚠️ {errorMsg}
          </div>
        )}

        {/* Action Buttons */}
        <div className="flex justify-end items-center gap-2 pt-2 border-t border-slate-200 dark:border-slate-700">
          <button
            type="button"
            onClick={onClose}
            className="px-3.5 py-1.5 rounded-lg text-xs font-semibold text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700 transition cursor-pointer"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={!selectedAgent || numericVal <= 0}
            className={`px-4 py-1.5 rounded-lg text-xs font-bold transition shadow-sm cursor-pointer ${
              selectedAgent && numericVal > 0
                ? 'bg-emerald-600 hover:bg-emerald-500 text-white'
                : 'bg-slate-200 dark:bg-slate-700 text-slate-400 cursor-not-allowed'
            }`}
          >
            Confirm & Add Agent
          </button>
        </div>
      </div>
    </div>
  );
}
