'use client';

import { useState, useEffect, useCallback } from 'react';

interface LineItem {
  line_item_id: string;
  item_name: string;
  item_cost: number;
  category: string;
}

interface Receipt {
  receipt_id: string;
  merchant_name: string;
  merchant_address: string | null;
  total_amount: number;
  purchase_datetime: string;
  currency_code: string;
  category: string;
  processed_timestamp: string;
  line_items: LineItem[];
}

interface RecentReceiptsResponse {
  receipts: Receipt[];
  total_count: number;
  period_label: string;
}

type FetchStatus = 'idle' | 'loading' | 'success' | 'error';
type TimePeriod = 'this_month' | '3_months' | '6_months' | 'all';

interface ReceiptViewProps {
  onBack?: () => void;
}

const TIME_PERIODS: { id: TimePeriod; label: string; shortLabel: string }[] = [
  { id: 'this_month', label: 'This Month', shortLabel: 'Month' },
  { id: '3_months', label: '3 Months', shortLabel: '3M' },
  { id: '6_months', label: '6 Months', shortLabel: '6M' },
  { id: 'all', label: 'All', shortLabel: 'All' },
];

const categoryColors: Record<string, string> = {
  produce: 'var(--accent-emerald)',
  dairy: 'var(--accent-sky)',
  meat: 'var(--accent-rose)',
  beverages: 'var(--accent-violet)',
  pantry_staples: 'var(--accent-amber)',
  eggs: 'var(--accent-gold)',
  personal_care: 'var(--accent-rose)',
  groceries: 'var(--accent-emerald)',
  other: 'var(--text-muted)',
};

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export default function ReceiptView({ onBack }: ReceiptViewProps) {
  const [receipts, setReceipts] = useState<Receipt[]>([]);
  const [status, setStatus] = useState<FetchStatus>('idle');
  const [error, setError] = useState<string | null>(null);
  const [selectedReceipt, setSelectedReceipt] = useState<Receipt | null>(null);
  const [currentPage, setCurrentPage] = useState(0);
  const [totalCount, setTotalCount] = useState(0);
  const [selectedPeriod, setSelectedPeriod] = useState<TimePeriod>('this_month');
  const [periodLabel, setPeriodLabel] = useState<string>('');

  const ITEMS_PER_PAGE = 10;

  const fetchReceipts = useCallback(async (page: number = 0, period: TimePeriod) => {
    setStatus('loading');
    setError(null);

    try {
      const offset = page * ITEMS_PER_PAGE;
      const response = await fetch(`/api/recent-receipts?limit=${ITEMS_PER_PAGE}&offset=${offset}&period=${period}`);
      
      if (!response.ok) throw new Error(`Failed to fetch receipts`);

      const data: RecentReceiptsResponse = await response.json();
      setReceipts(data.receipts);
      setTotalCount(data.total_count);
      setPeriodLabel(data.period_label);
      setStatus('success');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An unknown error occurred');
      setStatus('error');
    }
  }, []);

  useEffect(() => {
    fetchReceipts(currentPage, selectedPeriod);
  }, [currentPage, selectedPeriod, fetchReceipts]);

  const handlePeriodChange = (period: TimePeriod) => {
    setSelectedPeriod(period);
    setCurrentPage(0);
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(amount);
  };

  const getRelativeDate = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffTime = now.getTime() - date.getTime();
    const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
    
    if (diffDays === 0) return 'Today';
    if (diffDays === 1) return 'Yesterday';
    if (diffDays < 7) return `${diffDays}d ago`;
    if (diffDays < 30) return `${Math.floor(diffDays / 7)}w ago`;
    
    return date.toLocaleDateString('de-DE', { day: '2-digit', month: 'short' });
  };

  const formatFullDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('de-DE', {
      weekday: 'short',
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    });
  };

  const formatTime = (dateString: string) => {
    return new Date(dateString).toLocaleTimeString('de-DE', {
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const getCategoryColor = (category: string) => {
    return categoryColors[category.toLowerCase()] || categoryColors.other;
  };

  const handleNextPage = () => {
    if ((currentPage + 1) * ITEMS_PER_PAGE < totalCount) setCurrentPage(currentPage + 1);
  };

  const handlePrevPage = () => {
    if (currentPage > 0) setCurrentPage(currentPage - 1);
  };

  // Receipt detail view
  if (selectedReceipt) {
    return (
      <div className="min-h-[calc(100vh-57px)] bg-[var(--bg-primary)] animate-fade-in">
        {/* Header */}
        <div className="max-w-2xl mx-auto px-4 py-4">
          <button 
            onClick={() => setSelectedReceipt(null)}
            className="flex items-center gap-2 text-[var(--accent-gold)] font-medium hover:opacity-80 transition-opacity"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
            </svg>
            Back to Receipts
          </button>
        </div>

        {/* Receipt Card */}
        <div className="max-w-2xl mx-auto px-4 pb-8">
          <div className="card-elevated p-8 animate-fade-in-up">
            {/* Receipt Header */}
            <div className="text-center mb-8">
              <div className="inline-flex items-center justify-center w-14 h-14 rounded-xl bg-[var(--bg-elevated)] mb-4">
                <svg className="w-7 h-7 text-[var(--accent-gold)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 21v-7.5a.75.75 0 01.75-.75h3a.75.75 0 01.75.75V21m-4.5 0H2.36m11.14 0H18m0 0h3.64m-1.39 0V9.349m-16.5 11.65V9.35m0 0a3.001 3.001 0 003.75-.615A2.993 2.993 0 009.75 9.75c.896 0 1.7-.393 2.25-1.016a2.993 2.993 0 002.25 1.016c.896 0 1.7-.393 2.25-1.016a3.001 3.001 0 003.75.614m-16.5 0a3.004 3.004 0 01-.621-4.72L4.318 3.44A1.5 1.5 0 015.378 3h13.243a1.5 1.5 0 011.06.44l1.19 1.189a3 3 0 01-.621 4.72m-13.5 8.65h3.75a.75.75 0 00.75-.75V13.5a.75.75 0 00-.75-.75H6.75a.75.75 0 00-.75.75v3.75c0 .415.336.75.75.75z" />
                </svg>
              </div>
              <h2 className="text-display text-2xl text-[var(--text-primary)] mb-2">{selectedReceipt.merchant_name}</h2>
              {selectedReceipt.merchant_address && (
                <p className="text-sm text-[var(--text-muted)] whitespace-pre-line mb-2">
                  {selectedReceipt.merchant_address}
                </p>
              )}
              <div className="flex items-center justify-center gap-2">
                <span className="px-2.5 py-1 rounded-lg text-xs font-medium bg-[var(--bg-elevated)] text-[var(--text-secondary)]">
                  {formatFullDate(selectedReceipt.purchase_datetime)}
                </span>
                <span className="px-2.5 py-1 rounded-lg text-xs font-medium bg-[var(--bg-elevated)] text-[var(--text-secondary)]">
                  {formatTime(selectedReceipt.purchase_datetime)}
                </span>
              </div>
            </div>

            {/* Line Items */}
            <div className="space-y-3 mb-8">
              {selectedReceipt.line_items.map((item, index) => (
                <div 
                  key={item.line_item_id} 
                  className="flex justify-between items-center py-3 border-b border-[var(--border-subtle)] animate-fade-in-up"
                  style={{ animationDelay: `${index * 0.05}s` }}
                >
                  <div className="flex-1">
                    <div className="text-[var(--text-primary)] font-medium">{item.item_name}</div>
                    <div 
                      className="text-xs font-medium uppercase tracking-wider mt-1"
                      style={{ color: getCategoryColor(item.category) }}
                    >
                      {item.category.replace('_', ' ')}
                    </div>
                  </div>
                  <div className="text-mono text-[var(--text-primary)] font-semibold">
                    {formatCurrency(item.item_cost)}
                  </div>
                </div>
              ))}
            </div>

            {/* Total */}
            <div className="flex justify-between items-center py-4 border-t-2 border-[var(--accent-gold)]/30">
              <div className="text-display text-xl text-[var(--text-primary)]">Total</div>
              <div className="text-mono text-2xl font-bold gradient-text">
                {formatCurrency(selectedReceipt.total_amount)}
              </div>
            </div>

            {/* Footer */}
            <div className="text-center mt-8 pt-6 border-t border-[var(--border-subtle)]">
              <p className="text-xs text-[var(--text-muted)]">
                Receipt #{selectedReceipt.receipt_id.slice(0, 8).toUpperCase()}
              </p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Loading state
  if (status === 'loading' || status === 'idle') {
    return (
      <div className="min-h-[calc(100vh-57px)] bg-[var(--bg-primary)]">
        <div className="max-w-2xl mx-auto px-4 py-8">
          <div className="flex items-center justify-center py-20">
            <div className="text-center">
              <svg className="w-8 h-8 mx-auto mb-4 text-[var(--accent-gold)] animate-spin" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"/>
              </svg>
              <p className="text-[var(--text-secondary)]">Loading receipts...</p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Error state
  if (status === 'error') {
    return (
      <div className="min-h-[calc(100vh-57px)] bg-[var(--bg-primary)]">
        <div className="max-w-2xl mx-auto px-4 py-8">
          <div className="card-elevated p-8 text-center">
            <div className="inline-flex items-center justify-center w-14 h-14 rounded-xl bg-[var(--accent-rose)]/10 mb-4">
              <svg className="w-7 h-7 text-[var(--accent-rose)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
            </div>
            <h3 className="text-display text-xl text-[var(--text-primary)] mb-2">Failed to load receipts</h3>
            <p className="text-[var(--text-secondary)]">{error}</p>
          </div>
        </div>
      </div>
    );
  }

  // Receipts list view
  return (
    <div className="min-h-[calc(100vh-57px)] bg-[var(--bg-primary)]">
      <div className="max-w-2xl mx-auto px-4 py-5">
        {/* Header */}
        <div className="mb-5 animate-fade-in">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h1 className="text-display text-2xl text-[var(--text-primary)]">Receipts</h1>
              <p className="text-sm text-[var(--text-muted)] mt-1">
                {totalCount} receipt{totalCount !== 1 ? 's' : ''} · {periodLabel}
              </p>
            </div>
          </div>
          
          {/* Time Period Pills */}
          <div className="flex gap-2 overflow-x-auto pb-2 -mx-4 px-4 sm:mx-0 sm:px-0">
            {TIME_PERIODS.map((period) => (
              <button
                key={period.id}
                onClick={() => handlePeriodChange(period.id)}
                className={`shrink-0 px-3 py-1.5 text-xs font-medium transition-all uppercase tracking-wide ${
                  selectedPeriod === period.id
                    ? 'bg-[#111] text-white'
                    : 'bg-white text-[var(--text-secondary)] border border-dashed border-[var(--border-subtle)] hover:border-[#111]'
                }`}
              >
                <span className="sm:hidden">{period.shortLabel}</span>
                <span className="hidden sm:inline">{period.label}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Receipts List */}
        <div className="space-y-3">
          {receipts.length === 0 ? (
            <div className="card-elevated p-12 text-center animate-fade-in-up">
              <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-[var(--bg-elevated)] mb-4">
                <svg className="w-8 h-8 text-[var(--text-muted)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 14l6-6m-5.5.5h.01m4.99 5h.01M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16l3.5-2 3.5 2 3.5-2 3.5 2z" />
                </svg>
              </div>
              <h3 className="text-display text-xl text-[var(--text-primary)] mb-2">No receipts</h3>
              <p className="text-[var(--text-secondary)]">No receipts found for this period</p>
            </div>
          ) : (
            <>
              {receipts.map((receipt, index) => (
                <div
                  key={receipt.receipt_id}
                  onClick={() => setSelectedReceipt(receipt)}
                  className="card-elevated card-hover p-4 cursor-pointer animate-fade-in-up"
                  style={{ animationDelay: `${index * 0.03}s` }}
                >
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-[10px] text-[var(--text-muted)] uppercase tracking-wider">RCP-{String(index + 1).padStart(2, '0')}</span>
                    <span className="bg-[#111] text-white text-[10px] px-2 py-0.5 uppercase tracking-wide">
                      {getRelativeDate(receipt.purchase_datetime)}
                    </span>
                  </div>
                  <div className="flex justify-between items-end gap-3">
                    <div className="flex-1 min-w-0">
                      <h3 className="font-medium text-[var(--text-primary)] truncate uppercase text-sm tracking-wide">
                        {receipt.merchant_name}
                      </h3>
                      <p className="text-[11px] text-[var(--text-muted)] mt-1 truncate uppercase">
                        {receipt.line_items.length} item{receipt.line_items.length !== 1 ? 's' : ''}
                        <span> · </span>
                        {receipt.line_items.slice(0, 2).map(item => item.item_name).join(', ')}
                      </p>
                    </div>
                    <div className="text-right shrink-0">
                      <div className="text-mono text-lg font-semibold text-[var(--text-primary)]">
                        {formatCurrency(receipt.total_amount)}
                      </div>
                    </div>
                  </div>
                </div>
              ))}

              {/* Pagination */}
              {totalCount > ITEMS_PER_PAGE && (
                <div className="flex justify-between items-center pt-4 animate-fade-in">
                  <button
                    onClick={handlePrevPage}
                    disabled={currentPage === 0}
                    className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium transition-all uppercase tracking-wide ${
                      currentPage === 0
                        ? 'bg-[var(--bg-elevated)] text-[var(--text-muted)] cursor-not-allowed'
                        : 'bg-white text-[var(--text-primary)] border border-dashed border-[var(--border-subtle)] hover:border-[#111]'
                    }`}
                  >
                    <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
                    </svg>
                    <span className="hidden sm:inline">Prev</span>
                  </button>
                  
                  <div className="text-xs text-[var(--text-muted)] uppercase tracking-wide">
                    <span className="text-[var(--text-primary)]">{currentPage + 1}</span>/{Math.ceil(totalCount / ITEMS_PER_PAGE)}
                  </div>
                  
                  <button
                    onClick={handleNextPage}
                    disabled={(currentPage + 1) * ITEMS_PER_PAGE >= totalCount}
                    className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium transition-all uppercase tracking-wide ${
                      (currentPage + 1) * ITEMS_PER_PAGE >= totalCount
                        ? 'bg-[var(--bg-elevated)] text-[var(--text-muted)] cursor-not-allowed'
                        : 'bg-white text-[var(--text-primary)] border border-dashed border-[var(--border-subtle)] hover:border-[#111]'
                    }`}
                  >
                    <span className="hidden sm:inline">Next</span>
                    <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                    </svg>
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
} 