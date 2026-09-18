'use client';

import React, { useState } from 'react';

interface ListCategory {
  id: string;
  name: string;
  code: string;
  itemCount: number;
  description: string;
  isEditable: boolean;
}

export default function ListsSettingsPage() {
  const [search, setSearch] = useState('');
  const [selectedList, setSelectedList] = useState<string | null>(null);

  const lists: ListCategory[] = [
    {
      id: 'L-01',
      name: 'Transaction Statuses',
      code: 'transaction_status',
      itemCount: 6,
      description: 'Manage lifecycle stages from Pending to Closed and Cancelled.',
      isEditable: true,
    },
    {
      id: 'L-02',
      name: 'Client Types',
      code: 'client_type',
      itemCount: 4,
      description: 'Define participant classifications like Seller, Buyer, Dual, or Landlord.',
      isEditable: true,
    },
    {
      id: 'L-03',
      name: 'Lead Sources',
      code: 'lead_source',
      itemCount: 8,
      description: 'Categorize acquisition channels (Agent-generated, Zillow, Sphere of Influence).',
      isEditable: true,
    },
    {
      id: 'L-04',
      name: 'Finance Statuses',
      code: 'finance_status',
      itemCount: 5,
      description: 'Track loan approval milestones (Cash, Pre-approved, Contingent, Funded).',
      isEditable: true,
    },
  ];

  const filteredLists = lists.filter(
    (l) =>
      l.name.toLowerCase().includes(search.toLowerCase()) ||
      l.description.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-6">
      
      {/* Header Card */}
      <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-6 shadow-xl flex justify-between items-center transition-colors">
        <div>
          <h1 className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">
            Dropdown Lists & System Categories
          </h1>
          <p className="text-slate-500 dark:text-slate-400 text-sm mt-1">
            Configure dropdown options, pipeline stages, and transaction attribute lists.
          </p>
        </div>
      </div>

      {/* Lists Table Section */}
      <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-6 shadow-xl space-y-4 transition-colors">
        <div className="flex justify-between items-center gap-4">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search system lists..."
            className="w-full md:w-80 bg-slate-100 dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg px-3.5 py-2 text-sm text-slate-900 dark:text-white focus:outline-none focus:border-emerald-500"
          />
          <span className="text-xs text-slate-500 dark:text-slate-400 font-bold">
            {filteredLists.length} Configuration Lists
          </span>
        </div>

        <div className="overflow-x-auto border border-slate-200 dark:border-slate-700 rounded-lg">
          <table className="w-full text-left text-xs divide-y divide-slate-200 dark:divide-slate-700">
            <thead className="bg-slate-50 dark:bg-slate-900/80 text-slate-500 dark:text-slate-400 font-bold uppercase tracking-wider">
              <tr>
                <th className="p-3.5">List Name & Purpose</th>
                <th className="p-3.5">Schema Code</th>
                <th className="p-3.5">Items Enrolled</th>
                <th className="p-3.5 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 dark:divide-slate-800 font-medium">
              {filteredLists.map((list) => (
                <tr key={list.id} className="hover:bg-slate-100/50 dark:hover:bg-slate-800/50 transition">
                  <td className="p-3.5">
                    <div className="font-bold text-slate-900 dark:text-white">{list.name}</div>
                    <div className="text-[11px] text-slate-500 dark:text-slate-400">{list.description}</div>
                  </td>
                  <td className="p-3.5">
                    <code className="bg-slate-100 dark:bg-slate-900 text-emerald-600 dark:text-emerald-400 px-2 py-0.5 rounded text-[11px] font-mono border border-slate-200 dark:border-slate-700">
                      {list.code}
                    </code>
                  </td>
                  <td className="p-3.5 text-slate-700 dark:text-slate-300 font-bold">
                    {list.itemCount} options
                  </td>
                  <td className="p-3.5 text-right">
                    <button
                      onClick={() => alert(`Opening editor for ${list.name}`)}
                      className="bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-700 dark:text-emerald-400 border border-emerald-500/40 px-3 py-1 rounded-lg font-semibold transition"
                    >
                      Manage Items
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

    </div>
  );
}