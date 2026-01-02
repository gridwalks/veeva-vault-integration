import { useState, useEffect } from 'react';
import { useAuth0 } from '@auth0/auth0-react';
import { getChatSessions, deleteChatSession, updateChatSessionName } from '../api';

export default function ChatHistory({ onLoadSession }) {
  const { user } = useAuth0();
  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [searchText, setSearchText] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [editingNameId, setEditingNameId] = useState(null);
  const [editingName, setEditingName] = useState('');
  const itemsPerPage = 20;

  useEffect(() => {
    loadSessions();
  }, [user?.sub]);

  const loadSessions = async () => {
    if (!user?.sub) return;
    
    setLoading(true);
    setError(null);
    try {
      const data = await getChatSessions({ 
        userId: user.sub, 
        limit: 100,
        offset: 0,
        searchText: searchText || undefined
      });
      console.log('Chat sessions data received:', data);
      // Handle both direct items array and nested data structure
      if (Array.isArray(data)) {
        setSessions(data);
      } else if (data?.items) {
        setSessions(data.items);
      } else {
        console.warn('Unexpected data structure:', data);
        setSessions([]);
      }
    } catch (error) {
      console.error('Error loading chat sessions:', error);
      setError(error.message || 'Failed to load chat sessions');
      setSessions([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadSessions();
  }, [searchText]);

  const handleDeleteSession = async (sessionId) => {
    if (!confirm('Are you sure you want to delete this chat session?')) {
      return;
    }

    try {
      await deleteChatSession({ sessionId });
      loadSessions();
    } catch (error) {
      console.error('Error deleting chat session:', error);
      alert('Failed to delete chat session');
    }
  };

  const handleUpdateName = async (sessionId, newName) => {
    try {
      await updateChatSessionName({ sessionId, sessionName: newName });
      setEditingNameId(null);
      loadSessions();
    } catch (error) {
      console.error('Error updating chat session name:', error);
      alert('Failed to update session name');
    }
  };

  const handleLoadSession = (sessionId) => {
    if (onLoadSession) {
      onLoadSession(sessionId);
    }
  };

  const startEditingName = (session) => {
    setEditingNameId(session.id);
    setEditingName(session.session_name || '');
  };

  const cancelEditingName = () => {
    setEditingNameId(null);
    setEditingName('');
  };

  const submitEditName = (sessionId) => {
    if (editingName.trim()) {
      handleUpdateName(sessionId, editingName);
    } else {
      cancelEditingName();
    }
  };

  // Filter sessions by search text
  const filteredSessions = sessions.filter(session => {
    if (!searchText) return true;
    const name = session.session_name?.toLowerCase() || '';
    return name.includes(searchText.toLowerCase());
  });

  // Pagination
  const totalPages = Math.ceil(filteredSessions.length / itemsPerPage);
  const paginatedSessions = filteredSessions.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  );

  const formatDate = (dateString) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const getPreviewText = (conversationHistory) => {
    if (!conversationHistory || !Array.isArray(conversationHistory)) {
      return 'No messages';
    }
    
    // Find first user and assistant messages for preview
    const firstUserMsg = conversationHistory.find(msg => msg.role === 'user');
    const firstAssistantMsg = conversationHistory.find(msg => msg.role === 'assistant');
    
    let preview = '';
    if (firstUserMsg) {
      preview += `Q: ${firstUserMsg.content.substring(0, 60)}${firstUserMsg.content.length > 60 ? '...' : ''}`;
    }
    if (firstAssistantMsg) {
      preview += `\nA: ${firstAssistantMsg.content.substring(0, 60)}${firstAssistantMsg.content.length > 60 ? '...' : ''}`;
    }
    
    return preview || 'Empty session';
  };

  const getDocumentCount = (documentMetadata) => {
    if (!documentMetadata) return 0;
    
    const count = 
      (documentMetadata.selectedDocuments?.length || 0) +
      (documentMetadata.attachedDocuments?.length || 0) +
      (documentMetadata.uploadedBlobs?.length || 0);
    
    return count;
  };

  return (
    <div style={{
      padding: '24px',
      height: '100%',
      overflow: 'auto',
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
    }}>
      {/* Header */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: '24px'
      }}>
        <div>
          <h3 style={{
            margin: '0 0 8px 0',
            fontSize: '20px',
            fontWeight: '600',
            color: '#374151'
          }}>
            Chat History
          </h3>
          <p style={{
            margin: 0,
            fontSize: '14px',
            color: '#6b7280'
          }}>
            Your saved chat conversations
          </p>
        </div>
        <button
          onClick={loadSessions}
          disabled={loading}
          style={{
            padding: '8px 16px',
            backgroundColor: loading ? '#9ca3af' : '#4338ca',
            color: '#ffffff',
            border: 'none',
            borderRadius: '6px',
            fontSize: '14px',
            fontWeight: '500',
            cursor: loading ? 'not-allowed' : 'pointer',
            fontFamily: 'inherit'
          }}
        >
          {loading ? 'Refreshing...' : 'Refresh'}
        </button>
      </div>

      {/* Search Bar */}
      <div style={{
        marginBottom: '24px',
        display: 'flex',
        gap: '12px',
        alignItems: 'center'
      }}>
        <input
          type="text"
          placeholder="Search chat sessions..."
          value={searchText}
          onChange={(e) => {
            setSearchText(e.target.value);
            setCurrentPage(1);
          }}
          style={{
            flex: 1,
            padding: '10px 16px',
            border: '1px solid #d1d5db',
            borderRadius: '6px',
            fontSize: '14px',
            fontFamily: 'inherit'
          }}
        />
      </div>

      {/* Error Message */}
      {error && (
        <div style={{
          padding: '12px 16px',
          backgroundColor: '#fee2e2',
          border: '1px solid #fca5a5',
          borderRadius: '6px',
          marginBottom: '24px',
          color: '#991b1b'
        }}>
          <strong>Error:</strong> {error}
        </div>
      )}

      {/* Sessions List */}
      {loading ? (
        <div style={{
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          padding: '60px 20px',
          color: '#6b7280'
        }}>
          <div style={{ textAlign: 'center' }}>
            <div style={{
              width: '40px',
              height: '40px',
              border: '4px solid #e5e7eb',
              borderTop: '4px solid #4338ca',
              borderRadius: '50%',
              animation: 'spin 1s linear infinite',
              margin: '0 auto 16px'
            }}></div>
            <p>Loading chat sessions...</p>
          </div>
        </div>
      ) : paginatedSessions.length === 0 ? (
        <div style={{
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          padding: '60px 20px',
          color: '#6b7280'
        }}>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: '48px', marginBottom: '16px' }}>💬</div>
            <p style={{ fontSize: '16px', margin: 0 }}>
              {searchText ? 'No sessions found matching your search' : 'No saved chat sessions yet'}
            </p>
            <p style={{ fontSize: '14px', margin: '8px 0 0 0', color: '#9ca3af' }}>
              {searchText ? 'Try adjusting your search' : 'Start a conversation and click "Clear" to save it'}
            </p>
          </div>
        </div>
      ) : (
        <>
          <div style={{
            display: 'flex',
            flexDirection: 'column',
            gap: '12px'
          }}>
            {paginatedSessions.map(session => (
              <div key={session.id} style={{
                border: '1px solid #e5e7eb',
                borderRadius: '8px',
                padding: '16px',
                backgroundColor: '#ffffff',
                transition: 'all 0.2s ease',
                cursor: 'pointer'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.borderColor = '#4338ca';
                e.currentTarget.style.boxShadow = '0 2px 8px rgba(67, 56, 202, 0.1)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.borderColor = '#e5e7eb';
                e.currentTarget.style.boxShadow = 'none';
              }}
              >
                <div style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'flex-start',
                  marginBottom: '12px'
                }}>
                  {/* Session Name */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    {editingNameId === session.id ? (
                      <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                        <input
                          type="text"
                          value={editingName}
                          onChange={(e) => setEditingName(e.target.value)}
                          onKeyPress={(e) => {
                            if (e.key === 'Enter') {
                              submitEditName(session.id);
                            } else if (e.key === 'Escape') {
                              cancelEditingName();
                            }
                          }}
                          style={{
                            flex: 1,
                            padding: '6px 12px',
                            border: '1px solid #4338ca',
                            borderRadius: '4px',
                            fontSize: '15px',
                            fontWeight: '600',
                            fontFamily: 'inherit'
                          }}
                          autoFocus
                        />
                        <button
                          onClick={() => submitEditName(session.id)}
                          style={{
                            padding: '6px 12px',
                            backgroundColor: '#4338ca',
                            color: '#ffffff',
                            border: 'none',
                            borderRadius: '4px',
                            fontSize: '12px',
                            cursor: 'pointer',
                            fontFamily: 'inherit'
                          }}
                        >
                          Save
                        </button>
                        <button
                          onClick={cancelEditingName}
                          style={{
                            padding: '6px 12px',
                            backgroundColor: '#6b7280',
                            color: '#ffffff',
                            border: 'none',
                            borderRadius: '4px',
                            fontSize: '12px',
                            cursor: 'pointer',
                            fontFamily: 'inherit'
                          }}
                        >
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <div style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px'
                      }}>
                        <h4 style={{
                          margin: 0,
                          fontSize: '16px',
                          fontWeight: '600',
                          color: '#374151',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap'
                        }}>
                          {session.session_name || 'Untitled Session'}
                        </h4>
                        <button
                          onClick={() => startEditingName(session)}
                          style={{
                            padding: '4px 8px',
                            backgroundColor: 'transparent',
                            color: '#6b7280',
                            border: '1px solid #e5e7eb',
                            borderRadius: '4px',
                            fontSize: '11px',
                            cursor: 'pointer',
                            fontFamily: 'inherit',
                            opacity: 0.7
                          }}
                          onMouseEnter={(e) => {
                            e.target.style.opacity = '1';
                            e.target.style.borderColor = '#4338ca';
                            e.target.style.color = '#4338ca';
                          }}
                          onMouseLeave={(e) => {
                            e.target.style.opacity = '0.7';
                            e.target.style.borderColor = '#e5e7eb';
                            e.target.style.color = '#6b7280';
                          }}
                        >
                          Edit
                        </button>
                      </div>
                    )}
                  </div>

                  {/* Action Buttons */}
                  <div style={{
                    display: 'flex',
                    gap: '8px'
                  }}>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleLoadSession(session.id);
                      }}
                      style={{
                        padding: '6px 16px',
                        backgroundColor: '#4338ca',
                        color: '#ffffff',
                        border: 'none',
                        borderRadius: '6px',
                        fontSize: '13px',
                        fontWeight: '500',
                        cursor: 'pointer',
                        fontFamily: 'inherit'
                      }}
                      onMouseEnter={(e) => e.target.style.backgroundColor = '#3730a3'}
                      onMouseLeave={(e) => e.target.style.backgroundColor = '#4338ca'}
                    >
                      Load Session
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDeleteSession(session.id);
                      }}
                      style={{
                        padding: '6px 16px',
                        backgroundColor: '#dc2626',
                        color: '#ffffff',
                        border: 'none',
                        borderRadius: '6px',
                        fontSize: '13px',
                        fontWeight: '500',
                        cursor: 'pointer',
                        fontFamily: 'inherit'
                      }}
                      onMouseEnter={(e) => e.target.style.backgroundColor = '#b91c1c'}
                      onMouseLeave={(e) => e.target.style.backgroundColor = '#dc2626'}
                    >
                      Delete
                    </button>
                  </div>
                </div>

                {/* Session Info */}
                <div style={{
                  display: 'flex',
                  flexWrap: 'wrap',
                  gap: '12px',
                  marginBottom: '12px',
                  fontSize: '13px',
                  color: '#6b7280'
                }}>
                  <span>💬 {session.message_count || 0} messages</span>
                  <span>📄 {getDocumentCount(session.document_metadata)} documents</span>
                  <span>📅 {formatDate(session.created_at)}</span>
                </div>

                {/* Preview */}
                <div style={{
                  padding: '12px',
                  backgroundColor: '#f9fafb',
                  borderRadius: '6px',
                  fontSize: '13px',
                  color: '#4b5563',
                  whiteSpace: 'pre-wrap',
                  maxHeight: '100px',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis'
                }}>
                  {getPreviewText(session.conversation_history)}
                </div>
              </div>
            ))}
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div style={{
              display: 'flex',
              justifyContent: 'center',
              alignItems: 'center',
              gap: '8px',
              marginTop: '24px'
            }}>
              <button
                onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                disabled={currentPage === 1}
                style={{
                  padding: '8px 16px',
                  backgroundColor: currentPage === 1 ? '#e5e7eb' : '#4338ca',
                  color: currentPage === 1 ? '#9ca3af' : '#ffffff',
                  border: 'none',
                  borderRadius: '6px',
                  fontSize: '14px',
                  fontWeight: '500',
                  cursor: currentPage === 1 ? 'not-allowed' : 'pointer',
                  fontFamily: 'inherit'
                }}
              >
                Previous
              </button>
              <span style={{
                padding: '8px 16px',
                fontSize: '14px',
                color: '#374151',
                fontFamily: 'inherit'
              }}>
                Page {currentPage} of {totalPages}
              </span>
              <button
                onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                disabled={currentPage === totalPages}
                style={{
                  padding: '8px 16px',
                  backgroundColor: currentPage === totalPages ? '#e5e7eb' : '#4338ca',
                  color: currentPage === totalPages ? '#9ca3af' : '#ffffff',
                  border: 'none',
                  borderRadius: '6px',
                  fontSize: '14px',
                  fontWeight: '500',
                  cursor: currentPage === totalPages ? 'not-allowed' : 'pointer',
                  fontFamily: 'inherit'
                }}
              >
                Next
              </button>
            </div>
          )}
        </>
      )}

      {/* CSS for spinner animation */}
      <style>
        {`
          @keyframes spin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
          }
        `}
      </style>
    </div>
  );
}

