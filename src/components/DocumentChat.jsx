import { useState, useRef, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import DocumentViewer from './DocumentViewer.jsx';
import ChatPromptBox from './ChatPromptBox.jsx';
import { chatWithDocuments, createQAInteraction, getUploadedDocuments } from '../api';
import { getSessionId } from '../utils/sessionManager';

export default function DocumentChat({ isOpen, onClose, selectedDocuments = [], onOpenDocumentInPane }) {
  const [conversationHistory, setConversationHistory] = useState([]);
  const [currentMessage, setCurrentMessage] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const [usedDocuments, setUsedDocuments] = useState([]);
  const [viewerOpen, setViewerOpen] = useState(false);
  const [selectedDocument, setSelectedDocument] = useState(null);
  const [uploadedDocuments, setUploadedDocuments] = useState([]);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(null);
  const [userId, setUserId] = useState(null);
  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);
  const fileInputRef = useRef(null);

  useEffect(() => {
    if (isOpen) {
      // Initialize user session
      const sessionId = getSessionId();
      setUserId(sessionId);
      
      // Load user's uploaded documents
      loadUploadedDocuments(sessionId);
      
      // Focus input when chat opens
      setTimeout(() => {
        if (inputRef.current) {
          inputRef.current.focus();
        }
      }, 100);
    }
  }, [isOpen]);

  const loadUploadedDocuments = async (sessionId) => {
    try {
      const data = await getUploadedDocuments({ userId: sessionId });
      setUploadedDocuments(data.items || []);
    } catch (error) {
      console.error('Error loading uploaded documents:', error);
    }
  };

  const handleFileUpload = async (event) => {
    const files = Array.from(event.target.files);
    if (files.length === 0) return;

    setIsUploading(true);
    setUploadProgress({ fileName: files[0].name, progress: 0 });

    try {
      const formData = new FormData();
      files.forEach((file, index) => {
        formData.append(`file_${index}`, file);
      });
      formData.append('fileCount', files.length.toString());
      formData.append('uploadType', 'chat_upload');
      formData.append('userId', userId);

      const response = await fetch('/api/upload-documents', {
        method: 'POST',
        body: formData
      });

      if (!response.ok) {
        throw new Error(`Upload failed: ${response.status} ${response.statusText}`);
      }

      const result = await response.json();
      
      if (result.success) {
        // Reload uploaded documents
        await loadUploadedDocuments(userId);
        setUploadProgress({ fileName: files[0].name, progress: 100, success: true });
        
        // Auto-select the uploaded documents
        const newDocumentIds = result.results
          .filter(r => r.success)
          .map(r => r.documentId);
        
        if (newDocumentIds.length > 0) {
          // Add to selected documents (this would need to be handled by parent component)
          console.log('Uploaded documents ready for selection:', newDocumentIds);
        }
      } else {
        throw new Error(result.error || 'Upload failed');
      }
    } catch (error) {
      console.error('Upload error:', error);
      setUploadProgress({ fileName: files[0].name, progress: 0, error: error.message });
    } finally {
      setIsUploading(false);
      // Clear file input
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const triggerFileUpload = () => {
    if (fileInputRef.current) {
      fileInputRef.current.click();
    }
  };

  useEffect(() => {
    // Scroll to bottom when new messages are added
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [conversationHistory, isLoading]);

  const sendMessage = async (message, file = null) => {
    if (!message.trim() || isLoading) return;

    const userMessage = message.trim();
    setCurrentMessage('');
    setIsLoading(true);
    setError(null);

    // Handle file upload if file is provided
    if (file) {
      await handleFileUpload({ target: { files: [file] } });
    }

    // Add user message to conversation
    const newHistory = [...conversationHistory, { role: 'user', content: userMessage }];
    setConversationHistory(newHistory);

    try {
      const data = await chatWithDocuments({
        message: userMessage,
        documentIds: selectedDocuments.map(doc => doc.veeva_document_id),
        conversationHistory: newHistory,
        userId: userId
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
    }
  };

  const handleKeyPress = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage(currentMessage);
    }
  };

  const handleChatPromptSend = ({ message, file }) => {
    sendMessage(message, file);
  };

  const clearConversation = () => {
    setConversationHistory([]);
    setUsedDocuments([]);
    setError(null);
  };

  const handleOpenDocument = (document) => {
    if (onOpenDocumentInPane) {
      // Route document to the right pane
      const mappedDocument = {
        veeva_document_id: document.id,
        document_name: document.name,
        document_type: document.type,
        version: document.version,
        document_number: document.number
      };
      onOpenDocumentInPane(mappedDocument);
    } else {
      // Fallback to document viewer if no callback provided
      setSelectedDocument({
        url: `/api/download-file?docId=${document.id}&major=${document.version.split('.')[0]}&minor=${document.version.split('.')[1]}`,
        name: document.name
      });
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
          name: doc.name || doc.document_name
        }))
      });

      const documentIds = documents.map(doc => doc.id || doc.veeva_document_id).filter(Boolean);
      const documentNames = documents.map(doc => doc.name || doc.document_name).filter(Boolean);
      
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
                    overflow: 'hidden'
                  }}>{children}</table>,
                  thead: ({ children }) => <thead style={{ backgroundColor: '#f8f9fa' }}>{children}</thead>,
                  tbody: ({ children }) => <tbody>{children}</tbody>,
                  th: ({ children }) => <th style={{ 
                    border: '1px solid #dee2e6', 
                    padding: '12px 8px', 
                    backgroundColor: '#f8f9fa',
                    fontWeight: '600',
                    textAlign: 'left',
                    fontFamily: 'inherit',
                    fontSize: '12px',
                    color: '#495057'
                  }}>{children}</th>,
                  td: ({ children }) => <td style={{ 
                    border: '1px solid #dee2e6', 
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
              Copy
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
              <span style={{ fontSize: '16px' }}>👍</span>
              Like
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
              <span style={{ fontSize: '16px' }}>👎</span>
              Dislike
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
              <span style={{ fontSize: '16px' }}>📤</span>
              Share
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
              <span style={{ fontSize: '16px' }}>🔄</span>
              Regenerate
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
            </div>
            
            <div style={{
              display: 'flex',
              flexDirection: 'column',
              gap: '6px',
              fontFamily: 'inherit'
            }}>
              {usedDocuments.map((doc, docIndex) => (
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
                      {doc.name}
                    </div>
                    <div style={{
                      fontSize: '11px',
                      color: '#666',
                      fontFamily: 'inherit'
                    }}>
                      {doc.number} • v{doc.version} • {doc.type}
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
              ))}
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
              {selectedDocuments.length > 0 && (
                <p style={{ 
                  margin: '4px 0 0 0', 
                  fontSize: '13px', 
                  color: '#666' 
                }}>
                  {selectedDocuments.length} document{selectedDocuments.length !== 1 ? 's' : ''} selected
                  {selectedDocuments.length >= 2 && (
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
                </p>
              )}
            </div>
            <div style={{ display: 'flex', gap: '8px' }}>
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
              <strong style={{fontFamily: 'inherit'}}>Using {usedDocuments.length} document{usedDocuments.length !== 1 ? 's' : ''}:</strong>
              <div style={{ marginTop: '4px', display: 'flex', flexWrap: 'wrap', gap: '8px', fontFamily: 'inherit' }}>
                {usedDocuments.map((doc, index) => (
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
                    title={`${doc.name} (${doc.number})`}
                  >
                    {doc.name.length > 30 ? doc.name.substring(0, 30) + '...' : doc.name}
                  </span>
                ))}
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
                      {selectedDocuments.map((doc, index) => (
                        <li key={index}>{doc.document_name}</li>
                      ))}
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

          {/* Input */}
          <div className="p-4">
            <ChatPromptBox
              onSend={handleChatPromptSend}
              placeholder="Ask a question about your documents..."
              disabled={isLoading}
            />
            
            {/* Upload Progress Display */}
            {uploadProgress && (
              <div style={{ marginTop: '8px', fontSize: '12px', color: '#666' }}>
                {uploadProgress.success ? (
                  <span style={{ color: '#10b981' }}>✓ {uploadProgress.fileName} uploaded</span>
                ) : uploadProgress.error ? (
                  <span style={{ color: '#ef4444' }}>✗ {uploadProgress.error}</span>
                ) : (
                  <span>Uploading {uploadProgress.fileName}...</span>
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
