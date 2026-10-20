import React from 'react';
import { Search } from 'lucide-react';
import { underlineControl, underlineShell } from '@/components/ui/underline-field';
import { transactionDealLabel } from '@/lib/transaction-label';

interface SearchableTransactionPickerProps {
  searchQuery: string;
  setSearchQuery: (query: string) => void;
  isDropdownOpen: boolean;
  setIsDropdownOpen: (open: boolean) => void;
  filteredDeals: any[];
  isLoadingDeals: boolean;
  selectedDealId: string;
  onSelectDeal: (deal: any, targetId: string) => void;
  dropdownRef: React.RefObject<HTMLDivElement | null>;
}

export function SearchableTransactionPicker({
  searchQuery,
  setSearchQuery,
  isDropdownOpen,
  setIsDropdownOpen,
  filteredDeals,
  isLoadingDeals,
  selectedDealId,
  onSelectDeal,
  dropdownRef,
}: SearchableTransactionPickerProps) {
  return (
    <div className="relative flex items-center gap-3" ref={dropdownRef}>
      <Search className="h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" strokeWidth={1.75} aria-hidden />
      {isLoadingDeals && <span className="shrink-0 text-xs text-slate-500 dark:text-slate-400">Loading records...</span>}

      <div className={`relative min-w-0 flex-1 ${underlineShell}`}>
        <input
          type="text"
          aria-label="Search transactions"
          value={searchQuery}
          onFocus={(e) => {
            setIsDropdownOpen(true);
            e.target.select();
          }}
          onChange={(e) => {
            setSearchQuery(e.target.value);
            setIsDropdownOpen(true);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              setIsDropdownOpen(false);
            } else if (e.key === 'Enter' && filteredDeals.length > 0) {
              e.preventDefault();
              onSelectDeal(filteredDeals[0], filteredDeals[0].id);
              setIsDropdownOpen(false);
            }
          }}
          placeholder="Type address or ID (e.g. TXN_..., 123 Main St)..."
          className={`${underlineControl} ${searchQuery ? 'pr-7' : 'pr-1'}`}
        />

        {searchQuery && (
          <button
            type="button"
            onClick={() => {
              setSearchQuery('');
              setIsDropdownOpen(true);
            }}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 text-xs font-bold w-5 h-5 flex items-center justify-center rounded-full hover:bg-slate-200 dark:hover:bg-slate-800 transition cursor-pointer"
            title="Clear search"
          >
            ✕
          </button>
        )}

        {isDropdownOpen && (
          <div className="absolute z-50 mt-1.5 w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl shadow-2xl max-h-64 overflow-y-auto divide-y divide-slate-200 dark:divide-slate-800">
            {filteredDeals.length === 0 ? (
              <div className="p-4 text-xs text-slate-500 dark:text-slate-400 text-center italic">
                No matching transactions found for &ldquo;{searchQuery}&rdquo;
              </div>
            ) : (
              filteredDeals.map((deal) => (
                <div
                  key={deal.id}
                  onClick={() => {
                    onSelectDeal(deal, deal.id);
                    setIsDropdownOpen(false);
                  }}
                  className={`p-3 text-xs cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-800 transition flex justify-between items-center ${
                    selectedDealId === deal.id ? 'bg-emerald-500/10 border-l-4 border-emerald-500' : ''
                  }`}
                >
                  <div>
                    <span className="font-bold text-emerald-700 dark:text-emerald-400">[{deal.client_id || 'DEMO'}] {deal.id}</span>
                    <span className="text-slate-800 dark:text-slate-200 ml-2 font-medium">{transactionDealLabel(deal) || '—'}</span>
                  </div>
                  <span className="text-slate-500 dark:text-slate-400 font-semibold">
                    ${Number(deal.sales_price || 0).toLocaleString()}
                  </span>
                </div>
              ))
            )}
          </div>
        )}
      </div>
    </div>
  );
}