import React from 'react';

interface SearchableTransactionPickerProps {
  searchQuery: string;
  setSearchQuery: (query: string) => void;
  isDropdownOpen: boolean;
  setIsDropdownOpen: (open: boolean) => void;
  filteredDeals: any[];
  savedDealsCount: number;
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
  savedDealsCount,
  isLoadingDeals,
  selectedDealId,
  onSelectDeal,
  dropdownRef,
}: SearchableTransactionPickerProps) {
  return (
    <section className="bg-white dark:bg-slate-800 border border-emerald-500/40 dark:border-emerald-500/30 p-4 rounded-xl shadow-xl space-y-2 relative transition-colors" ref={dropdownRef}>
      <label className="text-xs font-bold text-emerald-700 dark:text-emerald-400 uppercase tracking-wider block flex items-center justify-between">
        <span>
          🔍 Search Transactions ({filteredDeals.length < savedDealsCount ? `${filteredDeals.length} of ` : ''}{savedDealsCount} Loaded)
        </span>
        {isLoadingDeals && <span className="text-slate-500 dark:text-slate-400 font-normal">Loading records...</span>}
      </label>
      
      <div className="relative">
        <input
          type="text"
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
          className="w-full bg-slate-100 dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg px-3.5 pr-9 py-2.5 text-sm text-slate-900 dark:text-white focus:outline-none focus:border-emerald-500 font-medium placeholder-slate-400 dark:placeholder-slate-500"
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
                    <span className="text-slate-800 dark:text-slate-200 ml-2 font-medium">{deal.property_address}</span>
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
    </section>
  );
}