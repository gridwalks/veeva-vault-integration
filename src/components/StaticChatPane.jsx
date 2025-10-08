import { useState, useRef, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import DocumentViewer from './DocumentViewer.jsx';

export default function StaticChatPane({ selectedDocuments = [], onOpenDocumentInPane }) {
  const [conversationHistory, setConversationHistory] = useState([]);
  
  // Debug conversation history changes
  useEffect(() => {
    console.log('Conversation history updated:', conversationHistory.length, 'messages');
    conversationHistory.forEach((msg, index) => {
      console.log(`Message ${index}:`, { role: msg.role, content: msg.content?.substring(0, 50) + '...' });
    });
  }, [conversationHistory]);
  const [currentMessage, setCurrentMessage] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const [usedDocuments, setUsedDocuments] = useState([]);
  const [usedExternalResources, setUsedExternalResources] = useState([]);
  const [viewerOpen, setViewerOpen] = useState(false);
  const [selectedDocument, setSelectedDocument] = useState(null);
  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);
  
  // Workflow state
  const [workflowState, setWorkflowState] = useState({
    isActive: false,
    instanceId: null,
    currentStep: null,
    template: null,
    responses: {}
  });

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

    // Check for exit workflow command
    if (userMessage.toLowerCase().includes('exit workflow')) {
      exitWorkflow();
      return;
    }

    // If we're in a workflow, handle workflow step submission
    if (workflowState.isActive && workflowState.currentStep) {
      await handleWorkflowStepSubmission(userMessage);
      return;
    }

    try {
      // First, check if this message should trigger a workflow
      const workflowDetection = await detectWorkflow(userMessage);
      
      if (workflowDetection.shouldStartWorkflow && !workflowDetection.hasActiveWorkflow) {
        // Start the workflow
        await startWorkflow(workflowDetection.template, workflowDetection.firstStep);
        return;
      } else if (workflowDetection.hasActiveWorkflow) {
        // User has an active workflow, show appropriate message
        setConversationHistory(prev => [
          ...prev,
          { 
            role: 'assistant', 
            content: `You already have an active workflow in progress. Please complete it before starting a new one. Type "exit workflow" to cancel the current workflow.` 
          }
        ]);
        setIsLoading(false);
        return;
      }

      // Proceed with normal chat if no workflow detected
      const requestBody = {
        message: userMessage,
        documentIds: selectedDocuments.map(doc => doc.veeva_document_id),
        conversationHistory: newHistory
      };
      
      console.log('Sending chat request:', {
        message: userMessage,
        documentIds: requestBody.documentIds,
        selectedDocumentsCount: selectedDocuments.length,
        conversationHistoryLength: newHistory.length
      });
      
      const response = await fetch('/api/chat-with-documents', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody)
      });

      if (!response.ok) {
        throw new Error(`Chat request failed: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();
      
      if (data.error) {
        throw new Error(data.error);
      }

      // Update conversation with AI response
      console.log('API Response data:', data);
      
      // Handle different response formats
      if (data.conversationHistory && Array.isArray(data.conversationHistory)) {
        // API returns full conversation history - clean up duplicates
        console.log('Using API conversation history:', data.conversationHistory.length, 'messages');
        console.log('Raw conversation history:', data.conversationHistory.map((msg, i) => ({ index: i, role: msg.role, content: msg.content.substring(0, 50) + '...' })));
        
        // Remove duplicate consecutive messages
        const cleanedHistory = [];
        for (let i = 0; i < data.conversationHistory.length; i++) {
          const message = data.conversationHistory[i];
          const prevMessage = cleanedHistory[cleanedHistory.length - 1];
          
          // Skip if this message is identical to the previous one
          if (prevMessage && 
              prevMessage.role === message.role && 
              prevMessage.content === message.content) {
            console.log(`Removing duplicate message at index ${i}:`, message.content.substring(0, 50) + '...');
            continue;
          }
          
          cleanedHistory.push(message);
        }
        
        console.log('Cleaned conversation history:', cleanedHistory.length, 'messages');
        console.log('Cleaned conversation history details:', cleanedHistory.map((msg, i) => ({ index: i, role: msg.role, content: msg.content.substring(0, 50) + '...' })));
        setConversationHistory(cleanedHistory);
      } else if (data.response) {
        // API returns just the response, append to existing history
        console.log('Appending API response to existing history');
        setConversationHistory(prev => {
          // Remove the last message if it's a duplicate user message
          const lastMessage = prev[prev.length - 1];
          if (lastMessage && lastMessage.role === 'user' && lastMessage.content === userMessage) {
            prev = prev.slice(0, -1);
          }
          return [
            ...prev,
            { role: 'assistant', content: data.response }
          ];
        });
      } else {
        console.error('Unexpected API response format:', data);
        throw new Error('Unexpected response format from chat API');
      }
      
      setUsedDocuments(data.documents || []);
      setUsedExternalResources(data.externalResources || []);

      console.log('Chat response received:', {
        responseLength: data.response?.length || 0,
        documentsUsed: (data.documents || []).length,
        externalResourcesUsed: (data.externalResources || []).length,
        metadata: data.metadata,
        hasConversationHistory: !!data.conversationHistory,
        hasResponse: !!data.response
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
    console.log('StaticChatPane handleOpenDocument called with:', document);
    
    if (onOpenDocumentInPane) {
      // Open document in the selected documents pane
      const mappedDocument = {
        veeva_document_id: document.id,
        document_name: document.name,
        document_type: document.type,
        version: document.version,
        document_number: document.number
      };
      console.log('Mapped document for pane:', mappedDocument);
      onOpenDocumentInPane(mappedDocument);
    } else {
      // Fallback to direct download if no callback provided
      const [major, minor] = document.version.split('.');
      const url = `/api/download-file?docId=${document.id}&major=${major}&minor=${minor}`;
      const a = document.createElement('a');
      a.href = url;
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
      a.download = '';
      document.body.appendChild(a);
      a.click();
      a.remove();
    }
  };

  const handleCloseViewer = () => {
    setViewerOpen(false);
    setSelectedDocument(null);
  };

  // Workflow handling functions
  const detectWorkflow = async (message) => {
    try {
      const response = await fetch('/api/workflow-execution/detect-workflow', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          message: message,
          sessionId: Date.now().toString() // Simple session identifier
        })
      });

      if (response.ok) {
        const data = await response.json();
        return data;
      } else {
        console.error('Failed to detect workflow');
        return { shouldStartWorkflow: false, hasActiveWorkflow: false };
      }
    } catch (error) {
      console.error('Error detecting workflow:', error);
      return { shouldStartWorkflow: false, hasActiveWorkflow: false };
    }
  };

  const startWorkflow = async (template, firstStep) => {
    try {
      const response = await fetch('/api/workflow-execution/start-workflow', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          templateId: template.id,
          userId: null, // Could be enhanced to capture user info
          sessionId: Date.now().toString()
        })
      });

      if (response.ok) {
        const data = await response.json();
        
        // Update workflow state
        setWorkflowState({
          isActive: true,
          instanceId: data.instance.id,
          currentStep: data.currentStep,
          template: template,
          responses: {}
        });

        // Add workflow start message to conversation
        setConversationHistory(prev => [
          ...prev,
          { 
            role: 'assistant', 
            content: `🚀 **${template.name}** workflow started!\n\n**${data.currentStep.questionText}**\n\n${data.currentStep.helpText ? `*${data.currentStep.helpText}*` : ''}\n\nType "exit workflow" at any time to cancel.` 
          }
        ]);
      } else {
        const error = await response.json();
        console.error('Failed to start workflow:', error);
        setConversationHistory(prev => [
          ...prev,
          { 
            role: 'assistant', 
            content: `Sorry, I couldn't start the workflow. Please try again.` 
          }
        ]);
      }
    } catch (error) {
      console.error('Error starting workflow:', error);
      setConversationHistory(prev => [
        ...prev,
        { 
          role: 'assistant', 
          content: `Sorry, I encountered an error starting the workflow. Please try again.` 
        }
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleWorkflowStepSubmission = async (response) => {
    try {
      // Validate workflow state
      if (!workflowState.instanceId || !workflowState.currentStep || !workflowState.currentStep.id) {
        console.error('Invalid workflow state:', workflowState);
        setConversationHistory(prev => [
          ...prev,
          { 
            role: 'assistant', 
            content: `Sorry, there was an issue with the workflow state. Please restart the workflow.` 
          }
        ]);
        setIsLoading(false);
        return;
      }

      const submitResponse = await fetch('/api/workflow-execution/submit-step', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          instanceId: workflowState.instanceId,
          stepId: workflowState.currentStep.id,
          response: response,
          userId: null,
          sessionId: Date.now().toString()
        })
      });

      if (submitResponse.ok) {
        const data = await submitResponse.json();
        console.log('Step submission response:', data);
        
        // Update workflow state with new step and save response
        setWorkflowState(prev => ({
          ...prev,
          currentStep: data.nextStep,
          responses: { ...prev.responses, [workflowState.currentStep.id]: response }
        }));

        if (data.isComplete) {
          // Workflow completed, generate final document
          await completeWorkflow();
        } else if (data.nextStep) {
          // Show next step
          setConversationHistory(prev => [
            ...prev,
            { 
              role: 'assistant', 
              content: `✅ Response recorded!\n\n**${data.nextStep.questionText}**\n\n${data.nextStep.helpText ? `*${data.nextStep.helpText}*` : ''}` 
            }
          ]);
        }
      } else {
        const error = await submitResponse.json();
        console.error('Failed to submit workflow step:', error);
        setConversationHistory(prev => [
          ...prev,
          { 
            role: 'assistant', 
            content: `Sorry, I couldn't process your response. Please try again.` 
          }
        ]);
      }
    } catch (error) {
      console.error('Error submitting workflow step:', error);
      setConversationHistory(prev => [
        ...prev,
        { 
          role: 'assistant', 
          content: `Sorry, I encountered an error processing your response. Please try again.` 
        }
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  const completeWorkflow = async () => {
    try {
      const response = await fetch('/api/workflow-execution/complete-workflow', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          instanceId: workflowState.instanceId
        })
      });

      if (response.ok) {
        const data = await response.json();
        
        // Reset workflow state
        setWorkflowState({
          isActive: false,
          instanceId: null,
          currentStep: null,
          template: null,
          responses: {}
        });

        // Show completion message with generated document
        setConversationHistory(prev => [
          ...prev,
          { 
            role: 'assistant', 
            content: `🎉 **${workflowState.template.name}** completed successfully!\n\n**Generated Document:**\n\n\`\`\`\n${data.generatedDocument}\n\`\`\`\n\nYou can copy this document or ask me to help you format it further.` 
          }
        ]);
      } else {
        const error = await response.json();
        console.error('Failed to complete workflow:', error);
        setConversationHistory(prev => [
          ...prev,
          { 
            role: 'assistant', 
            content: `Sorry, I couldn't complete the workflow. Please try again.` 
          }
        ]);
      }
    } catch (error) {
      console.error('Error completing workflow:', error);
      setConversationHistory(prev => [
        ...prev,
        { 
          role: 'assistant', 
          content: `Sorry, I encountered an error completing the workflow. Please try again.` 
        }
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  const exitWorkflow = () => {
    setWorkflowState({
      isActive: false,
      instanceId: null,
      currentStep: null,
      template: null,
      responses: {}
    });
    
    setConversationHistory(prev => [
      ...prev,
      { 
        role: 'assistant', 
        content: `Workflow cancelled. How can I help you today?` 
      }
    ]);
    setIsLoading(false);
  };

  const renderMessage = (message, index) => {
    console.log(`Rendering message ${index}:`, { role: message.role, contentLength: message.content?.length });
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
          padding: '16px 20px',
          borderBottom: '1px solid #e5e7eb',
          backgroundColor: '#f8fafc',
          borderTopLeftRadius: '8px',
          borderTopRightRadius: '8px'
        }}>
          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center'
          }}>
            <div>
              <div>
                <h3 style={{ 
                  margin: 0, 
                  fontSize: '18px',
                  color: '#374151',
                  fontWeight: '600',
                  fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
                }}>
                  Document Chat Agent
                </h3>
                {workflowState.isActive && workflowState.template && (
                  <div style={{
                    marginTop: '4px',
                    padding: '4px 8px',
                    backgroundColor: '#4338ca',
                    color: '#ffffff',
                    borderRadius: '4px',
                    fontSize: '12px',
                    fontWeight: '500',
                    display: 'inline-block',
                    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
                  }}>
                    🔄 {workflowState.template.name} - Step {workflowState.currentStep?.stepOrder || 1}
                  </div>
                )}
              </div>
              {selectedDocuments.length > 0 && (
                <p style={{ 
                  margin: '4px 0 0 0', 
                  fontSize: '12px', 
                  color: '#6b7280',
                  fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
                }}>
                  {selectedDocuments.length} document{selectedDocuments.length !== 1 ? 's' : ''} selected
                </p>
              )}
            </div>
            {conversationHistory.length > 0 && (
              <button
                onClick={clearConversation}
                style={{
                  padding: '6px 12px',
                  backgroundColor: '#6b7280',
                  color: '#ffffff',
                  border: 'none',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  fontSize: '12px',
                  fontWeight: '500',
                  fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
                  transition: 'background-color 0.2s ease'
                }}
                onMouseEnter={(e) => e.target.style.backgroundColor = '#4b5563'}
                onMouseLeave={(e) => e.target.style.backgroundColor = '#6b7280'}
                title="Clear conversation"
              >
                Clear
              </button>
            )}
          </div>
        </div>

        {/* Used Documents */}
        {usedDocuments.length > 0 && (
          <div style={{
            padding: '12px 20px',
            backgroundColor: '#2a2a2a',
            borderBottom: '1px solid #2a2a2a',
            fontSize: '12px'
          }}>
            <div style={{
              color: '#ffffff',
              fontWeight: '600',
              marginBottom: '8px'
            }}>
              Using {usedDocuments.length} document{usedDocuments.length !== 1 ? 's' : ''}:
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
              {usedDocuments.map((doc, index) => (
                <span
                  key={index}
                  style={{
                    backgroundColor: '#007bff',
                    color: 'white',
                    padding: '4px 12px',
                    borderRadius: '12px',
                    fontSize: '11px',
                    fontWeight: '500'
                  }}
                  title={`${doc.name} (${doc.number})`}
                >
                  {doc.name.length > 30 ? doc.name.substring(0, 30) + '...' : doc.name}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Used External Resources */}
        {usedExternalResources.length > 0 && (
          <div style={{
            padding: '12px 20px',
            backgroundColor: '#1e3a8a',
            borderBottom: '1px solid #1e3a8a',
            fontSize: '12px'
          }}>
            <div style={{
              color: '#ffffff',
              fontWeight: '600',
              marginBottom: '8px'
            }}>
              Related external resources ({usedExternalResources.length}):
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
              {usedExternalResources.map((resource, index) => (
                <a
                  key={index}
                  href={resource.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{
                    backgroundColor: '#0ea5e9',
                    color: 'white',
                    padding: '4px 12px',
                    borderRadius: '12px',
                    fontSize: '11px',
                    fontWeight: '500',
                    textDecoration: 'none',
                    display: 'inline-block',
                    transition: 'background-color 0.2s ease'
                  }}
                  onMouseEnter={(e) => e.target.style.backgroundColor = '#0284c7'}
                  onMouseLeave={(e) => e.target.style.backgroundColor = '#0ea5e9'}
                  title={`${resource.title} - ${resource.description || 'No description'}`}
                >
                  {resource.title.length > 25 ? resource.title.substring(0, 25) + '...' : resource.title}
                </a>
              ))}
            </div>
          </div>
        )}

        {/* Messages */}
        <div style={{
          flex: 1,
          overflow: 'auto',
          padding: '20px',
          backgroundColor: '#ffffff'
        }}>
          {conversationHistory.length === 0 ? (
            <div style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              height: '100%',
              textAlign: 'center',
              color: '#6b7280'
            }}>
              <div style={{ fontSize: '48px', marginBottom: '16px' }}>💬</div>
              <h4 style={{ 
                margin: '0 0 8px 0', 
                color: '#374151',
                fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
              }}>
                Chat with your documents
              </h4>
              <p style={{ margin: 0, fontSize: '14px', lineHeight: '1.5' }}>
                Ask questions about your indexed documents. I'll help you find relevant information and answer your questions based on the document content.
              </p>
              {selectedDocuments.length > 0 && (
                <div style={{ 
                  marginTop: '16px', 
                  padding: '12px', 
                  backgroundColor: '#2a2a2a', 
                  borderRadius: '8px',
                  fontSize: '12px',
                  border: '1px solid #333'
                }}>
                  <div style={{ color: '#ffffff', fontWeight: '600', marginBottom: '8px' }}>
                    Selected documents:
                  </div>
                  <ul style={{ margin: '8px 0 0 0', paddingLeft: '20px', color: '#b0b0b0' }}>
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
                    backgroundColor: '#f3f4f6',
                    color: '#6b7280',
                    fontSize: '14px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
                  }}>
                    <div style={{
                      width: '16px',
                      height: '16px',
                      border: '2px solid #d1d5db',
                      borderTop: '2px solid #4338ca',
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
            backgroundColor: '#4a1a1a',
            color: '#ff6b6b',
            borderTop: '1px solid #6a2a2a',
            fontSize: '14px'
          }}>
            <strong>Error:</strong> {error}
          </div>
        )}

        {/* Input */}
        <div style={{
          padding: '16px 20px',
          borderTop: '1px solid #e5e7eb',
          backgroundColor: '#f8fafc',
          borderBottomLeftRadius: '8px',
          borderBottomRightRadius: '8px'
        }}>
          <div style={{ display: 'flex', gap: '12px' }}>
            <textarea
              ref={inputRef}
              value={currentMessage}
              onChange={(e) => setCurrentMessage(e.target.value)}
              onKeyPress={handleKeyPress}
              onFocus={(e) => {
                e.target.style.borderColor = '#4338ca';
                e.target.style.boxShadow = '0 0 0 3px rgba(67, 56, 202, 0.1)';
              }}
              onBlur={(e) => {
                e.target.style.borderColor = '#d1d5db';
                e.target.style.boxShadow = 'none';
              }}
              placeholder={workflowState.isActive ? "Answer the workflow question above..." : "Ask a question about your documents..."}
              disabled={isLoading}
              style={{
                flex: 1,
                padding: '12px',
                border: '1px solid #d1d5db',
                borderRadius: '8px',
                resize: 'none',
                fontSize: '14px',
                fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
                minHeight: '44px',
                maxHeight: '120px',
                backgroundColor: '#ffffff',
                color: '#374151',
                outline: 'none',
                transition: 'border-color 0.2s ease'
              }}
              rows={1}
            />
            <button
              onClick={sendMessage}
              disabled={!currentMessage.trim() || isLoading}
              style={{
                padding: '12px 20px',
                backgroundColor: (!currentMessage.trim() || isLoading) ? '#9ca3af' : '#4338ca',
                color: 'white',
                border: 'none',
                borderRadius: '8px',
                cursor: (!currentMessage.trim() || isLoading) ? 'not-allowed' : 'pointer',
                fontSize: '14px',
                fontWeight: '500',
                fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
                minWidth: '80px',
                transition: 'background-color 0.2s ease'
              }}
              onMouseEnter={(e) => {
                if (currentMessage.trim() && !isLoading) {
                  e.target.style.backgroundColor = '#312e81';
                }
              }}
              onMouseLeave={(e) => {
                if (currentMessage.trim() && !isLoading) {
                  e.target.style.backgroundColor = '#4338ca';
                }
              }}
            >
              {isLoading ? '...' : 'Send'}
            </button>
          </div>
          <div style={{
            marginTop: '8px',
            fontSize: '12px',
            color: '#6b7280',
            textAlign: 'center',
            fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
          }}>
            Press Enter to send, Shift+Enter for new line
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
