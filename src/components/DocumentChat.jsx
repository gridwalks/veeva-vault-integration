import { useState, useRef, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import DocumentViewer from './DocumentViewer.jsx';
import { chatWithDocuments } from '../api';

export default function DocumentChat({ isOpen, onClose, selectedDocuments = [], onOpenDocumentInPane }) {
  const [conversationHistory, setConversationHistory] = useState([]);
  const [currentMessage, setCurrentMessage] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const [usedDocuments, setUsedDocuments] = useState([]);
  const [viewerOpen, setViewerOpen] = useState(false);
  const [selectedDocument, setSelectedDocument] = useState(null);
  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => {
    if (isOpen) {
      // Focus input when chat opens
      setTimeout(() => {
        if (inputRef.current) {
          inputRef.current.focus();
        }
      }, 100);
    }
  }, [isOpen]);

  useEffect(() => {
    // Scroll to bottom when new messages are added
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [conversationHistory, isLoading]);

  const sendMessage = async () => {
    if (!currentMessage.trim() || isLoading) return;

    const userMessage = currentMessage.trim();
    setCurrentMessage('');
    setIsLoading(true);
    setError(null);

    // Add user message to conversation
    const newHistory = [...conversationHistory, { role: 'user', content: userMessage }];
    setConversationHistory(newHistory);

    try {
      const data = await chatWithDocuments({
        message: userMessage,
        documentIds: selectedDocuments.map(doc => doc.veeva_document_id),
        conversationHistory: newHistory
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
      sendMessage();
    }
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
      
      const response = await fetch('/api/qa-interactions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          question,
          answer,
          document_ids: documentIds,
          document_names: documentNames,
          user_id: null, // Could be enhanced to capture user info
          session_id: Date.now().toString() // Simple session identifier
        })
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.warn('Failed to capture Q&A interaction:', {
          status: response.status,
          statusText: response.statusText,
          errorText
        });
      } else {
        const result = await response.json();
        console.log('Q&A interaction captured successfully:', result);
      }
    } catch (error) {
      console.warn('Error capturing Q&A interaction:', error);
      // Don't throw error as this shouldn't break the chat functionality
    }
  };

  const renderMessage = (message, index) => {
    const isUser = message.role === 'user';
    const isAssistant = message.role === 'assistant';
    const isLastAssistantMessage = isAssistant && index === conversationHistory.length - 1;

    return (
      <div
        key={index}
        style={{
          display: 'flex',
          justifyContent: isUser ? 'flex-end' : 'flex-start',
          marginBottom: '16px',
          flexDirection: 'column'
        }}
      >
        <div
          style={{
            maxWidth: '80%',
            padding: '12px 16px',
            borderRadius: '18px',
            backgroundColor: isUser ? '#007bff' : '#f1f3f4',
            color: isUser ? 'white' : '#333',
            fontSize: '14px',
            lineHeight: '1.5',
            wordWrap: 'break-word'
          }}
        >
          {isAssistant ? (
            <ReactMarkdown>{message.content}</ReactMarkdown>
          ) : (
            message.content
          )}
        </div>

        {/* Document opening options for the last assistant message */}
        {isLastAssistantMessage && usedDocuments && usedDocuments.length > 0 && (
          <div style={{
            maxWidth: '80%',
            marginTop: '8px',
            padding: '12px',
            backgroundColor: '#e3f2fd',
            borderRadius: '8px',
            border: '1px solid #bbdefb'
          }}>
            <div style={{
              fontSize: '12px',
              fontWeight: '600',
              color: '#1976d2',
              marginBottom: '8px',
              display: 'flex',
              alignItems: 'center',
              gap: '4px'
            }}>
              📄 Documents referenced in this response:
            </div>
            
            <div style={{
              display: 'flex',
              flexDirection: 'column',
              gap: '6px'
            }}>
              {usedDocuments.map((doc, docIndex) => (
                <div key={docIndex} style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  padding: '8px',
                  backgroundColor: 'white',
                  borderRadius: '6px',
                  border: '1px solid #e0e0e0'
                }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{
                      fontSize: '13px',
                      fontWeight: '500',
                      color: '#333',
                      marginBottom: '2px',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap'
                    }}>
                      {doc.name}
                    </div>
                    <div style={{
                      fontSize: '11px',
                      color: '#666'
                    }}>
                      {doc.number} • v{doc.version} • {doc.type}
                    </div>
                  </div>
                  <button
                    onClick={() => handleOpenDocument(doc)}
                    style={{
                      padding: '6px 12px',
                      backgroundColor: '#1976d2',
                      color: 'white',
                      border: 'none',
                      borderRadius: '4px',
                      cursor: 'pointer',
                      fontSize: '11px',
                      fontWeight: '500',
                      whiteSpace: 'nowrap',
                      marginLeft: '8px'
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
                  fontSize: '12px', 
                  color: '#666' 
                }}>
                  {selectedDocuments.length} document{selectedDocuments.length !== 1 ? 's' : ''} selected
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
              backgroundColor: '#e3f2fd',
              borderBottom: '1px solid #eee',
              fontSize: '12px'
            }}>
              <strong>Using {usedDocuments.length} document{usedDocuments.length !== 1 ? 's' : ''}:</strong>
              <div style={{ marginTop: '4px', display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                {usedDocuments.map((doc, index) => (
                  <span
                    key={index}
                    style={{
                      backgroundColor: '#2196f3',
                      color: 'white',
                      padding: '2px 8px',
                      borderRadius: '12px',
                      fontSize: '11px'
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
                <div style={{ fontSize: '48px', marginBottom: '16px' }}>💬</div>
                <h4 style={{ margin: '0 0 8px 0', color: '#333' }}>
                  Chat with your documents
                </h4>
                <p style={{ margin: 0, fontSize: '14px' }}>
                  Ask questions about your indexed documents. I'll help you find relevant information and answer your questions based on the document content.
                </p>
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
                      fontSize: '14px',
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
          <div style={{
            padding: '16px 20px',
            borderTop: '1px solid #eee',
            backgroundColor: '#f8f9fa'
          }}>
            <div style={{ display: 'flex', gap: '12px' }}>
              <textarea
                ref={inputRef}
                value={currentMessage}
                onChange={(e) => setCurrentMessage(e.target.value)}
                onKeyPress={handleKeyPress}
                placeholder="Ask a question about your documents..."
                disabled={isLoading}
                style={{
                  flex: 1,
                  padding: '12px',
                  border: '1px solid #ddd',
                  borderRadius: '8px',
                  resize: 'none',
                  fontSize: '14px',
                  fontFamily: 'inherit',
                  minHeight: '44px',
                  maxHeight: '120px'
                }}
                rows={1}
              />
              <button
                onClick={sendMessage}
                disabled={!currentMessage.trim() || isLoading}
                style={{
                  padding: '12px 20px',
                  backgroundColor: (!currentMessage.trim() || isLoading) ? '#ccc' : '#007bff',
                  color: 'white',
                  border: 'none',
                  borderRadius: '8px',
                  cursor: (!currentMessage.trim() || isLoading) ? 'not-allowed' : 'pointer',
                  fontSize: '14px',
                  fontWeight: '500',
                  minWidth: '80px'
                }}
              >
                {isLoading ? '...' : 'Send'}
              </button>
            </div>
            <div style={{
              marginTop: '8px',
              fontSize: '12px',
              color: '#666',
              textAlign: 'center'
            }}>
              Press Enter to send, Shift+Enter for new line
            </div>
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
