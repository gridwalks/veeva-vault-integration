import { useState, useRef, useEffect } from 'react';
import {
  getUploadedDocuments,
  downloadUploadedDocumentUrl,
  updateUploadedDocumentMetadata,
  deleteDocument
} from '../api';

const initialMetadataForm = {
  documentName: '',
  safeFileName: '',
  documentType: 'uploaded_document',
  version: '',
  manualSummary: '',
  aiSummary: ''
};

export default function DocumentUpload({ onUploadComplete, userId }) {
  const [isDragOver, setIsDragOver] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadResult, setUploadResult] = useState(null);
  const [selectedFiles, setSelectedFiles] = useState([]);
  const [uploadedDocuments, setUploadedDocuments] = useState([]);
  const [loadingDocuments, setLoadingDocuments] = useState(false);
  const [editingDocumentId, setEditingDocumentId] = useState(null);
  const [metadataForm, setMetadataForm] = useState(initialMetadataForm);
  const [metadataSaving, setMetadataSaving] = useState(false);
  const [metadataMessage, setMetadataMessage] = useState(null);
  const [metadataError, setMetadataError] = useState(null);
  const [deletingDocumentId, setDeletingDocumentId] = useState(null);
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

  const loadUploadedDocuments = async () => {
    if (!userId) {
      setUploadedDocuments([]);
      return;
    }

    setLoadingDocuments(true);
    setMetadataError(null);
    try {
      const result = await getUploadedDocuments({ limit: 100, offset: 0, search: '', userId });
      setUploadedDocuments(result.items || []);
    } catch (error) {
      console.error('Error loading uploaded documents:', error);
      setMetadataError('Failed to load uploaded documents. Please try again.');
    } finally {
      setLoadingDocuments(false);
    }
  };

  useEffect(() => {
    setEditingDocumentId(null);
    setMetadataForm(initialMetadataForm);
    setMetadataMessage(null);

    if (userId) {
      loadUploadedDocuments();
    } else {
      setUploadedDocuments([]);
    }
  }, [userId]);

  const removeFile = (index) => {
    setSelectedFiles(prev => prev.filter((_, i) => i !== index));
  };

  const uploadFiles = async () => {
    if (selectedFiles.length === 0) {
      alert('Please select files to upload.');
      return;
    }

    if (!userId) {
      alert('Unable to upload files: missing user information.');
      return;
    }

    setUploading(true);
    setUploadProgress(0);
    setUploadResult(null);
    setMetadataMessage(null);
    setMetadataError(null);

    try {
      const formData = new FormData();

      // Add files to FormData
      selectedFiles.forEach((file, index) => {
        formData.append(`file_${index}`, file);
      });

      // Add metadata
      formData.append('fileCount', selectedFiles.length.toString());
      formData.append('uploadType', 'bulk_import');
      formData.append('userId', userId);

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

      // Refresh uploaded documents list
      loadUploadedDocuments();
      setMetadataMessage('Documents uploaded successfully and added to the knowledge base.');

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

  const startEditingDocument = (doc) => {
    const fallbackName = doc.document_name || doc.original_filename || 'Untitled Document';
    setEditingDocumentId(doc.id);
    setMetadataForm({
      documentName: fallbackName,
      safeFileName: doc.safe_file_name || '',
      documentType: doc.document_type || 'uploaded_document',
      version: doc.version || '',
      manualSummary: doc.manual_summary || '',
      aiSummary: doc.ai_summary || ''
    });
    setMetadataError(null);
    setMetadataMessage(null);
  };

  const cancelEditingDocument = () => {
    setEditingDocumentId(null);
    setMetadataForm(initialMetadataForm);
    setMetadataError(null);
  };

  const handleMetadataFieldChange = (field, value) => {
    setMetadataForm(prev => ({
      ...prev,
      [field]: value
    }));
  };

  const saveMetadataChanges = async () => {
    if (!editingDocumentId) return;

    const trimmedName = metadataForm.documentName.trim();
    const trimmedSafeName = metadataForm.safeFileName.trim();
    const trimmedManualSummary = metadataForm.manualSummary.trim();
    if (!trimmedName) {
      setMetadataError('Document name is required.');
      return;
    }

    if (!userId) {
      setMetadataError('Unable to save changes: missing user information.');
      return;
    }

    setMetadataSaving(true);
    setMetadataError(null);

    try {
      const response = await updateUploadedDocumentMetadata({
        documentId: editingDocumentId,
        userId,
        documentName: trimmedName,
        safeFileName: trimmedSafeName || null,
        documentType: metadataForm.documentType,
        version: metadataForm.version,
        manualSummary: trimmedManualSummary || null,
        aiSummary: metadataForm.aiSummary
      });

      if (!response?.success) {
        throw new Error(response?.error || 'Failed to update document metadata.');
      }

      setMetadataMessage('Document metadata updated successfully.');
      setEditingDocumentId(null);
      setMetadataForm(initialMetadataForm);
      await loadUploadedDocuments();
    } catch (error) {
      console.error('Error updating uploaded document metadata:', error);
      setMetadataError(error.message || 'Failed to update document metadata.');
    } finally {
      setMetadataSaving(false);
    }
  };

  const handleDeleteUploadedDocument = async (doc) => {
    const docName = doc.document_name || doc.original_filename || 'this document';
    const confirmDelete = window.confirm(`Are you sure you want to delete "${docName}"? This action cannot be undone.`);
    if (!confirmDelete) {
      return;
    }

    setMetadataError(null);
    setMetadataMessage(null);
    setDeletingDocumentId(doc.id);

    try {
      const response = await deleteDocument({
        documentId: doc.id,
        sourceType: 'upload'
      });

      if (!response?.success) {
        throw new Error(response?.error || 'Failed to delete document.');
      }

      if (editingDocumentId === doc.id) {
        setEditingDocumentId(null);
        setMetadataForm(initialMetadataForm);
      }

      setMetadataMessage('Document deleted successfully.');
      await loadUploadedDocuments();
    } catch (error) {
      console.error('Error deleting uploaded document:', error);
      setMetadataError(error.message || 'Failed to delete document.');
    } finally {
      setDeletingDocumentId(null);
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

      {metadataMessage && (
        <div style={{
          marginTop: '20px',
          padding: '14px 16px',
          backgroundColor: '#d4edda',
          color: '#155724',
          borderRadius: '6px',
          border: '1px solid #c3e6cb',
          fontSize: '14px'
        }}>
          {metadataMessage}
        </div>
      )}

      {metadataError && (
        <div style={{
          marginTop: '20px',
          padding: '14px 16px',
          backgroundColor: '#f8d7da',
          color: '#721c24',
          borderRadius: '6px',
          border: '1px solid #f5c6cb',
          fontSize: '14px'
        }}>
          {metadataError}
        </div>
      )}

      {/* Uploaded Documents List */}
      <div style={{ marginTop: '32px' }}>
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '16px'
        }}>
          <h3 style={{
            margin: '0',
            fontSize: '18px',
            fontWeight: '600',
            color: '#374151',
            fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
          }}>
            Uploaded Documents
          </h3>
          <button
            onClick={loadUploadedDocuments}
            disabled={loadingDocuments}
            style={{
              padding: '8px 16px',
              backgroundColor: '#4338ca',
              color: '#ffffff',
              border: 'none',
              borderRadius: '6px',
              fontSize: '14px',
              fontWeight: '500',
              cursor: loadingDocuments ? 'not-allowed' : 'pointer',
              fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
              opacity: loadingDocuments ? 0.6 : 1
            }}
          >
            {loadingDocuments ? 'Refreshing...' : 'Refresh'}
          </button>
        </div>

        <p style={{
          margin: '0 0 20px 0',
          fontSize: '13px',
          color: '#4b5563',
          fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
        }}>
          Select a document and choose <strong>Edit</strong> to update its details. A green{' '}
          <strong>Save Changes</strong> button remains at the top of the row, and a larger{' '}
          <strong>Save Metadata Changes</strong> button is shown beneath the summaries so you can
          commit updates without scrolling back.
        </p>

        {loadingDocuments ? (
          <div style={{
            padding: '40px',
            textAlign: 'center',
            color: '#6b7280',
            fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
          }}>
            <div style={{
              width: '32px',
              height: '32px',
              border: '3px solid #e5e7eb',
              borderTop: '3px solid #4338ca',
              borderRadius: '50%',
              animation: 'spin 1s linear infinite',
              margin: '0 auto 12px'
            }} />
            Loading documents...
          </div>
        ) : uploadedDocuments.length === 0 ? (
          <div style={{
            padding: '40px',
            textAlign: 'center',
            backgroundColor: '#f8fafc',
            border: '1px solid #e5e7eb',
            borderRadius: '8px',
            color: '#6b7280',
            fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
          }}>
            <div style={{ fontSize: '48px', marginBottom: '12px' }}>📄</div>
            <p style={{ margin: '0', fontSize: '16px', fontWeight: '500' }}>
              No uploaded documents found
            </p>
            <p style={{ margin: '8px 0 0 0', fontSize: '14px' }}>
              Upload your first document using the form above
            </p>
          </div>
        ) : (
          <div style={{
            backgroundColor: '#ffffff',
            border: '1px solid #e5e7eb',
            borderRadius: '8px',
            overflow: 'hidden'
          }}>
            <div style={{
              display: 'grid',
              gridTemplateColumns: '1.6fr 1.2fr 1fr 1fr 1fr 220px',
              gap: '16px',
              padding: '12px 16px',
              backgroundColor: '#f8fafc',
              borderBottom: '1px solid #e5e7eb',
              fontWeight: '600',
              fontSize: '13px',
              color: '#374151',
              fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
            }}>
              <div>Document Name</div>
              <div>File Name</div>
              <div>Version</div>
              <div>Type</div>
              <div>Uploaded</div>
              <div>Actions</div>
            </div>
            {uploadedDocuments.map((doc, index) => {
              const isEditing = editingDocumentId === doc.id;
              const uploadedDate = doc.created_at ? new Date(doc.created_at).toLocaleString() : 'N/A';
              const updatedDate = doc.updated_at ? new Date(doc.updated_at).toLocaleString() : uploadedDate;
              const manualSummaryText = doc.manual_summary || 'No manual summary provided.';
              const aiSummaryText = doc.ai_summary || 'No AI summary available.';

              return (
                <div
                  key={doc.id || index}
                  style={{
                    borderBottom: index < uploadedDocuments.length - 1 ? '1px solid #e5e7eb' : 'none',
                    backgroundColor: isEditing ? '#eef2ff' : 'transparent',
                    transition: 'background-color 0.2s ease'
                  }}
                >
                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: '1.6fr 1.2fr 1fr 1fr 1fr 220px',
                      gap: '16px',
                      padding: '12px 16px',
                      alignItems: 'center',
                      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
                    }}
                  >
                    <div style={{
                      fontSize: '14px',
                      color: '#374151',
                      fontWeight: '500',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '6px'
                    }}>
                      {isEditing ? (
                        <input
                          type="text"
                          value={metadataForm.documentName}
                          onChange={(e) => handleMetadataFieldChange('documentName', e.target.value)}
                          placeholder="Document name"
                          style={{
                            padding: '8px',
                            border: '1px solid #cbd5f5',
                            borderRadius: '4px',
                            fontSize: '13px'
                          }}
                        />
                      ) : (
                        <span title={doc.document_name || doc.original_filename || 'Untitled Document'}>
                          {doc.document_name || doc.original_filename || 'Untitled Document'}
                        </span>
                      )}
                      <span style={{ fontSize: '12px', color: '#6b7280' }}>
                        {doc.original_filename || '—'}
                      </span>
                    </div>

                    <div style={{ fontSize: '13px', color: '#374151' }}>
                      {isEditing ? (
                        <input
                          type="text"
                          value={metadataForm.safeFileName}
                          onChange={(e) => handleMetadataFieldChange('safeFileName', e.target.value)}
                          placeholder="File name"
                          style={{
                            padding: '8px',
                            border: '1px solid #cbd5f5',
                            borderRadius: '4px',
                            fontSize: '13px'
                          }}
                        />
                      ) : (
                        doc.safe_file_name || '—'
                      )}
                    </div>

                    <div style={{ fontSize: '13px', color: '#374151' }}>
                      {isEditing ? (
                        <input
                          type="text"
                          value={metadataForm.version}
                          onChange={(e) => handleMetadataFieldChange('version', e.target.value)}
                          placeholder="e.g. 1.0"
                          style={{
                            padding: '8px',
                            border: '1px solid #cbd5f5',
                            borderRadius: '4px',
                            fontSize: '13px'
                          }}
                        />
                      ) : (
                        doc.version || '—'
                      )}
                    </div>

                    <div style={{ fontSize: '13px', color: '#374151' }}>
                      {isEditing ? (
                        <input
                          type="text"
                          value={metadataForm.documentType}
                          onChange={(e) => handleMetadataFieldChange('documentType', e.target.value)}
                          placeholder="Document type"
                          style={{
                            padding: '8px',
                            border: '1px solid #cbd5f5',
                            borderRadius: '4px',
                            fontSize: '13px'
                          }}
                        />
                      ) : (
                        doc.document_type || 'uploaded_document'
                      )}
                    </div>

                    <div style={{ fontSize: '13px', color: '#374151' }}>
                      <div>{uploadedDate}</div>
                      <div style={{ fontSize: '12px', color: '#6b7280' }}>Updated {updatedDate}</div>
                    </div>

                    <div style={{
                      display: 'flex',
                      gap: '8px',
                      flexWrap: 'wrap',
                      justifyContent: 'flex-end'
                    }}>
                      {isEditing ? (
                        <>
                          <button
                            onClick={saveMetadataChanges}
                            disabled={metadataSaving}
                            style={{
                              padding: '8px 16px',
                              backgroundColor: metadataSaving ? '#9ca3af' : '#16a34a',
                              color: '#ffffff',
                              border: 'none',
                              borderRadius: '4px',
                              fontSize: '12px',
                              fontWeight: '500',
                              cursor: metadataSaving ? 'not-allowed' : 'pointer'
                            }}
                          >
                            {metadataSaving ? 'Saving...' : 'Save Changes'}
                          </button>
                          <button
                            onClick={cancelEditingDocument}
                            disabled={metadataSaving}
                            style={{
                              padding: '8px 16px',
                              backgroundColor: '#e5e7eb',
                              color: '#374151',
                              border: 'none',
                              borderRadius: '4px',
                              fontSize: '12px',
                              fontWeight: '500',
                              cursor: metadataSaving ? 'not-allowed' : 'pointer'
                            }}
                          >
                            Cancel
                          </button>
                        </>
                      ) : (
                          <>
                            <a
                              href={downloadUploadedDocumentUrl({ documentId: doc.id })}
                            download
                            style={{
                              padding: '8px 16px',
                              backgroundColor: '#4338ca',
                              color: '#ffffff',
                              textDecoration: 'none',
                              borderRadius: '4px',
                              fontSize: '12px',
                              fontWeight: '500'
                            }}
                          >
                            Download
                          </a>
                          <button
                            onClick={() => startEditingDocument(doc)}
                            style={{
                              padding: '8px 16px',
                              backgroundColor: '#2563eb',
                              color: '#ffffff',
                              border: 'none',
                              borderRadius: '4px',
                              fontSize: '12px',
                              fontWeight: '500',
                              cursor: 'pointer'
                            }}
                          >
                            Edit
                          </button>
                          <button
                            onClick={() => handleDeleteUploadedDocument(doc)}
                            disabled={deletingDocumentId === doc.id}
                            style={{
                              padding: '8px 16px',
                              backgroundColor: '#dc2626',
                              color: '#ffffff',
                              border: 'none',
                              borderRadius: '4px',
                              fontSize: '12px',
                              fontWeight: '500',
                              cursor: deletingDocumentId === doc.id ? 'not-allowed' : 'pointer',
                              opacity: deletingDocumentId === doc.id ? 0.7 : 1
                            }}
                          >
                            {deletingDocumentId === doc.id ? 'Deleting...' : 'Delete'}
                          </button>
                        </>
                      )}
                    </div>
                  </div>

                  <div style={{
                    padding: '0 16px 16px 16px',
                    backgroundColor: isEditing ? '#eef2ff' : '#f9fafb',
                    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
                    borderTop: '1px solid #e5e7eb'
                  }}>
                    <div style={{
                      display: 'grid',
                      gap: '16px',
                      gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))'
                    }}>
                      <div>
                        <div style={{
                          fontSize: '12px',
                          color: '#6b7280',
                          marginBottom: '6px',
                          fontWeight: '500'
                        }}>
                          Manual Summary
                        </div>
                        {isEditing ? (
                          <textarea
                            value={metadataForm.manualSummary}
                            onChange={(e) => handleMetadataFieldChange('manualSummary', e.target.value)}
                            placeholder="Add your own description to help teammates find this document"
                            rows={4}
                            style={{
                              width: '100%',
                              padding: '10px',
                              border: '1px solid #cbd5f5',
                              borderRadius: '6px',
                              fontSize: '13px',
                              resize: 'vertical'
                            }}
                          />
                        ) : (
                          <p style={{
                            margin: 0,
                            fontSize: '13px',
                            color: '#374151',
                            lineHeight: 1.5
                          }}>
                            {manualSummaryText}
                          </p>
                        )}
                      </div>

                      <div>
                        <div style={{
                          fontSize: '12px',
                          color: '#6b7280',
                          marginBottom: '6px',
                          fontWeight: '500'
                        }}>
                          AI Summary
                        </div>
                        {isEditing ? (
                          <textarea
                            value={metadataForm.aiSummary}
                            onChange={(e) => handleMetadataFieldChange('aiSummary', e.target.value)}
                            placeholder="Short description to help teammates find this document"
                            rows={4}
                            style={{
                              width: '100%',
                              padding: '10px',
                              border: '1px solid #cbd5f5',
                              borderRadius: '6px',
                              fontSize: '13px',
                              resize: 'vertical'
                            }}
                          />
                        ) : (
                          <p style={{
                            margin: 0,
                            fontSize: '13px',
                            color: '#374151',
                            lineHeight: 1.5
                          }}>
                            {aiSummaryText}
                          </p>
                        )}
                      </div>
                    </div>

                    <div style={{
                      marginTop: '10px',
                      fontSize: '12px',
                      color: '#6b7280'
                    }}>
                      {formatFileSize(Number(doc.file_size) || 0)} • {doc.mime_type || 'Unknown MIME type'}
                    </div>
                    {isEditing && (
                      <div
                        style={{
                          marginTop: '16px',
                          display: 'flex',
                          flexWrap: 'wrap',
                          gap: '8px',
                          justifyContent: 'flex-end'
                        }}
                      >
                        <button
                          onClick={saveMetadataChanges}
                          disabled={metadataSaving}
                          style={{
                            padding: '10px 18px',
                            backgroundColor: metadataSaving ? '#9ca3af' : '#16a34a',
                            color: '#ffffff',
                            border: 'none',
                            borderRadius: '6px',
                            fontSize: '13px',
                            fontWeight: '600',
                            cursor: metadataSaving ? 'not-allowed' : 'pointer',
                            boxShadow: '0 1px 2px rgba(16, 185, 129, 0.25)'
                          }}
                        >
                          {metadataSaving ? 'Saving…' : 'Save Metadata Changes'}
                        </button>
                        <button
                          onClick={cancelEditingDocument}
                          disabled={metadataSaving}
                          style={{
                            padding: '10px 18px',
                            backgroundColor: '#f3f4f6',
                            color: '#374151',
                            border: '1px solid #e5e7eb',
                            borderRadius: '6px',
                            fontSize: '13px',
                            fontWeight: '500',
                            cursor: metadataSaving ? 'not-allowed' : 'pointer'
                          }}
                        >
                          Cancel
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <style jsx>{`
        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}
