'use client';

import { useState, useRef, ChangeEvent } from 'react';
import Dashboard from '@/components/Dashboard'; // Import the new Dashboard component

type Status = 'idle' | 'uploading' | 'processing' | 'success' | 'error' | 'partial_success';
type ActiveTab = 'upload' | 'dashboard'; // Type for managing tabs

// Type matching the backend response structure for each file
interface ProcessResult {
  fileName: string;
  status: 'success' | 'error';
  receiptId?: string;
  message: string;
}

export default function HomePage() {
  const [status, setStatus] = useState<Status>('idle');
  const [statusMessage, setStatusMessage] = useState<string>('Ready to upload receipt(s).');
  const [results, setResults] = useState<ProcessResult[]>([]); 
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [activeTab, setActiveTab] = useState<ActiveTab>('upload'); // State for active tab

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

    // Optional: Auto-reset status after a delay, keeping results visible
    // setTimeout(() => {
    //   setStatus('idle');
    //   setStatusMessage('Ready to upload receipt(s).');
    // }, 10000); 
  };

  const handleUploadClick = () => {
    fileInputRef.current?.click();
  };

  const getStatusColor = () => {
    switch (status) {
      case 'success': return 'text-green-600';
      case 'partial_success': return 'text-yellow-600'; // Indicate mixed results
      case 'error': return 'text-red-600';
      case 'uploading':
      case 'processing': return 'text-blue-600';
      default: return 'text-gray-600';
    }
  };

  // Component for the Upload Section (extracted for clarity)
  const UploadSection = () => (
    <div className="w-full max-w-md text-center">
      <h1 className="text-2xl font-bold mb-6 text-gray-800">Receipt Processor</h1>
      
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
        className={`w-full px-6 py-4 text-lg font-semibold text-white rounded-lg shadow-md transition-colors duration-200 ${
          status === 'uploading' || status === 'processing'
            ? 'bg-gray-400 cursor-not-allowed'
            : 'bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-opacity-50'
        }`}
      >
        {status === 'uploading' ? 'Uploading...' : status === 'processing' ? 'Processing...' : 'Upload Receipt Image(s)'}
      </button>

      <p className={`mt-6 text-md font-medium ${getStatusColor()}`}>
        {statusMessage}
      </p>

      {results.length > 0 && (
        <div className="mt-4 p-4 border border-gray-200 rounded-lg bg-white text-left text-sm">
          <h3 className="font-semibold mb-2 text-gray-700">Processing Results:</h3>
          <ul className="space-y-1">
            {results.map((result, index) => (
              <li key={index} className={`flex justify-between items-center p-1 rounded ${
                  result.status === 'success' ? 'bg-green-50' : 'bg-red-50'
              }`}>
                <span className="truncate pr-2 text-gray-600" title={result.fileName}>{result.fileName}</span>
                <span className={`font-medium ${result.status === 'success' ? 'text-green-700' : 'text-red-700'}`}>
                  {result.status === 'success' ? 'Success' : 'Error'}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Tab Navigation - Hidden on mobile (below md), visible on desktop */}
      <div className="hidden md:flex justify-center pt-4 pb-2 border-b border-gray-200 bg-white shadow-sm">
        <nav className="flex space-x-4">
          <button
            onClick={() => setActiveTab('upload')}
            className={`px-4 py-2 rounded-md text-sm font-medium transition-colors duration-150 ${
              activeTab === 'upload' 
                ? 'bg-blue-100 text-blue-700' 
                : 'text-gray-600 hover:bg-gray-100 hover:text-gray-800'
            }`}
          >
            Upload Receipts
          </button>
          <button
            onClick={() => setActiveTab('dashboard')}
            className={`px-4 py-2 rounded-md text-sm font-medium transition-colors duration-150 ${
              activeTab === 'dashboard' 
                ? 'bg-blue-100 text-blue-700' 
                : 'text-gray-600 hover:bg-gray-100 hover:text-gray-800'
            }`}
          >
            Dashboard
          </button>
        </nav>
      </div>

      {/* Content Area - Conditionally render based on active tab */}
      <div className="p-4 flex justify-center">
         {/* On mobile (below md), always show UploadSection */}
         <div className="md:hidden w-full max-w-md">
            <UploadSection />
         </div>
         {/* On desktop (md and up), show content based on activeTab */}
         <div className="hidden md:block w-full max-w-4xl"> {/* Adjust max-width as needed for dashboard */} 
            {activeTab === 'upload' && <UploadSection />} 
            {activeTab === 'dashboard' && <Dashboard />} 
         </div>
      </div>
    </div>
  );
}
