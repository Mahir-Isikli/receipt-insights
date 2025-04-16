'use client';

import { useState, useRef, ChangeEvent } from 'react';

type Status = 'idle' | 'uploading' | 'processing' | 'success' | 'error';

export default function HomePage() {
  const [status, setStatus] = useState<Status>('idle');
  const [statusMessage, setStatusMessage] = useState<string>('Ready to upload receipt.');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    setStatus('uploading');
    setStatusMessage(`Uploading ${file.name}...`);

    const formData = new FormData();
    formData.append('receiptImage', file);

    try {
      setStatus('processing');
      setStatusMessage('Processing receipt...');

      const response = await fetch('/api/process-receipt', {
        method: 'POST',
        body: formData,
      });

      if (response.ok) {
        const result = await response.json(); // Assuming the API returns JSON
        setStatus('success');
        setStatusMessage(result.message || 'Receipt processed successfully!'); 
      } else {
        const errorResult = await response.json().catch(() => ({ message: 'Failed to process receipt. Please try again.' }));
        setStatus('error');
        setStatusMessage(`Error: ${response.statusText} - ${errorResult.message}`);
        console.error('API Error:', response.status, response.statusText, errorResult);
      }

    } catch (error) {
      console.error("Network or other error:", error);
      setStatus('error');
      setStatusMessage('An error occurred while uploading. Please check your connection and try again.');
    }

    // Reset file input value to allow uploading the same file again
    if (fileInputRef.current) {
        fileInputRef.current.value = '';
    }

    // Reset status after a delay unless it's still processing (which shouldn't happen here but safe check)
    if (status !== 'processing') {
      setTimeout(() => {
        setStatus('idle');
        setStatusMessage('Ready to upload receipt.');
      }, 5000);
    }
  };

  const handleUploadClick = () => {
    // Trigger the hidden file input
    fileInputRef.current?.click();
  };

  const getStatusColor = () => {
    switch (status) {
      case 'success': return 'text-green-600';
      case 'error': return 'text-red-600';
      case 'uploading': // Keep blue during upload/processing
      case 'processing': return 'text-blue-600';
      default: return 'text-gray-600';
    }
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-gray-50 p-4">
      <div className="w-full max-w-md text-center">
        <h1 className="text-2xl font-bold mb-6 text-gray-800">Receipt Processor</h1>
        
        {/* Hidden File Input */}
        <input 
          type="file"
          accept="image/*"
          capture="environment" // Use 'user' for front camera, 'environment' for back
          ref={fileInputRef}
          onChange={handleFileChange}
          className="hidden"
          disabled={status === 'uploading' || status === 'processing'}
        />

        {/* Upload Button */}
        <button
          onClick={handleUploadClick}
          disabled={status === 'uploading' || status === 'processing'}
          className={`w-full px-6 py-4 text-lg font-semibold text-white rounded-lg shadow-md transition-colors duration-200 ${
            status === 'uploading' || status === 'processing'
              ? 'bg-gray-400 cursor-not-allowed'
              : 'bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-opacity-50'
          }`}
        >
          {status === 'uploading' ? 'Uploading...' : status === 'processing' ? 'Processing...' : 'Upload Receipt Image'}
        </button>

        {/* Status Display */}
        <p className={`mt-6 text-md ${getStatusColor()}`}>
          {statusMessage}
        </p>
      </div>
    </div>
  );
}
