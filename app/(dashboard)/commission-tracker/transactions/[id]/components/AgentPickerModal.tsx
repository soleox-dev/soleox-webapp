import React from 'react';
import { KnownAgentInfo } from '../types';

interface AgentPickerModalProps {
  isOpen: boolean;
  onClose: () => void;
  searchQuery: string;
  setSearchQuery: (query: string) => void;
  availableAgents: KnownAgentInfo[];
  onConfirmAddAgent: (agent: KnownAgentInfo) => void;
}

export function AgentPickerModal({
  isOpen,
  onClose,
  searchQuery,
  setSearchQuery,
  availableAgents,
  onConfirmAddAgent,
}: AgentPickerModalProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex justify-center items-center p-4">
      <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 w-full max-w-md rounded-xl p-6 shadow-2xl space-y-4">
        <div className="flex justify-between items-center border-b border-slate-200 dark:border-slate-700 pb-3">
          <h3 className="text-lg font-bold text-emerald-600 dark:text-emerald-400">👤 Select Agent to Add</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-900 dark:hover:text-white font-bold cursor-pointer">✕</button>
        </div>

        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search agent name (e.g. Haslem, Alfred)..."
          className="w-full bg-slate-100 dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg px-3.5 py-2 text-sm text-slate-900 dark:text-white focus:outline-none focus:border-emerald-500 font-medium"
        />

        <div className="max-h-60 overflow-y-auto divide-y divide-slate-200 dark:divide-slate-700 border border-slate-300 dark:border-slate-700 rounded-lg bg-slate-50 dark:bg-slate-900">
          {availableAgents.length === 0 ? (
            <div className="p-3 text-xs text-slate-500 dark:text-slate-400 text-center">No available agents found</div>
          ) : (
            availableAgents.map((agentObj) => (
              <button
                key={agentObj.name}
                onClick={() => onConfirmAddAgent(agentObj)}
                className="w-full text-left p-3 text-xs text-slate-800 dark:text-slate-200 hover:bg-emerald-500/20 hover:text-emerald-700 dark:hover:text-emerald-300 font-semibold transition flex justify-between items-center cursor-pointer"
              >
                <div className="flex items-center gap-2">
                  <span>{agentObj.name}</span>
                  {agentObj.isTeamLead && (
                    <span className="text-[10px] bg-amber-500/20 text-amber-800 dark:text-amber-300 border border-amber-500/30 px-1.5 py-0.5 rounded font-semibold">
                      TEAM LEAD
                    </span>
                  )}
                </div>
                <span className="text-[10px] text-emerald-600 dark:text-emerald-400 uppercase font-semibold">+ Select</span>
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  );
}