import { useState, useRef, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import DocumentViewer from './DocumentViewer.jsx';
import ChatPromptBox from './ChatPromptBox.jsx';
import { chatWithDocuments, createQAInteraction, getUploadedDocuments } from '../api';
import { getSessionId } from '../utils/sessionManager';

// Helper function to estimate token count (rough approximation)
const estimateTokens = (text) => {
  // Rough estimation: 1 token ≈ 4 characters for English text
  // This is a conservative estimate - actual tokenization varies
  // Note: With 8192 token chunks, large documents are better supported
  return Math.ceil(text.length / 4);
};

// Helper function to estimate conversation history tokens
const estimateConversationTokens = (conversationHistory) => {
  return conversationHistory.reduce((total, message) => {
    return total + estimateTokens(message.content || '');
  }, 0);
};

export default function DocumentChat({ isOpen, onClose, selectedDocuments = [], onOpenDocumentInPane, onDocumentsSelected }) {
  const [conversationHistory, setConversationHistory] = useState([]);
  const [currentMessage, setCurrentMessage] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const [usedDocuments, setUsedDocuments] = useState([]);
  const [viewerOpen, setViewerOpen] = useState(false);
  const [selectedDocument, setSelectedDocument] = useState(null);
  const [attachedDocuments, setAttachedDocuments] = useState([]);
  const [isProcessingAttachments, setIsProcessingAttachments] = useState(false);
  const [uploadedBlobs, setUploadedBlobs] = useState([]);
  const [purgeUploadsOnClear, setPurgeUploadsOnClear] = useState(true);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(null);
  const [userId, setUserId] = useState(null);
  const [notification, setNotification] = useState(null);
  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);
  const fileInputRef = useRef(null);
  const chatPromptBoxRef = useRef(null);
  const uploadedBlobKeysRef = useRef([]);
  const prevLoadingRef = useRef(false);

  const getDocumentSafeName = (doc) => doc?.safeFileName || doc?.safe_file_name || null;
  const isUploadedDocument = (doc) => doc?.source_type === 'upload';
  const getDocumentDisplayName = (doc) => {
    if (!doc) return 'Untitled Document';
    const safeName = getDocumentSafeName(doc);
    const baseName = doc?.name || doc?.document_name || doc?.original_filename || doc?.document_number || 'Untitled Document';
    if (isUploadedDocument(doc)) {
      return safeName || baseName;
    }
    return baseName;
  };
  const getDocumentDisplayNumber = (doc) => {
    if (!doc) return '—';
    if (isUploadedDocument(doc)) {
      return getDocumentSafeName(doc) || doc?.number || doc?.original_filename || doc?.document_name || 'uploaded_document';
    }
    return doc?.number || doc?.document_number || doc?.name || '—';
  };

  useEffect(() => {
    if (isOpen) {
      // Initialize user session
      const sessionId = getSessionId();
      setUserId(sessionId);
      
      // Focus input when chat opens
      setTimeout(() => {
        if (inputRef.current) {
          inputRef.current.focus();
        }
      }, 100);
    }
  }, [isOpen]);

  useEffect(() => {
    uploadedBlobKeysRef.current = uploadedBlobs.map(blob => blob.key);
  }, [uploadedBlobs]);

  const uploadFileToBlob = async (file) => {
    const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB
    if (file.size > MAX_FILE_SIZE) {
      throw new Error(`File "${file.name}" is too large (${(file.size / 1024 / 1024).toFixed(2)}MB). Maximum size is 5MB.`);
    }
    const response = await fetch('/.netlify/functions/blob-upload?includeUrl=true', {
      method: 'POST',
      headers: {
        'Content-Type': file.type || 'application/octet-stream',
        'x-file-name': encodeURIComponent(file.name),
        'x-file-size': file.size.toString()
      },
      body: file
    });

    if (!response.ok) {
      throw new Error(`Upload failed: ${response.status} ${response.statusText}`);
    }

    const result = await response.json();
    if (!result?.key) {
      throw new Error('Upload response missing blob key');
    }

    return {
      key: result.key,
      url: result.url || null,
      createdAt: result.createdAt,
      name: file.name,
      size: file.size,
      type: file.type,
      indexed: result.processingResult?.indexed || false,
      documentId: result.processingResult?.documentId,
      chunksCreated: result.processingResult?.chunksCreated,
      textLength: result.processingResult?.textLength,
      extractionMethod: result.processingResult?.extractionMethod,
      processingError: result.processingResult?.error
    };
  };

  const handleFileUpload = async (files) => {
    if (!files || files.length === 0) return [];

    setIsUploading(true);
    setUploadProgress({ fileName: files[0].name, progress: 0 });

    const uploaded = [];

    try {
      for (let index = 0; index < files.length; index += 1) {
        const file = files[index];
        setUploadProgress({ fileName: file.name, progress: Math.round((index / files.length) * 100) });
        const upload = await uploadFileToBlob(file);
        uploaded.push(upload);
        setUploadProgress({ fileName: file.name, progress: Math.round(((index + 1) / files.length) * 100), success: true });
        console.log('Blob upload completed:', {
          fileName: file.name,
          key: upload.key,
          size: file.size,
          urlReturned: Boolean(upload.url),
          indexed: upload.indexed,
          documentId: upload.documentId,
          chunksCreated: upload.chunksCreated,
          textLength: upload.textLength,
          extractionMethod: upload.extractionMethod,
          processingError: upload.processingError
        });
      }

      if (uploaded.length > 0) {
        setUploadedBlobs(prev => {
          const existingKeys = new Set(prev.map(item => item.key));
          const merged = [...prev];
          uploaded.forEach(item => {
            if (!existingKeys.has(item.key)) {
              merged.push(item);
            }
          });
          return merged;
        });
      }

      return uploaded;
    } catch (error) {
      console.error('Upload error:', error);
      setUploadProgress({ fileName: files[0].name, progress: 0, error: error.message });
      return uploaded;
    } finally {
      setIsUploading(false);
    }
  };

  const purgeUploadedBlobs = async (keys = []) => {
    if (!keys || keys.length === 0) {
      return;
    }

    const uniqueKeys = Array.from(new Set(keys.filter(Boolean)));
    if (uniqueKeys.length === 0) {
      return;
    }

    console.log('Purging uploaded blobs:', uniqueKeys);

    await Promise.allSettled(
      uniqueKeys.map(async (key) => {
        try {
          const response = await fetch('/.netlify/functions/blob-delete', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({ key })
          });

          if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Failed to delete blob ${key}: ${response.status} ${response.statusText} - ${errorText}`);
          }

          console.log('Blob deleted successfully:', key);
        } catch (error) {
          console.error('Error deleting blob:', key, error);
        }
      })
    );
  };

  const triggerFileUpload = () => {
    if (fileInputRef.current) {
      fileInputRef.current.click();
    }
  };

  useEffect(() => {
    // Only scroll to bottom when user sends a message (isLoading becomes true)
    // Don't scroll when AI responds (isLoading becomes false)
    if (isLoading && !prevLoadingRef.current) {
      // User just sent a message - scroll to bottom
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
    prevLoadingRef.current = isLoading;
  }, [conversationHistory, isLoading]);

  useEffect(() => {
    return () => {
      if (purgeUploadsOnClear && uploadedBlobKeysRef.current.length > 0) {
        purgeUploadedBlobs(uploadedBlobKeysRef.current);
      }
    };
  }, [purgeUploadsOnClear]);

  const sendMessage = async (message, files = []) => {
    if (!message.trim() || isLoading) return;

    const userMessage = message.trim();
    setCurrentMessage('');
    setIsLoading(true);
    setError(null);

    // Add user message to conversation
    const newHistory = [...conversationHistory, { role: 'user', content: userMessage }];
    setConversationHistory(newHistory);

    // Handle file upload if files are provided - WAIT for completion
    let newBlobUploads = [];
    if (files && files.length > 0) {
      setIsProcessingAttachments(true);
      
      // Show processing message
      const processingMessage = {
        role: 'assistant',
        content: `📎 Processing ${files.length} file${files.length !== 1 ? 's' : ''} you attached. This will take a moment...`
      };
      setConversationHistory(prev => [...prev, processingMessage]);
      
      // Wait for files to be fully processed
      newBlobUploads = await handleFileUpload(files);

      console.log('Blob upload results:', {
        filesUploaded: files.length,
        successfulUploads: newBlobUploads.length,
        uploadedKeys: newBlobUploads.map(upload => upload.key),
        fileSizes: files.map(f => ({
          name: f.name,
          sizeBytes: f.size,
          estimatedTokens: estimateTokens(f.name)
        }))
      });

      // Check indexing status
      const indexedFiles = newBlobUploads.filter(upload => upload.indexed);
      const failedIndexing = newBlobUploads.filter(upload => !upload.indexed && upload.processingError);
      
      // If not all files uploaded successfully, show detailed error
      if (newBlobUploads.length !== files.length) {
        const failedCount = files.length - newBlobUploads.length;
        const errorMessage = {
          role: 'assistant',
          content: `⚠️ Warning: Only ${newBlobUploads.length} of ${files.length} files uploaded successfully. ${failedCount} file${failedCount !== 1 ? 's' : ''} failed to process. This is usually due to file size limits (files over 5MB may not process correctly) or content complexity. Please try with smaller files.`
        };
        setConversationHistory(prev => [...prev, errorMessage]);
      }
      
      // Show indexing status
      if (failedIndexing.length > 0) {
        const indexingErrorMessage = {
          role: 'assistant',
          content: `⚠️ Warning: ${failedIndexing.length} file${failedIndexing.length !== 1 ? 's' : ''} uploaded but failed to index for AI analysis: ${failedIndexing.map(f => f.name).join(', ')}. The files are stored but I won't be able to analyze their content.`
        };
        setConversationHistory(prev => [...prev, indexingErrorMessage]);
      }
      
      // Remove the processing message and add confirmation
      setConversationHistory(prev => {
        const withoutProcessing = prev.filter(msg => !msg.content.includes('Processing'));
        const statusMessage = indexedFiles.length === newBlobUploads.length 
          ? `✅ Files processed and indexed successfully! Now I can answer your question about the ${newBlobUploads.length} upload${newBlobUploads.length !== 1 ? 's' : ''} you attached.`
          : `✅ Files uploaded successfully! ${indexedFiles.length} of ${newBlobUploads.length} files are ready for AI analysis.`;
        
        return [
          ...withoutProcessing,
          {
            role: 'assistant',
            content: statusMessage
          }
        ];
      });
    }

    try {
      const allDocumentIds = [
        ...selectedDocuments.map(doc => doc.veeva_document_id),
        ...attachedDocuments.map(doc => doc.id),
        ...newBlobUploads.filter(upload => upload.indexed && upload.documentId).map(upload => `uploaded_${upload.documentId}`)
      ];

      const blobAttachmentMap = new Map();
      uploadedBlobs.forEach(item => {
        if (item?.key) {
          blobAttachmentMap.set(item.key, item);
        }
      });
      newBlobUploads.forEach(item => {
        if (item?.key) {
          blobAttachmentMap.set(item.key, item);
        }
      });

      const blobAttachmentsForRequest = Array.from(blobAttachmentMap.values()).map(item => ({
        key: item.key,
        url: item.url,
        createdAt: item.createdAt,
        name: item.name,
        size: item.size,
        type: item.type
      }));
      
      // Log token count information for debugging
      const messageTokens = estimateTokens(userMessage);
      const conversationTokens = estimateConversationTokens(newHistory);
      const totalEstimatedTokens = messageTokens + conversationTokens;
      
      console.log('Token count estimation:', {
        userMessage: {
          text: userMessage.substring(0, 100) + '...',
          tokens: messageTokens
        },
        conversationHistory: {
          messageCount: newHistory.length,
          tokens: conversationTokens
        },
        totalEstimatedTokens: totalEstimatedTokens,
        documentCount: allDocumentIds.length,
        contextWindowLimit: 131072,
        approachingLimit: totalEstimatedTokens > 100000, // Warning threshold
        overLimit: totalEstimatedTokens > 131072
      });
      
      if (totalEstimatedTokens > 100000) {
        console.warn('⚠️ High token count detected! This may cause context window issues.');
      }
      
      if (totalEstimatedTokens > 131072) {
        console.error('❌ Token count exceeds context window limit! Request will likely fail.');
      }
      
      console.log('Sending chat request with document IDs:', {
        selectedDocuments: selectedDocuments.map(doc => doc.veeva_document_id),
        attachedDocuments: attachedDocuments.map(doc => doc.id),
        blobAttachments: blobAttachmentsForRequest.map(item => item.key),
        allDocumentIds,
        message: userMessage.substring(0, 100) + '...',
        attachedDocumentsLength: attachedDocuments.length,
        newUploadCount: newBlobUploads.length,
        totalBlobAttachments: blobAttachmentsForRequest.length,
        selectedDocumentsLength: selectedDocuments.length
      });
      
      // Check if user is asking for comparison but hasn't uploaded any documents
      const isComparisonQuery = userMessage.toLowerCase().includes('compare') || 
                               userMessage.toLowerCase().includes('comparison') ||
                               userMessage.toLowerCase().includes('review') ||
                               userMessage.toLowerCase().includes('errors based on');
      
      // Check if user has documents (either attached or in current message)
      const hasDocuments = allDocumentIds.length > 0 || (files && files.length > 0) || uploadedBlobs.length > 0 || newBlobUploads.length > 0;
      
      if (isComparisonQuery && !hasDocuments) {
        // Add a helpful message about uploading documents
        const helpfulMessage = {
          role: 'assistant',
          content: `I'd be happy to help you compare documents! However, I don't see any documents selected for comparison.

**To compare documents, please:**

1. **Click the + button** (📎) next to the text input to attach your files
2. **Type your comparison question** and click send

The files will upload automatically and I'll be able to perform a detailed comparison analysis for you.

**Supported file types:** PDF, DOC, DOCX, TXT, CSV`
        };
        
        setConversationHistory(prev => [...prev, helpfulMessage]);
        setIsLoading(false);
        return;
      }
      
      const data = await chatWithDocuments({
        message: userMessage,
        documentIds: allDocumentIds,
        conversationHistory: newHistory,
        userId: userId,
        attachments: blobAttachmentsForRequest
      });

      // Update conversation with AI response
      setConversationHistory(data.conversationHistory);
      setUsedDocuments(data.documents);


      // Capture Q&A interaction for storage
      await captureQAInteraction(userMessage, data.response, data.documents);

      console.log('Chat response received:', {
        responseLength: data.response.length,
        documentsUsed: data.documents.length,
        metadata: data.metadata
      });

    } catch (err) {
      console.error('Chat error:', err);
      setError(err.message);
      
      // Add error message to conversation
      setConversationHistory(prev => [
        ...prev,
        { 
          role: 'assistant', 
          content: `I'm sorry, I encountered an error: ${err.message}. Please try again.` 
        }
      ]);
    } finally {
      setIsLoading(false);
      setIsProcessingAttachments(false);
    }
  };

  const handleKeyPress = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage(currentMessage);
    }
  };

  const handleChatPromptSend = ({ message, files }) => {
    sendMessage(message, files);
  };

  const clearConversation = () => {
    setConversationHistory([]);
    setUsedDocuments([]);
    setError(null);
    setAttachedDocuments([]);
    if (purgeUploadsOnClear && uploadedBlobKeysRef.current.length > 0) {
      purgeUploadedBlobs(uploadedBlobKeysRef.current);
    }
    setUploadedBlobs([]);
    // Clear files from ChatPromptBox
    if (chatPromptBoxRef.current) {
      chatPromptBoxRef.current();
    }
  };

  const handleOpenDocument = (document) => {
    const displayName = getDocumentDisplayName(document);
    const displayNumber = getDocumentDisplayNumber(document);

    if (onOpenDocumentInPane) {
      // Route document to the right pane
      const mappedDocument = {
        veeva_document_id: document.id,
        document_name: displayName,
        document_type: document.type,
        version: document.version,
        document_number: displayNumber,
        // Add uploaded document properties
        isUploaded: document.isUploaded || document.source_type === 'upload',
        source_type: document.source_type || 'veeva'
      };
      onOpenDocumentInPane(mappedDocument);
    } else {
      // Fallback to document viewer if no callback provided
      if (document.isUploaded || document.source_type === 'upload') {
        // For uploaded documents, use the download API
        import('../api').then(({ downloadUploadedDocumentUrl }) => {
          const url = downloadUploadedDocumentUrl({ documentId: document.id });
          setSelectedDocument({
            url: url,
            name: displayName
          });
        });
      } else {
        // For Veeva documents, use the regular download API
        setSelectedDocument({
          url: `/api/download-file?docId=${document.id}&major=${document.version.split('.')[0]}&minor=${document.version.split('.')[1]}`,
          name: displayName
        });
      }
      setViewerOpen(true);
    }
  };

  const handleCloseViewer = () => {
    setViewerOpen(false);
    setSelectedDocument(null);
  };

  const captureQAInteraction = async (question, answer, documents) => {
    try {
      console.log('Capturing Q&A interaction:', {
        question: question.substring(0, 100) + '...',
        answer: answer.substring(0, 100) + '...',
        documentsCount: documents.length,
        documents: documents.map(doc => ({
          id: doc.id || doc.veeva_document_id,
          name: getDocumentDisplayName(doc)
        }))
      });

      const documentIds = documents.map(doc => doc.id || doc.veeva_document_id).filter(Boolean);
      const documentNames = documents.map(doc => getDocumentDisplayName(doc)).filter(Boolean);
      
      const result = await createQAInteraction({
        question,
        answer,
        document_ids: documentIds,
        document_names: documentNames,
        user_id: null, // Could be enhanced to capture user info
        session_id: Date.now().toString() // Simple session identifier
      });

      console.log('Q&A interaction captured successfully:', result);
    } catch (error) {
      console.warn('Error capturing Q&A interaction:', error);
      // Don't throw error as this shouldn't break the chat functionality
    }
  };

  const renderMessage = (message, index) => {
    const isUser = message.role === 'user';
    const isAssistant = message.role === 'assistant';
    const isLastAssistantMessage = isAssistant && index === conversationHistory.length - 1;

    const handleCopy = async () => {
      try {
        await navigator.clipboard.writeText(message.content);
        console.log('Message copied to clipboard');
      } catch (err) {
        console.error('Failed to copy text: ', err);
      }
    };

    const handleShare = async () => {
      if (navigator.share) {
        try {
          await navigator.share({
            title: 'Chat Response',
            text: message.content,
          });
        } catch (err) {
          console.error('Error sharing:', err);
        }
      } else {
        // Fallback: copy to clipboard
        handleCopy();
      }
    };

    const handleRegenerate = () => {
      console.log('Regenerate message');
      // You can implement regeneration logic here
    };

    const handleLike = () => {
      console.log('Message liked');
    };

    const handleDislike = () => {
      console.log('Message disliked');
    };


    return (
        <div
          key={index}
          style={{
            display: 'flex',
            justifyContent: isUser ? 'flex-end' : 'flex-start',
            marginBottom: '16px',
            flexDirection: 'column',
            alignItems: isUser ? 'flex-end' : 'flex-start'
          }}
        >
          <div
            style={{
              maxWidth: isUser ? '80%' : '100%',
              padding: '12px 16px',
              borderRadius: '18px',
              backgroundColor: isUser ? '#6b7280' : 'transparent',
              color: isUser ? 'white' : '#333',
              fontSize: '13px',
              lineHeight: '1.4',
              wordWrap: 'break-word',
              fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
            }}
          >
          {isAssistant ? (
            <div style={{ 
              fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
              fontSize: '13px',
              lineHeight: '1.4'
            }}>
              <ReactMarkdown 
                remarkPlugins={[remarkGfm]}
                components={{
                  p: ({ children }) => <p style={{ margin: '0 0 8px 0', fontFamily: 'inherit' }}>{children}</p>,
                  h1: ({ children }) => <h1 style={{ margin: '0 0 8px 0', fontSize: '16px', fontWeight: '600', fontFamily: 'inherit' }}>{children}</h1>,
                  h2: ({ children }) => <h2 style={{ margin: '0 0 8px 0', fontSize: '15px', fontWeight: '600', fontFamily: 'inherit' }}>{children}</h2>,
                  h3: ({ children }) => <h3 style={{ margin: '0 0 8px 0', fontSize: '14px', fontWeight: '600', fontFamily: 'inherit' }}>{children}</h3>,
                  ul: ({ children }) => <ul style={{ margin: '0 0 8px 0', paddingLeft: '20px', fontFamily: 'inherit' }}>{children}</ul>,
                  ol: ({ children }) => <ol style={{ margin: '0 0 8px 0', paddingLeft: '20px', fontFamily: 'inherit' }}>{children}</ol>,
                  li: ({ children }) => <li style={{ fontFamily: 'inherit' }}>{children}</li>,
                  strong: ({ children }) => <strong style={{ fontWeight: '600', fontFamily: 'inherit' }}>{children}</strong>,
                  em: ({ children }) => <em style={{ fontStyle: 'italic', fontFamily: 'inherit' }}>{children}</em>,
                  code: ({ children }) => <code style={{ 
                    backgroundColor: '#f1f3f4', 
                    padding: '2px 4px', 
                    borderRadius: '3px', 
                    fontSize: '13px',
                    fontFamily: 'Monaco, "Cascadia Code", "Roboto Mono", Consolas, "Courier New", monospace'
                  }}>{children}</code>,
                  pre: ({ children }) => <pre style={{ 
                    backgroundColor: '#f1f3f4', 
                    padding: '8px', 
                    borderRadius: '4px', 
                    overflow: 'auto',
                    fontSize: '13px',
                    fontFamily: 'Monaco, "Cascadia Code", "Roboto Mono", Consolas, "Courier New", monospace'
                  }}>{children}</pre>,
                  a: ({ node, ...props }) => (
                    <a 
                      {...props} 
                      target="_blank" 
                      rel="noopener noreferrer"
                      style={{
                        color: '#007bff',
                        textDecoration: 'underline',
                        cursor: 'pointer',
                        fontFamily: 'inherit'
                      }}
                    />
                  ),
                  table: ({ children }) => <table style={{ 
                    borderCollapse: 'collapse', 
                    width: '100%', 
                    margin: '12px 0',
                    fontFamily: 'inherit',
                    fontSize: '13px',
                    backgroundColor: 'white',
                    boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
                    borderRadius: '6px',
                    overflow: 'hidden',
                    border: '1px solid #e5e7eb'
                  }}>{children}</table>,
                  thead: ({ children }) => <thead style={{ backgroundColor: '#f8f9fa' }}>{children}</thead>,
                  tbody: ({ children }) => <tbody>{children}</tbody>,
                  th: ({ children }) => <th style={{ 
                    border: '1px solid #e5e7eb', 
                    padding: '12px 8px', 
                    backgroundColor: '#f8f9fa',
                    fontWeight: '600',
                    textAlign: 'left',
                    fontFamily: 'inherit',
                    fontSize: '12px',
                    color: '#495057'
                  }}>{children}</th>,
                  td: ({ children }) => <td style={{ 
                    border: '1px solid #e5e7eb', 
                    padding: '12px 8px',
                    fontFamily: 'inherit',
                    fontSize: '12px',
                    verticalAlign: 'top'
                  }}>{children}</td>,
                  tr: ({ children, ...props }) => <tr style={{
                    '&:nth-child(even)': { backgroundColor: '#f8f9fa' }
                  }}>{children}</tr>
                }}
              >
                {message.content}
              </ReactMarkdown>
            </div>
          ) : (
            message.content
          )}
        </div>

        {/* Action buttons for assistant messages */}
        {isAssistant && (
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              marginTop: '8px',
              padding: '4px 8px',
              backgroundColor: 'rgba(0, 0, 0, 0.05)',
              borderRadius: '6px',
              opacity: 0.7,
              transition: 'opacity 0.2s ease',
              maxWidth: '100%'
            }}
          onMouseEnter={(e) => e.currentTarget.style.opacity = '1'}
          onMouseLeave={(e) => e.currentTarget.style.opacity = '0.7'}
          >
            {/* Copy Button */}
            <button
              onClick={handleCopy}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
                padding: '4px 8px',
                backgroundColor: 'transparent',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer',
                fontSize: '13px',
                color: '#6b7280',
                transition: 'all 0.2s ease',
                fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
              }}
              onMouseEnter={(e) => {
                e.target.style.backgroundColor = '#f3f4f6';
                e.target.style.color = '#374151';
              }}
              onMouseLeave={(e) => {
                e.target.style.backgroundColor = 'transparent';
                e.target.style.color = '#6b7280';
              }}
              title="Copy response"
            >
              <img src="/copy-icon.png" alt="Copy" style={{ width: '16px', height: '16px' }} />
            </button>

            {/* Thumbs Up Button */}
            <button
              onClick={handleLike}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
                padding: '4px 8px',
                backgroundColor: 'transparent',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer',
                fontSize: '13px',
                color: '#6b7280',
                transition: 'all 0.2s ease',
                fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
              }}
              onMouseEnter={(e) => {
                e.target.style.backgroundColor = '#f3f4f6';
                e.target.style.color = '#374151';
              }}
              onMouseLeave={(e) => {
                e.target.style.backgroundColor = 'transparent';
                e.target.style.color = '#6b7280';
              }}
              title="Like this response"
            >
              <img src="/like-icon.png" alt="Like" style={{ width: '16px', height: '16px' }} />
            </button>

            {/* Thumbs Down Button */}
            <button
              onClick={handleDislike}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
                padding: '4px 8px',
                backgroundColor: 'transparent',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer',
                fontSize: '13px',
                color: '#6b7280',
                transition: 'all 0.2s ease',
                fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
              }}
              onMouseEnter={(e) => {
                e.target.style.backgroundColor = '#f3f4f6';
                e.target.style.color = '#374151';
              }}
              onMouseLeave={(e) => {
                e.target.style.backgroundColor = 'transparent';
                e.target.style.color = '#6b7280';
              }}
              title="Dislike this response"
            >
              <img src="/dislike-icon.png" alt="Dislike" style={{ width: '16px', height: '16px' }} />
            </button>

            {/* Share Button */}
            <button
              onClick={handleShare}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
                padding: '4px 8px',
                backgroundColor: 'transparent',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer',
                fontSize: '13px',
                color: '#6b7280',
                transition: 'all 0.2s ease',
                fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
              }}
              onMouseEnter={(e) => {
                e.target.style.backgroundColor = '#f3f4f6';
                e.target.style.color = '#374151';
              }}
              onMouseLeave={(e) => {
                e.target.style.backgroundColor = 'transparent';
                e.target.style.color = '#6b7280';
              }}
              title="Share response"
            >
              <img src="/share-icon.png" alt="Share" style={{ width: '16px', height: '16px' }} />
            </button>

            {/* Regenerate Button */}
            <button
              onClick={handleRegenerate}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
                padding: '4px 8px',
                backgroundColor: 'transparent',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer',
                fontSize: '13px',
                color: '#6b7280',
                transition: 'all 0.2s ease',
                fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
              }}
              onMouseEnter={(e) => {
                e.target.style.backgroundColor = '#f3f4f6';
                e.target.style.color = '#374151';
              }}
              onMouseLeave={(e) => {
                e.target.style.backgroundColor = 'transparent';
                e.target.style.color = '#6b7280';
              }}
              title="Regenerate response"
            >
              <img src="/cycle-icon.png" alt="Regenerate" style={{ width: '16px', height: '16px' }} />
            </button>

          </div>
        )}

        {/* Document opening options for the last assistant message */}
        {isLastAssistantMessage && usedDocuments && usedDocuments.length > 0 && (
          <div style={{
            maxWidth: '100%',
            marginTop: '8px',
            padding: '12px',
            backgroundColor: '#f3f4f6',
            borderRadius: '8px',
            border: '1px solid #d1d5db',
            fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
          }}>
            <div style={{
              fontSize: '12px',
              fontWeight: '600',
              color: '#6b7280',
              marginBottom: '8px',
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
              fontFamily: 'inherit'
            }}>
              📄 Documents referenced in this response:
              {usedDocuments.length > 5 && (
                <span style={{ fontSize: '11px', color: '#9ca3af', marginLeft: '4px' }}>
                  (showing 5 of {usedDocuments.length})
                </span>
              )}
            </div>
            
            <div style={{
              display: 'flex',
              flexDirection: 'column',
              gap: '6px',
              fontFamily: 'inherit'
            }}>
              {usedDocuments.slice(0, 5).map((doc, docIndex) => {
                const displayName = getDocumentDisplayName(doc);
                const displayNumber = getDocumentDisplayNumber(doc);

                return (
                  <div key={docIndex} style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    padding: '8px',
                    backgroundColor: 'white',
                    borderRadius: '6px',
                    border: '1px solid #e0e0e0',
                    fontFamily: 'inherit'
                  }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{
                        fontSize: '13px',
                        fontWeight: '500',
                        color: '#333',
                        marginBottom: '2px',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                        fontFamily: 'inherit'
                      }}>
                        {displayName}
                      </div>
                      <div style={{
                        fontSize: '11px',
                        color: '#666',
                        fontFamily: 'inherit'
                      }}>
                        {displayNumber} • v{doc.version} • {doc.type}
                      </div>
                    </div>
                    <button
                      onClick={() => handleOpenDocument(doc)}
                      style={{
                        padding: '6px 12px',
                        backgroundColor: '#6b7280',
                        color: 'white',
                        border: 'none',
                        borderRadius: '4px',
                        cursor: 'pointer',
                        fontSize: '11px',
                        fontWeight: '500',
                        whiteSpace: 'nowrap',
                        marginLeft: '8px',
                        fontFamily: 'inherit'
                      }}
                    >
                      Open
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    );
  };

  if (!isOpen) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.5)',
          zIndex: 1000,
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          padding: '20px'
        }}
        onClick={onClose}
      >
        {/* Modal */}
        <div
          style={{
            backgroundColor: 'white',
            borderRadius: '12px',
            width: '90%',
            maxWidth: '800px',
            height: '80vh',
            overflow: 'hidden',
            boxShadow: '0 8px 32px rgba(0, 0, 0, 0.3)',
            display: 'flex',
            flexDirection: 'column'
          }}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div style={{
            padding: '16px 20px',
            borderBottom: '1px solid #eee',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            backgroundColor: '#f8f9fa'
          }}>
            <div>
              <h3 style={{ 
                margin: 0, 
                fontSize: '18px',
                color: '#333'
              }}>
                Chat with Documents
              </h3>
              {selectedDocuments.length > 0 || attachedDocuments.length > 0 || uploadedBlobs.length > 0 ? (
                <p style={{
                  margin: '4px 0 0 0',
                  fontSize: '13px',
                  color: '#666'
                }}>
                  {selectedDocuments.length > 0 && `${selectedDocuments.length} Veeva document${selectedDocuments.length !== 1 ? 's' : ''}`}
                  {selectedDocuments.length > 0 && (attachedDocuments.length > 0 || uploadedBlobs.length > 0) && ', '}
                  {attachedDocuments.length > 0 && `${attachedDocuments.length} indexed upload${attachedDocuments.length !== 1 ? 's' : ''}`}
                  {attachedDocuments.length > 0 && uploadedBlobs.length > 0 && ', '}
                  {uploadedBlobs.length > 0 && `${uploadedBlobs.length} chat upload${uploadedBlobs.length !== 1 ? 's' : ''}`}
                  {(selectedDocuments.length + attachedDocuments.length + uploadedBlobs.length) >= 2 && (
                    <span style={{
                      marginLeft: '8px',
                      padding: '2px 6px',
                      backgroundColor: '#e3f2fd',
                      color: '#1976d2',
                      borderRadius: '12px', 
                      fontSize: '11px',
                      fontWeight: '500'
                    }}>
                      🔍 Comparison Ready
                    </span>
                  )}
                  {(attachedDocuments.length > 0 || uploadedBlobs.length > 0) && (
                    <span style={{
                      marginLeft: '8px',
                      padding: '2px 6px',
                      backgroundColor: '#e8f5e8',
                      color: '#2e7d32',
                      borderRadius: '12px',
                      fontSize: '11px',
                      fontWeight: '500'
                    }}>
                      📎 Attachments ready
                    </span>
                  )}
                </p>
              ) : (
                <p style={{
                  margin: '4px 0 0 0', 
                  fontSize: '13px', 
                  color: '#999' 
                }}>
                  No documents selected • Click + to attach files for comparison
                </p>
              )}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '12px', color: '#495057' }}>
                <input
                  type="checkbox"
                  checked={purgeUploadsOnClear}
                  onChange={(event) => setPurgeUploadsOnClear(event.target.checked)}
                  style={{ cursor: 'pointer' }}
                />
                Delete uploads on clear
              </label>
              {conversationHistory.length > 0 && (
                <button
                  onClick={clearConversation}
                  style={{
                    padding: '6px 12px',
                    backgroundColor: '#6c757d',
                    color: 'white',
                    border: 'none',
                    borderRadius: '4px',
                    cursor: 'pointer',
                    fontSize: '12px'
                  }}
                  title="Clear conversation"
                >
                  Clear
                </button>
              )}
              <button
                onClick={onClose}
                style={{
                  padding: '6px 12px',
                  backgroundColor: '#dc3545',
                  color: 'white',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  fontSize: '14px'
                }}
                title="Close"
              >
                ×
              </button>
            </div>
          </div>

          {/* Used Documents */}
          {usedDocuments.length > 0 && (
            <div style={{
              padding: '12px 20px',
              backgroundColor: '#f3f4f6',
              borderBottom: '1px solid #d1d5db',
              fontSize: '12px',
              fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
            }}>
              <strong style={{fontFamily: 'inherit'}}>
                Using {usedDocuments.length > 5 ? `5 of ${usedDocuments.length}` : usedDocuments.length} document{usedDocuments.length !== 1 ? 's' : ''}:
              </strong>
              <div style={{ marginTop: '4px', display: 'flex', flexWrap: 'wrap', gap: '8px', fontFamily: 'inherit' }}>
                {usedDocuments.slice(0, 5).map((doc, index) => {
                  const displayName = getDocumentDisplayName(doc);
                  const displayNumber = getDocumentDisplayNumber(doc);
                  const truncatedName = displayName.length > 30 ? displayName.substring(0, 30) + '...' : displayName;

                  return (
                    <span
                      key={index}
                      style={{
                        backgroundColor: '#6b7280',
                        color: 'white',
                        padding: '2px 8px',
                        borderRadius: '12px',
                        fontSize: '11px',
                        fontFamily: 'inherit'
                      }}
                      title={`${displayName} (${displayNumber})`}
                    >
                      {truncatedName}
                    </span>
                  );
                })}
              </div>
            </div>
          )}

          {/* Messages */}
          <div style={{
            flex: 1,
            overflow: 'auto',
            padding: '20px',
            display: 'flex',
            flexDirection: 'column'
          }}>
            {conversationHistory.length === 0 ? (
              <div style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                height: '100%',
                textAlign: 'center',
                color: '#666'
              }}>
                <div style={{ fontSize: '48px', marginBottom: '16px' }}>🚀</div>
                <h4 style={{ margin: '0 0 8px 0', color: '#333' }}>
                  What can I help you with today?
                </h4>
                {selectedDocuments.length > 0 && (
                  <div style={{ 
                    marginTop: '16px', 
                    padding: '12px', 
                    backgroundColor: '#f0f8ff', 
                    borderRadius: '8px',
                    fontSize: '12px'
                  }}>
                    <strong>Selected documents:</strong>
                    <ul style={{ margin: '8px 0 0 0', paddingLeft: '20px' }}>
                      {selectedDocuments.map((doc, index) => {
                        const displayName = getDocumentDisplayName(doc);
                        return <li key={index}>{displayName}</li>;
                      })}
                    </ul>
                  </div>
                )}
              </div>
            ) : (
              <>
                {conversationHistory.map(renderMessage)}
                {isLoading && (
                  <div style={{
                    display: 'flex',
                    justifyContent: 'flex-start',
                    marginBottom: '16px'
                  }}>
                    <div style={{
                      padding: '12px 16px',
                      borderRadius: '18px',
                      backgroundColor: '#f1f3f4',
                      color: '#666',
                      fontSize: '13px',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px'
                    }}>
                      <div style={{
                        width: '16px',
                        height: '16px',
                        border: '2px solid #ccc',
                        borderTop: '2px solid #007bff',
                        borderRadius: '50%',
                        animation: 'spin 1s linear infinite'
                      }}></div>
                      Thinking...
                    </div>
                  </div>
                )}
                <div ref={messagesEndRef} />
              </>
            )}
          </div>

          {/* Error Message */}
          {error && (
            <div style={{
              padding: '12px 20px',
              backgroundColor: '#f8d7da',
              color: '#721c24',
              borderTop: '1px solid #f5c6cb',
              fontSize: '14px',
              whiteSpace: 'pre-wrap'
            }}>
              <strong>Error:</strong> {error}
            </div>
          )}

          {/* Notification */}
          {notification && (
            <div style={{
              padding: '12px 20px',
              backgroundColor: notification.type === 'success' ? '#d4edda' : '#f8d7da',
              color: notification.type === 'success' ? '#155724' : '#721c24',
              borderTop: `1px solid ${notification.type === 'success' ? '#c3e6cb' : '#f5c6cb'}`,
              fontSize: '14px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between'
            }}>
              <span>{notification.message}</span>
              <button
                onClick={() => setNotification(null)}
                style={{
                  background: 'none',
                  border: 'none',
                  fontSize: '18px',
                  cursor: 'pointer',
                  color: 'inherit',
                  opacity: 0.7
                }}
                title="Dismiss"
              >
                ×
              </button>
            </div>
          )}

          {/* Input */}
          <div className="p-4">
            <ChatPromptBox
              ref={chatPromptBoxRef}
              onSend={handleChatPromptSend}
              onFilesChange={(files) => {
                // Optional: Handle file changes if needed
              }}
              placeholder="Ask a question about your documents or click + to attach files for comparison..."
              disabled={isLoading || isProcessingAttachments}
            />
            
             {/* Upload Progress Display */}
             {uploadProgress && (
               <div style={{ marginTop: '8px', fontSize: '12px', color: '#666' }}>
                 {uploadProgress.files ? (
                   // Batch upload progress
                   <div className="space-y-2">
                     <div className="flex items-center justify-between">
                       <span>
                         {uploadProgress.completedFiles > 0 ? '✓' : '⟳'} 
                         Uploading {uploadProgress.completedFiles} of {uploadProgress.totalFiles} files...
                       </span>
                       <span>{uploadProgress.progress}%</span>
                     </div>
                     
                     {/* Progress bar */}
                     <div className="w-full bg-gray-200 rounded-full h-2">
                       <div 
                         className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                         style={{ width: `${uploadProgress.progress}%` }}
                       ></div>
                     </div>
                     
                     {/* Individual file status */}
                     <div className="space-y-1 max-h-20 overflow-y-auto">
                       {uploadProgress.files.map((file, index) => (
                         <div key={index} className="flex items-center gap-2 text-xs">
                           <span className="w-4 flex items-center justify-center">
                             {file.status === 'success' ? '✓' : 
                              file.status === 'error' ? '✗' : 
                              file.status === 'uploading' ? '⟳' : 
                              <img src="/loading-icon.png" alt="Loading" style={{ width: '16px', height: '16px' }} />}
                           </span>
                           <span className={`flex-1 truncate ${
                             file.status === 'success' ? 'text-green-600' :
                             file.status === 'error' ? 'text-red-600' :
                             file.status === 'uploading' ? 'text-blue-600' : 'text-gray-500'
                           }`}>
                             {file.name}
                           </span>
                           {file.error && (
                             <span className="text-red-500 text-xs" title={file.error}>
                               Error
                             </span>
                           )}
                         </div>
                       ))}
                     </div>
                   </div>
                 ) : (
                   // Legacy single file progress
                   uploadProgress.success ? (
                     <span style={{ color: '#10b981' }}>✓ {uploadProgress.fileName} uploaded</span>
                   ) : uploadProgress.error ? (
                     <span style={{ color: '#ef4444' }}>✗ {uploadProgress.error}</span>
                   ) : (
                     <span>Uploading {uploadProgress.fileName}...</span>
                   )
                 )}
               </div>
             )}
          </div>
        </div>
      </div>


      {/* Document Viewer */}
      <DocumentViewer
        isOpen={viewerOpen}
        onClose={handleCloseViewer}
        documentUrl={selectedDocument?.url}
        documentName={selectedDocument?.name}
      />

      {/* CSS for spinner animation */}
      <style>
        {`
          @keyframes spin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
          }
        `}
      </style>
    </>
  );
}
