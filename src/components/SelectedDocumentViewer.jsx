import React from 'react';

const SelectedDocumentViewer = React.forwardRef(({ selectedDocuments, onDocumentsSelected, referencedDocuments = [], referencedExternalResources = [] }, ref) => {
  const [activeDocument, setActiveDocument] = React.useState(null);
  const [documentContent, setDocumentContent] = React.useState('');
  const [htmlContent, setHtmlContent] = React.useState(null);
  const [isLoading, setIsLoading] = React.useState(false);
  const [isEditMode, setIsEditMode] = React.useState(false);
  const [editableContent, setEditableContent] = React.useState('');
  const [originalContent, setOriginalContent] = React.useState('');
  
  // Version history state
  const [documentVersions, setDocumentVersions] = React.useState([]);
  const [currentVersionIndex, setCurrentVersionIndex] = React.useState(0);
  const [workflowInstanceId, setWorkflowInstanceId] = React.useState(null);
  const [isRepolishing, setIsRepolishing] = React.useState(false);

  // Helper functions for document display
  const getDocumentDisplayName = (doc) => {
    return doc?.document_name || doc?.name || doc?.safeFileName || doc?.safe_file_name || 'Unknown Document';
  };

  const getDocumentDisplayNumber = (doc) => {
    return doc?.document_number || doc?.documentNumber || doc?.number || '';
  };

  const handleOpenDocument = React.useCallback(async (document) => {
    console.log('handleOpenDocument called with:', document);
    
    // Clean up previous blob URL to prevent memory leaks
    if (documentContent && documentContent.startsWith('blob:')) {
      URL.revokeObjectURL(documentContent);
    }
    
    setIsLoading(true);
    setActiveDocument(document);
    
    try {
      // Check if this is an uploaded document
      if (document.isUploaded || document.source_type === 'upload') {
        console.log('Handling uploaded document:', document);
        
        // For uploaded documents, we need to download them using the download API
        const { downloadUploadedDocumentUrl } = await import('../api');
        const downloadUrl = downloadUploadedDocumentUrl({ 
          documentId: document.veeva_document_id || document.id || document.document_id 
        });
        
        try {
          const response = await fetch(downloadUrl);
          if (!response.ok) {
            throw new Error(`Failed to download uploaded document: ${response.status} ${response.statusText}`);
          }
          
          const blob = await response.blob();
          const fileType = response.headers.get('content-type') || 'application/octet-stream';
          
          console.log('Uploaded document downloaded:', {
            size: blob.size,
            type: fileType
          });

          // Determine the file name with proper extension
          let fileName = document.name || document.document_name || 'document';
          
          // If the document name doesn't have an extension, try to infer it from content-type
          if (!fileName.includes('.')) {
            const extensionMap = {
              'application/pdf': '.pdf',
              'application/vnd.openxmlformats-officedocument.wordprocessingml.document': '.docx',
              'application/msword': '.doc',
              'text/plain': '.txt',
              'application/rtf': '.rtf'
            };
            
            const extension = extensionMap[fileType] || '';
            fileName = fileName + extension;
          }

          console.log('Using filename for uploaded document:', fileName);

          // Check if it's already a PDF
          const isPdf = fileType.includes('pdf') || fileName.toLowerCase().endsWith('.pdf');
          
          if (isPdf) {
            // For PDFs, create a blob URL and display directly
            const url = URL.createObjectURL(blob);
            setDocumentContent(url);
            setIsLoading(false);
            return;
          } else {
            // For other file types, convert to PDF first
            console.log('Converting uploaded document to PDF...');
            
            const formData = new FormData();
            formData.append('file', blob, fileName);
            
            const convertResponse = await fetch('/api/convert-to-pdf', {
              method: 'POST',
              body: formData
            });
            
            if (!convertResponse.ok) {
              throw new Error(`Failed to convert document: ${convertResponse.status} ${convertResponse.statusText}`);
            }
            
            const convertedBlob = await convertResponse.blob();
            const convertedUrl = URL.createObjectURL(convertedBlob);
            setDocumentContent(convertedUrl);
            setIsLoading(false);
            return;
          }
        } catch (error) {
          console.error('Error handling uploaded document:', error);
          setDocumentContent(`Error loading uploaded document: ${error.message}`);
          setIsLoading(false);
          return;
        }
      }
      
      // Check if this is a workflow-generated document with text content
      if (document.isWorkflowDocument && document.content) {
        console.log('Displaying workflow-generated document with text content');
        
        // Extract workflow instance ID (format: workflow_123 or numeric ID)
        const instanceId = document.veeva_document_id?.toString().replace('workflow_', '');
        setWorkflowInstanceId(instanceId);
        
        // Initialize version history
        const versions = document.documentVersions || [];
        setDocumentVersions(versions);
        
        // If versions exist, show the latest one by default
        if (versions.length > 0) {
          const latestVersion = versions[versions.length - 1];
          setEditableContent(latestVersion.content);
          setOriginalContent(latestVersion.content);
          setCurrentVersionIndex(versions.length - 1);
        } else {
          // Fallback to document.content if no versions
          setEditableContent(document.content);
          setOriginalContent(document.content);
          setCurrentVersionIndex(0);
        }
        
        setIsEditMode(false); // Start in view mode
        
        // Create a simple HTML document to display the text
        const htmlContent = `
          <!DOCTYPE html>
          <html>
          <head>
            <meta charset="utf-8">
            <style>
              body {
                font-family: 'Calibri', 'Arial', sans-serif;
                font-size: 11pt;
                line-height: 1.6;
                padding: 40px;
                max-width: 800px;
                margin: 0 auto;
                background-color: #ffffff;
                color: #000000;
              }
              pre {
                white-space: pre-wrap;
                word-wrap: break-word;
                font-family: 'Calibri', 'Arial', sans-serif;
                margin: 0;
                padding: 0;
              }
              h1 {
                font-size: 16pt;
                font-weight: bold;
                margin-bottom: 12pt;
                border-bottom: 2px solid #000;
                padding-bottom: 6pt;
              }
              .header {
                background-color: #f8fafc;
                padding: 16px;
                border-radius: 8px;
                margin-bottom: 20px;
                border: 1px solid #e5e7eb;
              }
              .badge {
                display: inline-block;
                padding: 4px 8px;
                background-color: #4338ca;
                color: white;
                border-radius: 4px;
                font-size: 10pt;
                margin-right: 8px;
              }
            </style>
          </head>
          <body>
            <div class="header">
              <h1>${document.document_name}</h1>
              <span class="badge">${document.document_type}</span>
              <span class="badge">Version ${document.version}</span>
            </div>
            <pre>${document.content}</pre>
          </body>
          </html>
        `;
        
        const blob = new Blob([htmlContent], { type: 'text/html' });
        const url = URL.createObjectURL(blob);
        setDocumentContent(url);
        setIsLoading(false);
        return;
      }
      // Download and convert document to viewable format (HTML or PDF)
      const versionParts = document.version ? document.version.split('.') : ['1', '0'];
      const major = versionParts[0] || 1;
      const minor = versionParts[1] || 0;
      
      console.log('Loading document for viewing...', { docId: document.veeva_document_id, major, minor });
      
      try {
        // First, download the original document
        const originalUrl = `/api/download-file?docId=${document.veeva_document_id}&major=${major}&minor=${minor}`;
        console.log('Downloading original document from URL:', originalUrl);
        
        const originalResponse = await fetch(originalUrl);
        if (!originalResponse.ok) {
          throw new Error(`Failed to download original document: ${originalResponse.status} ${originalResponse.statusText}`);
        }
        
        const originalBlob = await originalResponse.blob();
        const fileType = originalResponse.headers.get('content-type') || 'application/octet-stream';
        
        console.log('Original document downloaded:', {
          size: originalBlob.size,
          type: fileType
        });

        // Determine the file name with proper extension
        let fileName = document.document_name || 'document';
        
        // If the document name doesn't have an extension, try to infer it from content-type
        if (!fileName.includes('.')) {
          const extensionMap = {
            'application/pdf': '.pdf',
            'application/vnd.openxmlformats-officedocument.wordprocessingml.document': '.docx',
            'application/msword': '.doc',
            'text/plain': '.txt',
            'application/rtf': '.rtf'
          };
          
          const extension = extensionMap[fileType] || '';
          fileName = fileName + extension;
        }

        console.log('Using filename for conversion:', fileName);

        // Check if it's already a PDF
        const isPdf = fileType.includes('pdf') || fileName.toLowerCase().endsWith('.pdf');
        
        if (isPdf) {
          // It's already a PDF, display it directly
          const pdfObjectUrl = URL.createObjectURL(originalBlob);
          console.log('Document is already a PDF, displaying directly');
          setDocumentContent(pdfObjectUrl);
          setHtmlContent(null);
        } else {
          // Convert document to HTML (preserves formatting for DOCX)
          const formData = new FormData();
          formData.append('file', originalBlob, fileName);
          formData.append('output', 'html');

          // Send the file to conversion service
          const convertResponse = await fetch('/api/convert-to-pdf', {
            method: 'POST',
            body: formData
          });
          
          if (!convertResponse.ok) {
            console.warn(`Document conversion failed: ${convertResponse.status} ${convertResponse.statusText}`);
            throw new Error('Document conversion service unavailable');
          }
          
          const convertedBlob = await convertResponse.blob();
          const responseType = convertResponse.headers.get('content-type') || '';
          
          console.log('Document conversion successful:', {
            size: convertedBlob.size,
            type: responseType
          });
          
          // Validate the converted content
          if (convertedBlob.size === 0) {
            throw new Error('Converted document is empty');
          }
          
          // Check if response is HTML
          if (responseType.includes('html')) {
            // Read blob as text and store HTML content directly
            const htmlText = await convertedBlob.text();
            console.log('HTML content loaded, length:', htmlText.length);
            setHtmlContent(htmlText);
            setDocumentContent(''); // Clear blob URL
          } else {
            // For other formats (PDF), create blob URL
            const objectUrl = URL.createObjectURL(convertedBlob);
            setDocumentContent(objectUrl);
            setHtmlContent(null);
          }
        }
        
      } catch (convertError) {
        console.error('Document loading/conversion failed:', convertError.message);
        setDocumentContent(`Error loading document: ${convertError.message}. Please use the download button to view the original document.`);
      }
      
    } catch (error) {
      console.error('Error converting/loading document:', error);
      setDocumentContent(`Error loading document: ${error.message}`);
    } finally {
      setIsLoading(false);
    }
  }, [documentContent]);

  const handleCloseDocument = () => {
    // Clean up blob URL to prevent memory leaks
    if (documentContent && documentContent.startsWith('blob:')) {
      URL.revokeObjectURL(documentContent);
    }
    setActiveDocument(null);
    setDocumentContent('');
    setHtmlContent(null);
    setIsEditMode(false);
    setEditableContent('');
    setOriginalContent('');
    setDocumentVersions([]);
    setCurrentVersionIndex(0);
    setWorkflowInstanceId(null);
    setIsRepolishing(false);
  };

  const handleRepolishDocument = async () => {
    if (!workflowInstanceId || !editableContent) {
      alert('Cannot re-polish: Missing workflow instance or document content');
      return;
    }

    setIsRepolishing(true);
    
    try {
      console.log('Re-polishing document...', { instanceId: workflowInstanceId });
      
      const { repolishWorkflowDocument } = await import('../api');
      const result = await repolishWorkflowDocument({
        instanceId: workflowInstanceId,
        editedDocument: editableContent
      });

      if (result.success) {
        console.log('Re-polish successful:', result);
        
        // Update version history
        setDocumentVersions(result.versions);
        
        // Switch to the newly polished version (last in array)
        setCurrentVersionIndex(result.versions.length - 1);
        setEditableContent(result.polishedDocument);
        setOriginalContent(result.polishedDocument);
        
        // Exit edit mode to show the polished version
        setIsEditMode(false);
        
        // Show success message with AI suggestions
        const message = result.hasAiImprovements 
          ? `✨ Document re-polished successfully!\n\n${result.aiSuggestions}\n\nYou are now viewing Version ${result.currentVersion}.`
          : 'Document processed. No changes were needed.';
        
        alert(message);
      } else {
        throw new Error(result.error || 'Re-polish failed');
      }
    } catch (error) {
      console.error('Error re-polishing document:', error);
      alert(`Failed to re-polish document: ${error.message}`);
    } finally {
      setIsRepolishing(false);
    }
  };

  const handleVersionChange = (versionIndex) => {
    if (documentVersions[versionIndex]) {
      const version = documentVersions[versionIndex];
      setCurrentVersionIndex(versionIndex);
      setEditableContent(version.content);
      setOriginalContent(version.content);
      
      // Exit edit mode when switching versions
      if (isEditMode) {
        setIsEditMode(false);
      }
    }
  };

  const exportToWord = (documentContent, workflowName) => {
    try {
      // Create HTML structure for Word
      const htmlContent = `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <title>${workflowName}</title>
          <style>
            body {
              font-family: 'Calibri', 'Arial', sans-serif;
              font-size: 11pt;
              line-height: 1.5;
              margin: 1in;
            }
            pre {
              white-space: pre-wrap;
              font-family: 'Calibri', 'Arial', sans-serif;
            }
          </style>
        </head>
        <body>
          <pre>${documentContent}</pre>
        </body>
        </html>
      `;

      // Create Blob and download
      const blob = new Blob([htmlContent], { 
        type: 'application/msword' 
      });

      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      
      // Generate filename with timestamp
      const timestamp = new Date().toISOString().slice(0, 10);
      const filename = `${workflowName.replace(/\s+/g, '_')}_${timestamp}.doc`;
      link.download = filename;
      
      // Trigger download
      document.body.appendChild(link);
      link.click();
      
      // Cleanup
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      console.log('Document exported successfully:', filename);
    } catch (error) {
      console.error('Error exporting to Word:', error);
      alert('Failed to export document. Please try copying the text instead.');
    }
  };

  const handleRemoveDocument = (documentToRemove) => {
    onDocumentsSelected(selectedDocuments.filter(doc => doc.veeva_document_id !== documentToRemove.veeva_document_id));
  };

  // Expose handleOpenDocument function to parent component
  React.useImperativeHandle(ref, () => ({
    handleOpenDocument
  }), [handleOpenDocument]);

  // Debug logging
  React.useEffect(() => {
    console.log('SelectedDocumentViewer mounted, ref should be available');
  }, []);

  // Cleanup blob URL on unmount
  React.useEffect(() => {
    return () => {
      if (documentContent && documentContent.startsWith('blob:')) {
        URL.revokeObjectURL(documentContent);
      }
    };
  }, [documentContent]);

  return (
    <>
      <div style={{
        backgroundColor: '#ffffff',
        border: '1px solid #e5e7eb',
        borderRadius: '8px',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        boxShadow: '0 1px 3px 0 rgba(0, 0, 0, 0.1)'
      }}>
        {/* Header */}
        <div style={{
          padding: '10px 14px',
          borderBottom: '1px solid #e5e7eb',
          backgroundColor: '#f8fafc',
          borderTopLeftRadius: '8px',
          borderTopRightRadius: '8px'
        }}>
          <h3 style={{
            margin: 0,
            fontSize: '14px',
            fontWeight: '600',
            color: '#374151',
            fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
          }}>
            Workspace
          </h3>
        </div>

        {/* Content */}
        <div style={{
          flex: 1,
          overflow: 'auto',
          padding: '12px'
        }}>
          {activeDocument ? (
            /* Document Content View */
            <div style={{
              height: '100%',
              display: 'flex',
              flexDirection: 'column'
            }}>
              {/* Document Header */}
              <div style={{
                padding: '16px',
                backgroundColor: '#f8fafc',
                border: '1px solid #e5e7eb',
                borderRadius: '8px',
                marginBottom: '16px',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center'
              }}>
                <div>
                  <h4 style={{
                    margin: '0 0 4px 0',
                    fontSize: '18px',
                    fontWeight: '600',
                    color: '#374151',
                    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
                  }}>
                    {activeDocument.document_name}
                  </h4>
                  <div style={{
                    fontSize: '14px',
                    color: '#6b7280',
                    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
                  }}>
                    {activeDocument.document_type} • Version {activeDocument.version} • {activeDocument.document_number}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                  {activeDocument.isWorkflowDocument && (
                    <>
                      {/* Version Selector */}
                      {documentVersions.length > 1 && (
                        <select
                          value={currentVersionIndex}
                          onChange={(e) => handleVersionChange(parseInt(e.target.value))}
                          disabled={isEditMode}
                          style={{
                            padding: '8px 12px',
                            backgroundColor: '#ffffff',
                            color: '#374151',
                            border: '1px solid #d1d5db',
                            borderRadius: '6px',
                            fontSize: '13px',
                            fontWeight: '500',
                            cursor: isEditMode ? 'not-allowed' : 'pointer',
                            fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
                            opacity: isEditMode ? 0.5 : 1
                          }}
                        >
                          {documentVersions.map((version, index) => {
                            const date = new Date(version.created_at).toLocaleString('en-US', {
                              month: 'short',
                              day: 'numeric',
                              hour: '2-digit',
                              minute: '2-digit'
                            });
                            const typeLabel = {
                              original: 'Original',
                              ai_polished: 'AI Polished',
                              user_edited: 'User Edited',
                              ai_repolished: 'AI Re-polished'
                            }[version.type] || version.type;
                            
                            return (
                              <option key={index} value={index}>
                                v{version.version} ({typeLabel} - {date})
                              </option>
                            );
                          })}
                        </select>
                      )}
                      
                      <button
                        onClick={() => {
                          if (isEditMode) {
                            // Save changes
                            setIsEditMode(false);
                          } else {
                            // Enter edit mode
                            setIsEditMode(true);
                          }
                        }}
                        style={{
                          padding: '8px 16px',
                          backgroundColor: isEditMode ? '#16a34a' : '#3b82f6',
                          color: '#ffffff',
                          border: 'none',
                          borderRadius: '6px',
                          fontSize: '14px',
                          cursor: 'pointer',
                          fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
                          transition: 'background-color 0.2s ease'
                        }}
                        onMouseEnter={(e) => e.target.style.backgroundColor = isEditMode ? '#15803d' : '#2563eb'}
                        onMouseLeave={(e) => e.target.style.backgroundColor = isEditMode ? '#16a34a' : '#3b82f6'}
                      >
                        {isEditMode ? '💾 Save Edits' : '✏️ Edit Document'}
                      </button>
                      
                      {isEditMode && editableContent !== originalContent && (
                        <button
                          onClick={() => {
                            setEditableContent(originalContent);
                            setIsEditMode(false);
                          }}
                          style={{
                            padding: '8px 16px',
                            backgroundColor: '#dc2626',
                            color: '#ffffff',
                            border: 'none',
                            borderRadius: '6px',
                            fontSize: '14px',
                            cursor: 'pointer',
                            fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
                            transition: 'background-color 0.2s ease'
                          }}
                          onMouseEnter={(e) => e.target.style.backgroundColor = '#b91c1c'}
                          onMouseLeave={(e) => e.target.style.backgroundColor = '#dc2626'}
                        >
                          ↺ Revert Changes
                        </button>
                      )}
                      
                      {/* Re-polish Button - Shows when user has made edits */}
                      {isEditMode && editableContent !== originalContent && workflowInstanceId && (
                        <button
                          onClick={handleRepolishDocument}
                          disabled={isRepolishing}
                          style={{
                            padding: '8px 16px',
                            backgroundColor: isRepolishing ? '#9ca3af' : '#8b5cf6',
                            color: '#ffffff',
                            border: 'none',
                            borderRadius: '6px',
                            fontSize: '14px',
                            fontWeight: '500',
                            cursor: isRepolishing ? 'not-allowed' : 'pointer',
                            fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
                            transition: 'background-color 0.2s ease',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '6px'
                          }}
                          onMouseEnter={(e) => !isRepolishing && (e.target.style.backgroundColor = '#7c3aed')}
                          onMouseLeave={(e) => !isRepolishing && (e.target.style.backgroundColor = '#8b5cf6')}
                        >
                          {isRepolishing ? (
                            <>
                              <span style={{
                                display: 'inline-block',
                                width: '12px',
                                height: '12px',
                                border: '2px solid #ffffff',
                                borderTop: '2px solid transparent',
                                borderRadius: '50%',
                                animation: 'spin 1s linear infinite'
                              }}></span>
                              Re-polishing...
                            </>
                          ) : (
                            <>✨ Re-polish with AI</>
                          )}
                        </button>
                      )}
                      
                      <button
                        onClick={() => {
                          // Always export the editableContent (which contains saved edits)
                          exportToWord(editableContent, activeDocument.document_name);
                        }}
                        style={{
                          padding: '8px 16px',
                          backgroundColor: '#16a34a',
                          color: '#ffffff',
                          border: 'none',
                          borderRadius: '6px',
                          fontSize: '14px',
                          cursor: 'pointer',
                          fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
                          transition: 'background-color 0.2s ease'
                        }}
                        onMouseEnter={(e) => e.target.style.backgroundColor = '#15803d'}
                        onMouseLeave={(e) => e.target.style.backgroundColor = '#16a34a'}
                      >
                        📄 Export to Word
                      </button>
                    </>
                  )}
                  {!activeDocument.isWorkflowDocument && (
                    <button
                      onClick={() => {
                        const url = `/api/download-file?docId=${activeDocument.veeva_document_id}&major=${activeDocument.version?.split('.')[0] || 1}&minor=${activeDocument.version?.split('.')[1] || 0}`;
                        const link = document.createElement('a');
                        link.href = url;
                        link.download = activeDocument.document_name;
                        link.click();
                      }}
                      style={{
                        padding: '8px 16px',
                        backgroundColor: '#10b981',
                        color: '#ffffff',
                        border: 'none',
                        borderRadius: '6px',
                        fontSize: '14px',
                        cursor: 'pointer',
                        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
                        transition: 'background-color 0.2s ease'
                      }}
                      onMouseEnter={(e) => e.target.style.backgroundColor = '#059669'}
                      onMouseLeave={(e) => e.target.style.backgroundColor = '#10b981'}
                    >
                      📥 Download
                    </button>
                  )}
                  <button
                    onClick={handleCloseDocument}
                    style={{
                      padding: '8px 16px',
                      backgroundColor: '#6b7280',
                      color: '#ffffff',
                      border: 'none',
                      borderRadius: '6px',
                      fontSize: '14px',
                      cursor: 'pointer',
                      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
                      transition: 'background-color 0.2s ease'
                    }}
                    onMouseEnter={(e) => e.target.style.backgroundColor = '#4b5563'}
                    onMouseLeave={(e) => e.target.style.backgroundColor = '#6b7280'}
                  >
                    ← Back to List
                  </button>
                </div>
              </div>

              {/* Document Content */}
              <div style={{
                flex: 1,
                backgroundColor: '#ffffff',
                border: '1px solid #e5e7eb',
                borderRadius: '8px',
                overflow: 'hidden',
                display: 'flex',
                flexDirection: 'column'
              }}>
                {activeDocument.isWorkflowDocument && isEditMode ? (
                  /* Rich Text Editor for Workflow Documents */
                  <div style={{
                    flex: 1,
                    display: 'flex',
                    flexDirection: 'column',
                    overflow: 'hidden'
                  }}>
                    <div style={{
                      padding: '12px 16px',
                      backgroundColor: '#fffbeb',
                      border: '1px solid #fef3c7',
                      fontSize: '13px',
                      color: '#92400e',
                      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
                    }}>
                      ✏️ <strong>Edit Mode:</strong> Make your changes below. Click "Save Edits" when done.
                    </div>
                    <textarea
                      value={editableContent}
                      onChange={(e) => setEditableContent(e.target.value)}
                      style={{
                        flex: 1,
                        padding: '20px',
                        border: 'none',
                        resize: 'none',
                        fontSize: '13px',
                        fontFamily: '"Calibri", "Arial", sans-serif',
                        lineHeight: '1.6',
                        outline: 'none',
                        backgroundColor: '#ffffff'
                      }}
                    />
                  </div>
                ) : activeDocument.isWorkflowDocument ? (
                  /* Read-only View for Workflow Documents */
                  <div style={{
                    flex: 1,
                    padding: '20px',
                    overflow: 'auto',
                    backgroundColor: '#ffffff'
                  }}>
                    <pre style={{
                      whiteSpace: 'pre-wrap',
                      wordWrap: 'break-word',
                      fontFamily: '"Calibri", "Arial", sans-serif',
                      fontSize: '13px',
                      lineHeight: '1.6',
                      margin: 0,
                      color: '#000000'
                    }}>
                      {editableContent}
                    </pre>
                  </div>
                ) : isLoading ? (
                  <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    height: '100%',
                    color: '#6b7280'
                  }}>
                    <div style={{ textAlign: 'center' }}>
                      <div style={{ marginBottom: '8px', display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
                        <img src="/loading-icon.png" alt="Loading" style={{ width: '24px', height: '24px' }} />
                      </div>
                      <p style={{ margin: 0, fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif' }}>
                        Loading document content...
                      </p>
                    </div>
                  </div>
                ) : (
                  <div style={{
                    height: '100%',
                    width: '100%'
                  }}>
                    {htmlContent ? (
                      /* HTML Document Viewer using srcdoc */
                      <iframe
                        srcDoc={htmlContent}
                        style={{
                          width: '100%',
                          height: '100%',
                          border: 'none',
                          borderRadius: '4px',
                          backgroundColor: '#ffffff'
                        }}
                        title={`Document Viewer - ${activeDocument.document_name}`}
                        sandbox="allow-same-origin"
                      />
                    ) : (documentContent.startsWith('blob:') || documentContent.startsWith('http')) ? (
                      /* PDF Viewer */
                      <iframe
                        src={documentContent}
                        style={{
                          width: '100%',
                          height: '100%',
                          border: 'none',
                          borderRadius: '4px',
                          backgroundColor: '#ffffff'
                        }}
                        title={`Document Viewer - ${activeDocument.document_name}`}
                        onError={(e) => {
                          console.error('Document iframe error:', e);
                          setDocumentContent('Error loading document viewer. Please try downloading the document.');
                        }}
                      />
                    ) : documentContent.startsWith('PDF documents cannot be displayed') || 
                       documentContent.startsWith('Word documents (DOCX) cannot be displayed') ||
                       documentContent.startsWith('This document appears to be a binary file') ||
                       documentContent.startsWith('This document cannot be displayed inline') ||
                       documentContent.startsWith('Document appears to be empty') ||
                       documentContent.startsWith('Document content could not be read') ||
                       documentContent.startsWith('Error loading document') ? (
                      /* Error State */
                      <div style={{
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        justifyContent: 'center',
                        height: '100%',
                        textAlign: 'center',
                        padding: '40px'
                      }}>
                        <div style={{ fontSize: '48px', marginBottom: '16px' }}>
                          <img src="/work-space-icon.png" alt="Document" style={{ width: '48px', height: '48px' }} />
                        </div>
                        <h4 style={{
                          margin: '0 0 8px 0',
                          color: '#374151',
                          fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
                        }}>
                          Document Preview Not Available
                        </h4>
                        <p style={{
                          margin: '0 0 16px 0',
                          fontSize: '14px',
                          lineHeight: '1.5',
                          color: '#6b7280',
                          maxWidth: '400px',
                          fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
                        }}>
                          {documentContent}
                        </p>
                        <div style={{
                          padding: '12px 20px',
                          backgroundColor: '#f3f4f6',
                          borderRadius: '8px',
                          fontSize: '13px',
                          color: '#6b7280',
                          fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
                        }}>
                          Use the Download button above to save the document to your computer
                        </div>
                      </div>
                    ) : (
                      /* Text Content */
                      <div style={{
                        color: '#374151',
                        lineHeight: '1.6',
                        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
                        whiteSpace: 'pre-wrap',
                        wordWrap: 'break-word',
                        padding: '20px'
                      }}>
                        {documentContent}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          ) : (referencedDocuments.length > 0 || referencedExternalResources.length > 0) ? (
            /* Referenced Documents and External Resources */
            <div style={{
              display: 'flex',
              flexDirection: 'column',
              gap: '16px'
            }}>
              {/* Referenced Documents Section */}
              {referencedDocuments.length > 0 && (
                <div>
                  <div style={{
                    fontSize: '13px',
                    fontWeight: '600',
                    color: '#374151',
                    marginBottom: '12px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
                  }}>
                    📄 Documents referenced in response:
                    {referencedDocuments.length > 5 && (
                      <span style={{ fontSize: '11px', color: '#9ca3af', marginLeft: '4px', fontWeight: '400' }}>
                        (showing {referencedDocuments.length} total)
                      </span>
                    )}
                  </div>
                  <div style={{
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '12px'
                  }}>
                    {referencedDocuments.map((doc, index) => {
                      const displayName = getDocumentDisplayName(doc);
                      const displayNumber = getDocumentDisplayNumber(doc);

                      return (
                        <div key={doc.veeva_document_id || doc.id || index} style={{
                          padding: '16px',
                          backgroundColor: '#f8fafc',
                          border: '1px solid #e5e7eb',
                          borderRadius: '8px',
                          transition: 'all 0.2s ease'
                        }}>
                          <div style={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'flex-start',
                            marginBottom: '8px'
                          }}>
                            <div style={{ flex: 1 }}>
                              <h4 style={{
                                margin: '0 0 3px 0',
                                fontSize: '13px',
                                fontWeight: '600',
                                color: '#374151',
                                fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
                              }}>
                                {displayName}
                              </h4>
                              <div style={{
                                fontSize: '11px',
                                color: '#6b7280',
                                fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
                                marginBottom: '6px'
                              }}>
                                {displayNumber ? `${displayNumber} • ` : ''}Version {doc.version || '1.0'} • {doc.type || doc.document_type || 'Unknown'}
                              </div>
                              {doc.summary && (
                                <p style={{
                                  margin: 0,
                                  fontSize: '12px',
                                  color: '#6b7280',
                                  lineHeight: '1.3',
                                  fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
                                }}>
                                  {doc.summary.length > 150 ? `${doc.summary.substring(0, 150)}...` : doc.summary}
                                </p>
                              )}
                            </div>
                          </div>
                          
                          <div style={{
                            display: 'flex',
                            gap: '8px'
                          }}>
                            <button
                              onClick={() => handleOpenDocument(doc)}
                              style={{
                                padding: '6px 12px',
                                backgroundColor: '#4338ca',
                                color: '#ffffff',
                                border: 'none',
                                borderRadius: '6px',
                                fontSize: '12px',
                                cursor: 'pointer',
                                fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
                                transition: 'background-color 0.2s ease'
                              }}
                              onMouseEnter={(e) => e.target.style.backgroundColor = '#312e81'}
                              onMouseLeave={(e) => e.target.style.backgroundColor = '#4338ca'}
                            >
                              📖 View Document
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* External Resources Section */}
              {referencedExternalResources.length > 0 && (
                <div style={{ marginTop: referencedDocuments.length > 0 ? '8px' : '0' }}>
                  <div style={{
                    fontSize: '13px',
                    fontWeight: '600',
                    color: '#374151',
                    marginBottom: '12px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
                  }}>
                    🔗 Related external resources:
                  </div>
                  <div style={{
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '12px'
                  }}>
                    {referencedExternalResources.map((resource, resIndex) => (
                      <div key={resource.id || resIndex} style={{
                        padding: '16px',
                        backgroundColor: '#f8fafc',
                        border: '1px solid #e5e7eb',
                        borderRadius: '8px',
                        transition: 'all 0.2s ease'
                      }}>
                        <div style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'flex-start',
                          marginBottom: '8px'
                        }}>
                          <div style={{ flex: 1 }}>
                            <h4 style={{
                              margin: '0 0 3px 0',
                              fontSize: '13px',
                              fontWeight: '600',
                              color: '#374151',
                              fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
                            }}>
                              {resource.title}
                            </h4>
                            {resource.description && (
                              <p style={{
                                margin: '4px 0 0 0',
                                fontSize: '12px',
                                color: '#6b7280',
                                lineHeight: '1.3',
                                fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
                              }}>
                                {resource.description}
                              </p>
                            )}
                          </div>
                        </div>
                        
                        <div style={{
                          display: 'flex',
                          gap: '8px'
                        }}>
                          <a
                            href={resource.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            style={{
                              padding: '6px 12px',
                              backgroundColor: '#4338ca',
                              color: '#ffffff',
                              border: 'none',
                              borderRadius: '6px',
                              fontSize: '12px',
                              cursor: 'pointer',
                              fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
                              transition: 'background-color 0.2s ease',
                              textDecoration: 'none',
                              display: 'inline-block'
                            }}
                            onMouseEnter={(e) => e.target.style.backgroundColor = '#312e81'}
                            onMouseLeave={(e) => e.target.style.backgroundColor = '#4338ca'}
                          >
                            🔗 Open Resource
                          </a>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ) : selectedDocuments.length === 0 ? (
            /* No Documents Selected */
            <div style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              height: '100%',
              textAlign: 'center',
              color: '#6b7280'
            }}>
              <div style={{ fontSize: '48px', marginBottom: '16px' }}>
                <img src="/work-space-icon.png" alt="Document" style={{ width: '48px', height: '48px' }} />
              </div>
              <h4 style={{
                margin: '0 0 8px 0',
                color: '#374151',
                fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
              }}>
                No documents selected
              </h4>
            </div>
          ) : (
            /* Document List View */
            <div style={{
              display: 'flex',
              flexDirection: 'column',
              gap: '12px'
            }}>
              {selectedDocuments.map((doc, index) => (
                <div key={doc.veeva_document_id || index} style={{
                  padding: '16px',
                  backgroundColor: '#f8fafc',
                  border: '1px solid #e5e7eb',
                  borderRadius: '8px',
                  transition: 'all 0.2s ease'
                }}>
                  <div style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'flex-start',
                    marginBottom: '8px'
                  }}>
                    <div style={{ flex: 1 }}>
                      <h4 style={{
                        margin: '0 0 3px 0',
                        fontSize: '13px',
                        fontWeight: '600',
                        color: '#374151',
                        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
                      }}>
                        {doc.document_name}
                      </h4>
                      <div style={{
                        fontSize: '11px',
                        color: '#6b7280',
                        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
                        marginBottom: '6px'
                      }}>
                        {doc.document_type} • Version {doc.version} • {doc.document_number}
                      </div>
                      {doc.summary && (
                        <p style={{
                          margin: 0,
                          fontSize: '12px',
                          color: '#6b7280',
                          lineHeight: '1.3',
                          fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
                        }}>
                          {doc.summary.length > 150 ? `${doc.summary.substring(0, 150)}...` : doc.summary}
                        </p>
                      )}
                    </div>
                    <button
                      onClick={() => handleRemoveDocument(doc)}
                      style={{
                        padding: '4px 8px',
                        backgroundColor: '#dc2626',
                        color: '#ffffff',
                        border: 'none',
                        borderRadius: '4px',
                        fontSize: '11px',
                        cursor: 'pointer',
                        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
                        marginLeft: '12px'
                      }}
                      title="Remove from chat"
                    >
                      Remove
                    </button>
                  </div>
                  
                  <div style={{
                    display: 'flex',
                    gap: '8px'
                  }}>
                    <button
                      onClick={() => handleOpenDocument(doc)}
                      style={{
                        padding: '6px 12px',
                        backgroundColor: '#4338ca',
                        color: '#ffffff',
                        border: 'none',
                        borderRadius: '6px',
                        fontSize: '12px',
                        cursor: 'pointer',
                        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
                        transition: 'background-color 0.2s ease'
                      }}
                      onMouseEnter={(e) => e.target.style.backgroundColor = '#312e81'}
                      onMouseLeave={(e) => e.target.style.backgroundColor = '#4338ca'}
                    >
                      📖 View Document
                    </button>
                    <div style={{
                      padding: '6px 12px',
                      backgroundColor: '#dbeafe',
                      color: '#1e40af',
                      borderRadius: '6px',
                      fontSize: '12px',
                      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '4px'
                    }}>
                      💬 Ready for chat
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

    </>
  );
});

export default SelectedDocumentViewer;

// Add CSS for spinner animation
if (typeof document !== 'undefined') {
  const styleElement = document.createElement('style');
  styleElement.textContent = `
    @keyframes spin {
      0% { transform: rotate(0deg); }
      100% { transform: rotate(360deg); }
    }
  `;
  if (!document.head.querySelector('style[data-component="SelectedDocumentViewer"]')) {
    styleElement.setAttribute('data-component', 'SelectedDocumentViewer');
    document.head.appendChild(styleElement);
  }
}

