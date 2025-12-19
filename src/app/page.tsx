'use client';

import { useState, useRef, ChangeEvent } from 'react';
import Dashboard from '@/components/Dashboard';
import ReceiptView from '@/components/ReceiptView';

type Status = 'idle' | 'uploading' | 'processing' | 'success' | 'error' | 'partial_success';
type ActiveTab = 'upload' | 'receipts' | 'dashboard';

interface ProcessResult {
  fileName: string;
  status: 'success' | 'error';
  receiptId?: string;
  message: string;
  errorType?: string;
  shouldRetry?: boolean;
}

export default function HomePage() {
  const [status, setStatus] = useState<Status>('idle');
  const [statusMessage, setStatusMessage] = useState<string>('Snap a photo of your receipt to get started');
  const [results, setResults] = useState<ProcessResult[]>([]); 
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [activeTab, setActiveTab] = useState<ActiveTab>('upload');

  const handleFileChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files || files.length === 0) return;

    const MAX_FILES = 5;
    if (files.length > MAX_FILES) {
      setStatus('error');
      setStatusMessage(`Maximum ${MAX_FILES} files allowed at once`);
      if (fileInputRef.current) fileInputRef.current.value = '';
      return;
    }

    setResults([]);
    setStatus('uploading');
    setStatusMessage(`Uploading ${files.length} receipt${files.length > 1 ? 's' : ''}...`);

    const formData = new FormData();
    for (let i = 0; i < files.length; i++) {
      formData.append('receiptImages', files[i]);
    }

    try {
      setStatus('processing');
      setStatusMessage('Analyzing your receipts...');

      const response = await fetch('/api/process-receipt', {
        method: 'POST',
        body: formData,
      });

      if (fileInputRef.current) fileInputRef.current.value = '';

      const responseData: ProcessResult[] | { message: string } = await response.json();

      if (response.ok && Array.isArray(responseData)) {
        setResults(responseData);
        const successCount = responseData.filter(r => r.status === 'success').length;
        const errorCount = responseData.length - successCount;

        if (errorCount === 0) {
          setStatus('success');
          setStatusMessage(`${successCount} receipt${successCount > 1 ? 's' : ''} processed successfully`);
        } else if (successCount > 0) {
          setStatus('partial_success');
          setStatusMessage(`${successCount} of ${responseData.length} receipts processed`);
        } else {
          setStatus('error');
          setStatusMessage('Failed to process receipts');
        }
      } else {
        const errorMsg = (responseData as { message: string })?.message || 'Unknown error occurred';
        setStatus('error');
        setStatusMessage(errorMsg);
        setResults([]);
      }
    } catch {
      setStatus('error');
      setStatusMessage('Connection error. Please try again.');
      setResults([]);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleUploadClick = () => fileInputRef.current?.click();

  const UploadSection = () => (
    <div className="w-full max-w-lg text-center px-6 animate-fade-in-up">
      <div className="mb-8">
        <div className="inline-flex items-center justify-center w-20 h-20 rounded-2xl bg-[var(--bg-card)] border border-[var(--border-subtle)] mb-6">
          <svg className="w-10 h-10 text-[var(--accent-gold)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 14l6-6m-5.5.5h.01m4.99 5h.01M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16l3.5-2 3.5 2 3.5-2 3.5 2z" />
          </svg>
        </div>
        <h1 className="text-display text-4xl md:text-5xl text-[var(--text-primary)] mb-3">
          Receipt Insights
        </h1>
        <p className="text-[var(--text-secondary)] text-lg">
          Track spending, discover patterns, save smarter
        </p>
      </div>
      
      <input 
        type="file"
        accept="image/*"
        multiple
        ref={fileInputRef}
        onChange={handleFileChange}
        className="hidden"
        disabled={status === 'uploading' || status === 'processing'}
      />

      <button
        onClick={handleUploadClick}
        disabled={status === 'uploading' || status === 'processing'}
        className="btn-primary w-full text-lg mb-6"
      >
        {status === 'uploading' ? (
          <span className="flex items-center justify-center gap-2">
            <svg className="w-5 h-5 animate-spin" viewBox="0 0 24 24" fill="none">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"/>
            </svg>
            Uploading...
          </span>
        ) : status === 'processing' ? (
          <span className="flex items-center justify-center gap-2">
            <svg className="w-5 h-5 animate-spin" viewBox="0 0 24 24" fill="none">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"/>
            </svg>
            Analyzing...
          </span>
        ) : (
          <span className="flex items-center justify-center gap-2">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
            Upload Receipt
          </span>
        )}
      </button>

      <p className={`text-sm transition-all duration-300 ${
        status === 'success' ? 'text-[var(--accent-emerald)]' :
        status === 'partial_success' ? 'text-[var(--accent-amber)]' :
        status === 'error' ? 'text-[var(--accent-rose)]' :
        status === 'uploading' || status === 'processing' ? 'text-[var(--accent-sky)]' :
        'text-[var(--text-muted)]'
      }`}>
        {statusMessage}
      </p>

      {results.length > 0 && (
        <div className="mt-8 card-elevated p-5 text-left animate-fade-in-up">
          <h3 className="text-sm font-semibold text-[var(--text-secondary)] uppercase tracking-wider mb-4">Results</h3>
          <ul className="space-y-3">
            {results.map((result, index) => (
              <li 
                key={index} 
                className={`p-4 rounded-xl border animate-fade-in-up ${
                  result.status === 'success' 
                    ? 'bg-[var(--accent-emerald)]/10 border-[var(--accent-emerald)]/20' 
                    : 'bg-[var(--accent-rose)]/10 border-[var(--accent-rose)]/20'
                }`}
                style={{ animationDelay: `${index * 0.1}s` }}
              >
                <div className="flex justify-between items-start gap-3">
                  <span className="font-medium text-[var(--text-primary)] truncate flex-1" title={result.fileName}>
                    {result.fileName}
                  </span>
                  <span className={`text-xs px-2.5 py-1 rounded-full font-semibold shrink-0 ${
                    result.status === 'success' 
                      ? 'bg-[var(--accent-emerald)]/20 text-[var(--accent-emerald)]' 
                      : 'bg-[var(--accent-rose)]/20 text-[var(--accent-rose)]'
                  }`}>
                    {result.status === 'success' ? 'Done' : 'Failed'}
                  </span>
                </div>
                
                {result.status === 'error' && (
                  <p className="text-sm text-[var(--accent-rose)] mt-2 opacity-80">
                    {result.message}
                  </p>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );

  return (
    <div className="min-h-screen bg-[var(--bg-primary)]">
      {/* Navigation */}
      <nav className="sticky top-0 z-50 bg-[var(--bg-secondary)]/80 backdrop-blur-xl border-b border-[var(--border-subtle)]">
        <div className="max-w-5xl mx-auto px-4">
          <div className="flex">
            {[
              { id: 'upload', label: 'Upload', icon: (
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                </svg>
              )},
              { id: 'receipts', label: 'Receipts', icon: (
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                </svg>
              )},
              { id: 'dashboard', label: 'Insights', icon: (
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                </svg>
              )}
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as ActiveTab)}
                className={`flex-1 py-4 px-4 text-sm font-medium transition-all duration-200 flex items-center justify-center gap-2 ${
                  activeTab === tab.id ? 'tab-active' : 'tab-inactive'
                }`}
              >
                {tab.icon}
                <span className="hidden sm:inline">{tab.label}</span>
              </button>
            ))}
          </div>
        </div>
      </nav>

      {/* Content */}
      <main className="flex-1">
        {activeTab === 'upload' && (
          <div className="flex items-center justify-center min-h-[calc(100vh-57px)] py-12">
            <UploadSection />
          </div>
        )}
        {activeTab === 'receipts' && <ReceiptView onBack={() => setActiveTab('upload')} />}
        {activeTab === 'dashboard' && <Dashboard />}
      </main>
    </div>
  );
}
