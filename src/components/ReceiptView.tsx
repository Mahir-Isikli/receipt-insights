'use client';

import { useState, useEffect } from 'react';

// Types matching the API response
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
}

type FetchStatus = 'idle' | 'loading' | 'success' | 'error';

interface ReceiptViewProps {
  onBack?: () => void;
}

export default function ReceiptView({ onBack }: ReceiptViewProps) {
  const [receipts, setReceipts] = useState<Receipt[]>([]);
  const [status, setStatus] = useState<FetchStatus>('idle');
  const [error, setError] = useState<string | null>(null);
  const [selectedReceipt, setSelectedReceipt] = useState<Receipt | null>(null);
  const [currentPage, setCurrentPage] = useState(0);
  const [totalCount, setTotalCount] = useState(0);

  const ITEMS_PER_PAGE = 10;

  const fetchReceipts = async (page: number = 0) => {
    setStatus('loading');
    setError(null);

    try {
      const offset = page * ITEMS_PER_PAGE;
      const response = await fetch(`/api/recent-receipts?limit=${ITEMS_PER_PAGE}&offset=${offset}`);
      
      if (!response.ok) {
        throw new Error(`Failed to fetch receipts: ${response.statusText}`);
      }

      const data: RecentReceiptsResponse = await response.json();
      setReceipts(data.receipts);
      setTotalCount(data.total_count);
      setStatus('success');
    } catch (err) {
      console.error('Failed to fetch receipts:', err);
      setError(err instanceof Error ? err.message : 'An unknown error occurred');
      setStatus('error');
    }
  };

  useEffect(() => {
    fetchReceipts(currentPage);
  }, [currentPage]);

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(amount);
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('de-DE', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const handleNextPage = () => {
    if ((currentPage + 1) * ITEMS_PER_PAGE < totalCount) {
      setCurrentPage(currentPage + 1);
    }
  };

  const handlePrevPage = () => {
    if (currentPage > 0) {
      setCurrentPage(currentPage - 1);
    }
  };

  // Receipt detail view
  if (selectedReceipt) {
    return (
      <div className="min-h-screen bg-gray-50 font-roboto">
        {/* Header */}
        <div className="bg-white shadow-sm border-b border-gray-200 p-4">
          <div className="flex items-center justify-between">
            <button 
              onClick={() => setSelectedReceipt(null)}
              className="text-blue-600 font-medium"
            >
              ← Back to Receipts
            </button>
            {onBack && (
              <button 
                onClick={onBack}
                className="text-gray-600 font-medium"
              >
                ← Upload
              </button>
            )}
          </div>
        </div>

        {/* Receipt Detail */}
        <div className="p-4">
          <div className="bg-white rounded-lg shadow-md p-6 mx-auto max-w-md">
            {/* Receipt Header */}
            <div className="text-center border-b border-gray-300 pb-4 mb-4">
              <h2 className="font-bold text-lg text-gray-800">{selectedReceipt.merchant_name}</h2>
              {selectedReceipt.merchant_address && (
                <div className="text-sm text-gray-600 mt-1 whitespace-pre-line">
                  {selectedReceipt.merchant_address}
                </div>
              )}
              <div className="text-xs text-gray-500 mt-2">
                {formatDate(selectedReceipt.purchase_datetime)}
              </div>
            </div>

            {/* Line Items */}
            <div className="space-y-2 border-b border-gray-300 pb-4 mb-4">
              {selectedReceipt.line_items.map((item) => (
                <div key={item.line_item_id} className="flex justify-between items-start">
                  <div className="flex-1 pr-2">
                    <div className="text-sm font-medium text-gray-800">{item.item_name}</div>
                    <div className="text-xs text-gray-500 capitalize">
                      {item.category.toLowerCase().replace('_', ' ')}
                    </div>
                  </div>
                  <div className="text-sm font-mono text-gray-800 font-medium">
                    {formatCurrency(item.item_cost)}
                  </div>
                </div>
              ))}
            </div>

            {/* Total */}
            <div className="flex justify-between items-center">
              <div className="font-bold text-lg text-gray-800">TOTAL</div>
              <div className="font-bold text-lg font-mono text-gray-800">
                {formatCurrency(selectedReceipt.total_amount)}
              </div>
            </div>

            {/* Footer */}
            <div className="text-center text-xs text-gray-500 mt-6 pt-4 border-t border-gray-300">
              <div>Receipt ID: {selectedReceipt.receipt_id.slice(0, 8)}...</div>
              <div>Processed: {formatDate(selectedReceipt.processed_timestamp)}</div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Loading state
  if (status === 'loading') {
    return (
      <div className="min-h-screen bg-gray-50 font-roboto">
        <div className="bg-white shadow-sm border-b border-gray-200 p-4">
          <div className="flex items-center justify-between">
            <h1 className="text-xl font-semibold text-gray-800">Recent Receipts</h1>
            {onBack && (
              <button 
                onClick={onBack}
                className="text-blue-600 font-medium"
              >
                ← Upload
              </button>
            )}
          </div>
        </div>
        <div className="flex justify-center items-center p-10">
          <p className="text-gray-600 text-lg">Loading receipts...</p>
        </div>
      </div>
    );
  }

  // Error state
  if (status === 'error') {
    return (
      <div className="min-h-screen bg-gray-50 font-roboto">
        <div className="bg-white shadow-sm border-b border-gray-200 p-4">
          <div className="flex items-center justify-between">
            <h1 className="text-xl font-semibold text-gray-800">Recent Receipts</h1>
            {onBack && (
              <button 
                onClick={onBack}
                className="text-blue-600 font-medium"
              >
                ← Upload
              </button>
            )}
          </div>
        </div>
        <div className="flex justify-center items-center p-10 bg-red-50 border border-red-200 rounded-lg mx-4 mt-4">
          <p className="text-red-700 text-lg">Error loading receipts: {error}</p>
        </div>
      </div>
    );
  }

  // Receipts list view
  return (
    <div className="min-h-screen bg-gray-50 font-roboto">
      {/* Header */}
      <div className="bg-white shadow-sm border-b border-gray-200 p-4">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-semibold text-gray-800">Recent Receipts</h1>
          {onBack && (
            <button 
              onClick={onBack}
              className="text-blue-600 font-medium"
            >
              ← Upload
            </button>
          )}
        </div>
      </div>

      {/* Receipts List */}
      <div className="p-4 space-y-4">
        {receipts.length === 0 ? (
          <div className="text-center py-10">
            <p className="text-gray-600 text-lg">No receipts found</p>
            <p className="text-gray-500 text-sm mt-2">Upload some receipts to see them here</p>
          </div>
        ) : (
          <>
            {receipts.map((receipt) => (
              <div
                key={receipt.receipt_id}
                onClick={() => setSelectedReceipt(receipt)}
                className="bg-white rounded-lg shadow-md p-4 cursor-pointer hover:shadow-lg transition-shadow"
              >
                <div className="flex justify-between items-start mb-2">
                  <div className="flex-1">
                    <h3 className="font-semibold text-gray-800 text-lg">
                      {receipt.merchant_name}
                    </h3>
                    <p className="text-sm text-gray-600">
                      {formatDate(receipt.purchase_datetime)}
                    </p>
                  </div>
                  <div className="text-right">
                    <div className="font-bold text-lg font-mono text-gray-800">
                      {formatCurrency(receipt.total_amount)}
                    </div>
                    <div className="text-xs text-gray-500 capitalize">
                      {receipt.category}
                    </div>
                  </div>
                </div>
                
                {/* Line items preview */}
                <div className="text-sm text-gray-600">
                  {receipt.line_items.length} item{receipt.line_items.length !== 1 ? 's' : ''}
                  {receipt.line_items.slice(0, 2).map((item, index) => (
                    <span key={item.line_item_id}>
                      {index === 0 ? ': ' : ', '}
                      {item.item_name}
                    </span>
                  ))}
                  {receipt.line_items.length > 2 && (
                    <span>... +{receipt.line_items.length - 2} more</span>
                  )}
                </div>
              </div>
            ))}

            {/* Pagination */}
            {totalCount > ITEMS_PER_PAGE && (
              <div className="flex justify-between items-center pt-4">
                <button
                  onClick={handlePrevPage}
                  disabled={currentPage === 0}
                  className={`px-4 py-2 rounded-md font-medium ${
                    currentPage === 0
                      ? 'bg-gray-200 text-gray-400 cursor-not-allowed'
                      : 'bg-blue-600 text-white hover:bg-blue-700'
                  }`}
                >
                  Previous
                </button>
                
                <div className="text-sm text-gray-600">
                  Page {currentPage + 1} of {Math.ceil(totalCount / ITEMS_PER_PAGE)}
                </div>
                
                <button
                  onClick={handleNextPage}
                  disabled={(currentPage + 1) * ITEMS_PER_PAGE >= totalCount}
                  className={`px-4 py-2 rounded-md font-medium ${
                    (currentPage + 1) * ITEMS_PER_PAGE >= totalCount
                      ? 'bg-gray-200 text-gray-400 cursor-not-allowed'
                      : 'bg-blue-600 text-white hover:bg-blue-700'
                  }`}
                >
                  Next
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
} 