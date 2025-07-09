'use client';

import { useState, useRef, ChangeEvent } from 'react';
import Dashboard from '@/components/Dashboard';
import ReceiptView from '@/components/ReceiptView';

type Status = 'idle' | 'uploading' | 'processing' | 'success' | 'error' | 'partial_success';
type ActiveTab = 'upload' | 'receipts' | 'dashboard';

// Type matching the backend response structure for each file
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
  const [statusMessage, setStatusMessage] = useState<string>('Ready to upload receipt(s).');
  const [results, setResults] = useState<ProcessResult[]>([]); 
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [activeTab, setActiveTab] = useState<ActiveTab>('upload');

  const handleFileChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files || files.length === 0) {
      return;
    }

    const MAX_FILES = 5;
    if (files.length > MAX_FILES) {
        setStatus('error');
        setStatusMessage(`Error: Cannot upload more than ${MAX_FILES} files at a time.`);
        // Clear file input
        if (fileInputRef.current) fileInputRef.current.value = '';
        return;
    }

    // Reset previous results
    setResults([]);
    setStatus('uploading');
    const fileNames = Array.from(files).map(f => f.name).join(', ');
    setStatusMessage(`Uploading ${files.length} file(s): ${fileNames}...`);

    const formData = new FormData();
    for (let i = 0; i < files.length; i++) {
      formData.append('receiptImages', files[i]); // Key must match backend: receiptImages
    }

    try {
      setStatus('processing');
      setStatusMessage(`Processing ${files.length} receipt(s)...`);

      const response = await fetch('/api/process-receipt', {
        method: 'POST',
        body: formData,
      });

      // Reset file input value *after* fetch starts, allowing re-uploading same files if needed
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }

      const responseData: ProcessResult[] | { message: string } = await response.json();

      if (response.ok && Array.isArray(responseData)) {
        setResults(responseData);
        const successCount = responseData.filter(r => r.status === 'success').length;
        const errorCount = responseData.length - successCount;

        if (errorCount === 0) {
            setStatus('success');
            setStatusMessage(`Successfully processed ${successCount} receipt(s).`);
        } else if (successCount > 0) {
            setStatus('partial_success');
            setStatusMessage(`Processed ${responseData.length} receipts: ${successCount} success, ${errorCount} error(s).`);
        } else {
            setStatus('error');
            setStatusMessage(`Failed to process all ${responseData.length} receipts.`);
        }

      } else {
        // Handle non-array responses or non-ok status codes
        const errorMsg = (responseData as { message: string })?.message || 'Failed to process receipts. Unknown error.';
        setStatus('error');
        setStatusMessage(`Error: ${response.statusText} - ${errorMsg}`);
        setResults([]); // Clear results on general failure
        console.error('API Error:', response.status, response.statusText, responseData);
      }

    } catch (error) {
      console.error("Network or other error:", error);
      setStatus('error');
      setStatusMessage('An error occurred during upload/processing. Please check connection and try again.');
      setResults([]); // Clear results on network error
      // Reset file input in case of error before fetch started
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const handleUploadClick = () => {
    fileInputRef.current?.click();
  };

  const getStatusColor = () => {
    switch (status) {
      case 'success': return 'text-green-600';
      case 'partial_success': return 'text-yellow-600';
      case 'error': return 'text-red-600';
      case 'uploading':
      case 'processing': return 'text-blue-600';
      default: return 'text-gray-600';
    }
  };

  // Component for the Upload Section
  const UploadSection = () => (
    <div className="w-full max-w-md text-center">
      <h1 className="text-2xl font-bold mb-6 text-gray-800 font-roboto">Receipt Processor</h1>
      
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
        className={`w-full px-6 py-4 text-lg font-semibold text-white rounded-lg shadow-md transition-colors duration-200 font-roboto ${
          status === 'uploading' || status === 'processing'
            ? 'bg-gray-400 cursor-not-allowed'
            : 'bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-opacity-50'
        }`}
      >
        {status === 'uploading' ? 'Uploading...' : status === 'processing' ? 'Processing...' : 'Upload Receipt Image(s)'}
      </button>

      <p className={`mt-6 text-md font-medium ${getStatusColor()} font-roboto`}>
        {statusMessage}
      </p>

      {results.length > 0 && (
        <div className="mt-4 p-4 border border-gray-200 rounded-lg bg-white text-left text-sm font-roboto">
          <h3 className="font-semibold mb-2 text-gray-700">Processing Results:</h3>
          <ul className="space-y-2">
            {results.map((result, index) => (
              <li key={index} className={`p-3 rounded-lg border ${
                  result.status === 'success' 
                    ? 'bg-green-50 border-green-200' 
                    : 'bg-red-50 border-red-200'
              }`}>
                <div className="flex justify-between items-start mb-1">
                  <span className="font-medium text-gray-800 truncate pr-2" title={result.fileName}>
                    {result.fileName}
                  </span>
                  <span className={`text-xs px-2 py-1 rounded-full font-medium ${
                    result.status === 'success' 
                      ? 'bg-green-100 text-green-800' 
                      : 'bg-red-100 text-red-800'
                  }`}>
                    {result.status === 'success' ? 'Success' : 'Failed'}
                  </span>
                </div>
                
                <div className="text-xs text-gray-600 mt-1">
                  {result.status === 'success' && result.receiptId && (
                    <span className="text-green-700">Receipt ID: {result.receiptId}</span>
                  )}
                  
                  {result.status === 'error' && (
                    <div className="space-y-1">
                      <div className="text-red-700">{result.message}</div>
                      {result.shouldRetry && (
                        <div className="flex items-center text-orange-600">
                          <svg className="w-3 h-3 mr-1" fill="currentColor" viewBox="0 0 20 20">
                            <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                          </svg>
                          <span>This error may be temporary - try uploading again</span>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );

  return (
    <div className="min-h-screen bg-gray-50 font-roboto">
      {/* Mobile-first Tab Navigation */}
      <div className="bg-white shadow-sm border-b border-gray-200">
        <div className="px-4">
          <div className="flex">
            <button
              onClick={() => setActiveTab('upload')}
              className={`flex-1 py-3 px-4 text-sm font-medium transition-colors font-roboto ${
                activeTab === 'upload'
                  ? 'text-blue-600 bg-blue-50 border-b-2 border-blue-600'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              Upload
            </button>
            <button
              onClick={() => setActiveTab('receipts')}
              className={`flex-1 py-3 px-4 text-sm font-medium transition-colors font-roboto ${
                activeTab === 'receipts'
                  ? 'text-blue-600 bg-blue-50 border-b-2 border-blue-600'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              Receipts
            </button>
            <button
              onClick={() => setActiveTab('dashboard')}
              className={`flex-1 py-3 px-4 text-sm font-medium transition-colors font-roboto ${
                activeTab === 'dashboard'
                  ? 'text-blue-600 bg-blue-50 border-b-2 border-blue-600'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              Analytics
            </button>
          </div>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1">
        {activeTab === 'upload' && (
          <div className="flex items-center justify-center p-4 min-h-[calc(100vh-64px)]">
            <UploadSection />
          </div>
        )}
        {activeTab === 'receipts' && (
          <ReceiptView onBack={() => setActiveTab('upload')} />
        )}
        {activeTab === 'dashboard' && (
          <Dashboard />
        )}
      </div>
    </div>
  );
}
