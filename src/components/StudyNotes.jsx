import { useState, useEffect } from 'react';
import { useAuth0 } from '@auth0/auth0-react';
import { getChatSessions, summarizeChatSession } from '../api';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

export default function StudyNotes() {
  const { user } = useAuth0();
  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [searchText, setSearchText] = useState('');
  const [expandedNotes, setExpandedNotes] = useState(new Set());
  const [summarizingSessionId, setSummarizingSessionId] = useState(null);
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;

  useEffect(() => {
    if (user?.sub) {
      loadSessions();
    }
  }, [user?.sub]);

  const loadSessions = async () => {
    if (!user?.sub) return;
    
    setLoading(true);
    setError(null);
    try {
      const data = await getChatSessions({ 
        userId: user.sub, 
        limit: 100,
        offset: 0
      });
      
      const sessionsList = Array.isArray(data) ? data : (data?.items || []);
      // Filter to only show sessions with study notes or allow generating them
      setSessions(sessionsList);
    } catch (error) {
      console.error('Error loading sessions:', error);
      setError(error.message || 'Failed to load study notes');
      setSessions([]);
    } finally {
      setLoading(false);
    }
  };

  const handleGenerateNotes = async (session) => {
    setSummarizingSessionId(session.id);
    try {
      const result = await summarizeChatSession({
        sessionId: session.id,
        conversationHistory: null,
        sessionName: session.session_name
      });

      if (result && result.study_notes) {
        await loadSessions();
        setExpandedNotes(prev => new Set([...prev, session.id]));
        alert('Study notes generated successfully!');
      } else {
        alert('Failed to generate study notes.');
      }
    } catch (error) {
      console.error('Error generating study notes:', error);
      alert(`Failed to generate study notes: ${error.message}`);
    } finally {
      setSummarizingSessionId(null);
    }
  };

  const toggleNotes = (sessionId) => {
    setExpandedNotes(prev => {
      const newSet = new Set(prev);
      if (newSet.has(sessionId)) {
        newSet.delete(sessionId);
      } else {
        newSet.add(sessionId);
      }
      return newSet;
    });
  };

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

  // Filter sessions by search text (search in session name and study notes)
  const filteredSessions = sessions.filter(session => {
    if (!searchText) return true;
    const searchLower = searchText.toLowerCase();
    const name = session.session_name?.toLowerCase() || '';
    const notes = session.study_notes?.toLowerCase() || '';
    return name.includes(searchLower) || notes.includes(searchLower);
  });

  // Separate sessions with notes and without notes
  const sessionsWithNotes = filteredSessions.filter(s => s.study_notes);
  const sessionsWithoutNotes = filteredSessions.filter(s => !s.study_notes);

  // Pagination for sessions with notes
  const totalPages = Math.ceil(sessionsWithNotes.length / itemsPerPage);
  const paginatedSessions = sessionsWithNotes.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  );

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
            Study Notes
          </h3>
          <p style={{
            margin: 0,
            fontSize: '14px',
            color: '#6b7280'
          }}>
            Review your learning notes from chat sessions
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
        marginBottom: '24px'
      }}>
        <input
          type="text"
          placeholder="Search study notes..."
          value={searchText}
          onChange={(e) => {
            setSearchText(e.target.value);
            setCurrentPage(1);
          }}
          style={{
            width: '100%',
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

      {/* Loading State */}
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
            <p>Loading study notes...</p>
          </div>
        </div>
      ) : (
        <>
          {/* Sessions with Study Notes */}
          {paginatedSessions.length === 0 && sessionsWithoutNotes.length === 0 ? (
            <div style={{
              display: 'flex',
              justifyContent: 'center',
              alignItems: 'center',
              padding: '60px 20px',
              color: '#6b7280'
            }}>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: '48px', marginBottom: '16px' }}>📚</div>
                <p style={{ fontSize: '16px', margin: 0 }}>
                  {searchText ? 'No study notes found matching your search' : 'No study notes yet'}
                </p>
                <p style={{ fontSize: '14px', margin: '8px 0 0 0', color: '#9ca3af' }}>
                  {searchText ? 'Try adjusting your search' : 'Generate study notes from your chat sessions'}
                </p>
              </div>
            </div>
          ) : (
            <>
              {paginatedSessions.length > 0 && (
                <div style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '16px',
                  marginBottom: '24px'
                }}>
                  {paginatedSessions.map(session => {
                    const isExpanded = expandedNotes.has(session.id);
                    return (
                      <div key={session.id} style={{
                        border: '1px solid #e5e7eb',
                        borderRadius: '8px',
                        backgroundColor: '#ffffff',
                        overflow: 'hidden'
                      }}>
                        {/* Session Header */}
                        <div style={{
                          padding: '16px',
                          borderBottom: isExpanded ? '1px solid #e5e7eb' : 'none',
                          backgroundColor: '#f8fafc',
                          cursor: 'pointer',
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center'
                        }}
                        onClick={() => toggleNotes(session.id)}
                        >
                          <div style={{ flex: 1 }}>
                            <h4 style={{
                              margin: '0 0 4px 0',
                              fontSize: '16px',
                              fontWeight: '600',
                              color: '#374151'
                            }}>
                              {session.session_name || 'Untitled Session'}
                            </h4>
                            <div style={{
                              display: 'flex',
                              gap: '12px',
                              fontSize: '12px',
                              color: '#6b7280'
                            }}>
                              <span>📅 {formatDate(session.created_at)}</span>
                              <span>💬 {session.message_count || 0} messages</span>
                            </div>
                          </div>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              toggleNotes(session.id);
                            }}
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
                            {isExpanded ? 'Collapse' : 'Expand'}
                          </button>
                        </div>

                        {/* Study Notes Content */}
                        {isExpanded && session.study_notes && (
                          <div style={{
                            padding: '20px',
                            backgroundColor: '#ffffff'
                          }}>
                            <div style={{
                              fontSize: '14px',
                              color: '#374151',
                              lineHeight: '1.8',
                              whiteSpace: 'pre-wrap'
                            }}>
                              <ReactMarkdown remarkPlugins={[remarkGfm]}>
                                {session.study_notes}
                              </ReactMarkdown>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Pagination */}
              {totalPages > 1 && (
                <div style={{
                  display: 'flex',
                  justifyContent: 'center',
                  alignItems: 'center',
                  gap: '8px',
                  marginBottom: '24px'
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

              {/* Sessions without notes */}
              {sessionsWithoutNotes.length > 0 && (
                <div style={{
                  marginTop: '32px',
                  paddingTop: '24px',
                  borderTop: '2px solid #e5e7eb'
                }}>
                  <h4 style={{
                    margin: '0 0 16px 0',
                    fontSize: '16px',
                    fontWeight: '600',
                    color: '#374151'
                  }}>
                    Sessions Without Study Notes ({sessionsWithoutNotes.length})
                  </h4>
                  <div style={{
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '12px'
                  }}>
                    {sessionsWithoutNotes.slice(0, 5).map(session => (
                      <div key={session.id} style={{
                        border: '1px solid #e5e7eb',
                        borderRadius: '6px',
                        padding: '12px 16px',
                        backgroundColor: '#ffffff',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center'
                      }}>
                        <div>
                          <div style={{
                            fontSize: '14px',
                            fontWeight: '500',
                            color: '#374151',
                            marginBottom: '4px'
                          }}>
                            {session.session_name || 'Untitled Session'}
                          </div>
                          <div style={{
                            fontSize: '12px',
                            color: '#6b7280'
                          }}>
                            {formatDate(session.created_at)} • {session.message_count || 0} messages
                          </div>
                        </div>
                        <button
                          onClick={() => handleGenerateNotes(session)}
                          disabled={summarizingSessionId === session.id}
                          style={{
                            padding: '6px 16px',
                            backgroundColor: summarizingSessionId === session.id ? '#9ca3af' : '#10b981',
                            color: '#ffffff',
                            border: 'none',
                            borderRadius: '6px',
                            fontSize: '13px',
                            fontWeight: '500',
                            cursor: summarizingSessionId === session.id ? 'not-allowed' : 'pointer',
                            fontFamily: 'inherit'
                          }}
                        >
                          {summarizingSessionId === session.id ? 'Generating...' : 'Generate Notes'}
                        </button>
                      </div>
                    ))}
                    {sessionsWithoutNotes.length > 5 && (
                      <p style={{
                        fontSize: '13px',
                        color: '#6b7280',
                        fontStyle: 'italic',
                        margin: '8px 0 0 0'
                      }}>
                        And {sessionsWithoutNotes.length - 5} more sessions...
                      </p>
                    )}
                  </div>
                </div>
              )}
            </>
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

