import { useState, useRef } from 'react';

export default function DocumentUpload({ onUploadComplete }) {
  const [isDragOver, setIsDragOver] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadResult, setUploadResult] = useState(null);
  const [selectedFiles, setSelectedFiles] = useState([]);
  const fileInputRef = useRef(null);

  const acceptedFileTypes = {
    'text/csv': '.csv',
    'application/zip': '.zip',
    'application/x-zip-compressed': '.zip',
    'application/pdf': '.pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document': '.docx',
    'application/msword': '.doc',
    'text/plain': '.txt'
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    setIsDragOver(true);
  };

  const handleDragLeave = (e) => {
    e.preventDefault();
    setIsDragOver(false);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setIsDragOver(false);
    const files = Array.from(e.dataTransfer.files);
    handleFiles(files);
  };

  const handleFileSelect = (e) => {
    const files = Array.from(e.target.files);
    handleFiles(files);
  };

  const handleFiles = (files) => {
    const validFiles = files.filter(file => {
      const isValidType = Object.keys(acceptedFileTypes).includes(file.type) || 
                         Object.values(acceptedFileTypes).some(ext => file.name.toLowerCase().endsWith(ext));
      return isValidType;
    });

    if (validFiles.length !== files.length) {
      alert('Some files were rejected. Please upload only CSV, ZIP, PDF, DOC, DOCX, or TXT files.');
    }

    setSelectedFiles(prev => [...prev, ...validFiles]);
  };

  const removeFile = (index) => {
    setSelectedFiles(prev => prev.filter((_, i) => i !== index));
  };

  const uploadFiles = async () => {
    if (selectedFiles.length === 0) {
      alert('Please select files to upload.');
      return;
    }

    setUploading(true);
    setUploadProgress(0);
    setUploadResult(null);

    try {
      const formData = new FormData();
      
      // Add files to FormData
      selectedFiles.forEach((file, index) => {
        formData.append(`file_${index}`, file);
      });

      // Add metadata
      formData.append('fileCount', selectedFiles.length.toString());
      formData.append('uploadType', 'bulk_import');

      const response = await fetch('/api/upload-documents', {
        method: 'POST',
        body: formData
      });

      if (!response.ok) {
        throw new Error(`Upload failed: ${response.status} ${response.statusText}`);
      }

      const result = await response.json();
      setUploadResult(result);
      
      if (onUploadComplete) {
        onUploadComplete(result);
      }

      // Clear selected files after successful upload
      setSelectedFiles([]);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }

    } catch (error) {
      console.error('Upload error:', error);
      setUploadResult({ 
        success: false, 
        error: error.message 
      });
    } finally {
      setUploading(false);
      setUploadProgress(0);
    }
  };

  const formatFileSize = (bytes) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  return (
    <div style={{
      padding: '24px',
      backgroundColor: '#ffffff',
      border: '1px solid #e5e7eb',
      borderRadius: '8px',
      marginBottom: '24px'
    }}>
      <h3 style={{
        margin: '0 0 16px 0',
        fontSize: '18px',
        fontWeight: '600',
        color: '#374151',
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
      }}>
        Upload Documents & External Resources
      </h3>

      <p style={{
        margin: '0 0 20px 0',
        fontSize: '14px',
        color: '#6b7280',
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
      }}>
        Upload CSV files for structured data and ZIP files for associated documents. 
        Supported formats: CSV, ZIP, PDF, DOC, DOCX, TXT
      </p>

      {/* Upload Area */}
      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={() => fileInputRef.current?.click()}
        style={{
          border: `2px dashed ${isDragOver ? '#4338ca' : '#d1d5db'}`,
          borderRadius: '8px',
          padding: '40px 20px',
          textAlign: 'center',
          cursor: 'pointer',
          backgroundColor: isDragOver ? '#f8fafc' : '#ffffff',
          transition: 'all 0.2s ease',
          marginBottom: '20px'
        }}
      >
        <div style={{ fontSize: '32px', marginBottom: '12px' }}>📁</div>
        <p style={{
          margin: '0 0 8px 0',
          fontSize: '16px',
          fontWeight: '500',
          color: '#374151',
          fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
        }}>
          {isDragOver ? 'Drop files here' : 'Drag & drop files here or click to browse'}
        </p>
        <p style={{
          margin: '0',
          fontSize: '14px',
          color: '#6b7280',
          fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
        }}>
          CSV, ZIP, PDF, DOC, DOCX, TXT files supported
        </p>
      </div>

      <input
        ref={fileInputRef}
        type="file"
        multiple
        accept=".csv,.zip,.pdf,.doc,.docx,.txt"
        onChange={handleFileSelect}
        style={{ display: 'none' }}
      />

      {/* Selected Files */}
      {selectedFiles.length > 0 && (
        <div style={{ marginBottom: '20px' }}>
          <h4 style={{
            margin: '0 0 12px 0',
            fontSize: '16px',
            fontWeight: '500',
            color: '#374151',
            fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
          }}>
            Selected Files ({selectedFiles.length})
          </h4>
          <div style={{
            display: 'flex',
            flexDirection: 'column',
            gap: '8px',
            maxHeight: '200px',
            overflowY: 'auto'
          }}>
            {selectedFiles.map((file, index) => (
              <div key={index} style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                padding: '12px',
                backgroundColor: '#f8fafc',
                border: '1px solid #e5e7eb',
                borderRadius: '6px'
              }}>
                <div>
                  <div style={{
                    fontSize: '14px',
                    fontWeight: '500',
                    color: '#374151',
                    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
                  }}>
                    {file.name}
                  </div>
                  <div style={{
                    fontSize: '12px',
                    color: '#6b7280',
                    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
                  }}>
                    {formatFileSize(file.size)} • {file.type || 'Unknown type'}
                  </div>
                </div>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    removeFile(index);
                  }}
                  style={{
                    padding: '4px 8px',
                    backgroundColor: '#dc2626',
                    color: '#ffffff',
                    border: 'none',
                    borderRadius: '4px',
                    fontSize: '12px',
                    cursor: 'pointer',
                    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
                  }}
                >
                  Remove
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Upload Button */}
      <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
        <button
          onClick={uploadFiles}
          disabled={selectedFiles.length === 0 || uploading}
          style={{
            padding: '12px 24px',
            backgroundColor: selectedFiles.length === 0 || uploading ? '#d1d5db' : '#4338ca',
            color: selectedFiles.length === 0 || uploading ? '#9ca3af' : '#ffffff',
            border: 'none',
            borderRadius: '6px',
            fontSize: '14px',
            fontWeight: '500',
            cursor: selectedFiles.length === 0 || uploading ? 'not-allowed' : 'pointer',
            fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
            transition: 'all 0.2s ease'
          }}
        >
          {uploading ? 'Uploading...' : `Upload ${selectedFiles.length} File${selectedFiles.length !== 1 ? 's' : ''}`}
        </button>

        {uploading && (
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            fontSize: '14px',
            color: '#6b7280',
            fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
          }}>
            <div style={{
              width: '16px',
              height: '16px',
              border: '2px solid #e5e7eb',
              borderTop: '2px solid #4338ca',
              borderRadius: '50%',
              animation: 'spin 1s linear infinite'
            }} />
            Processing...
          </div>
        )}
      </div>

      {/* Upload Result */}
      {uploadResult && (
        <div style={{
          marginTop: '20px',
          padding: '16px',
          backgroundColor: uploadResult.success ? '#d4edda' : '#f8d7da',
          color: uploadResult.success ? '#155724' : '#721c24',
          borderRadius: '6px',
          border: `1px solid ${uploadResult.success ? '#c3e6cb' : '#f5c6cb'}`
        }}>
          {uploadResult.success ? (
            <div>
              <h4 style={{ margin: '0 0 8px 0', fontSize: '16px', fontWeight: '600' }}>
                Upload Successful!
              </h4>
              <p style={{ margin: '0 0 8px 0', fontSize: '14px' }}>
                {uploadResult.message || 'Files uploaded and processed successfully.'}
              </p>
              {uploadResult.stats && (
                <div style={{ fontSize: '14px' }}>
                  <p style={{ margin: '4px 0' }}>
                    • Files processed: {uploadResult.stats.filesProcessed}
                  </p>
                  <p style={{ margin: '4px 0' }}>
                    • Documents indexed: {uploadResult.stats.documentsIndexed}
                  </p>
                  <p style={{ margin: '4px 0' }}>
                    • Errors: {uploadResult.stats.errors}
                  </p>
                </div>
              )}
            </div>
          ) : (
            <div>
              <h4 style={{ margin: '0 0 8px 0', fontSize: '16px', fontWeight: '600' }}>
                Upload Failed
              </h4>
              <p style={{ margin: '0', fontSize: '14px' }}>
                {uploadResult.error || 'An error occurred during upload.'}
              </p>
            </div>
          )}
        </div>
      )}

      <style jsx>{`
        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}
