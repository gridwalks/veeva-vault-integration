import { useState, useRef, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import DocumentViewer from './DocumentViewer.jsx';
import { createQAInteraction } from '../api';

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

    // Check if user is responding to a workflow offer
    const lastMessage = conversationHistory[conversationHistory.length - 1];
    if (lastMessage && lastMessage.metadata && lastMessage.metadata.isWorkflowOffer) {
      const affirmativeResponses = ['yes', 'yeah', 'yep', 'sure', 'ok', 'okay', 'start', 'start workflow', 'begin', 'let\'s do it', 'proceed'];
      const negativeResponses = ['no', 'nope', 'not now', 'cancel', 'skip', 'maybe later'];
      
      const userResponseLower = userMessage.toLowerCase().trim();
      
      if (affirmativeResponses.some(resp => userResponseLower.includes(resp))) {
        // User accepted the workflow offer
        await startWorkflow(lastMessage.metadata.workflowTemplate, lastMessage.metadata.workflowFirstStep);
        return;
      } else if (negativeResponses.some(resp => userResponseLower.includes(resp))) {
        // User declined the workflow offer
        setConversationHistory(prev => [
          ...prev,
          { 
            role: 'assistant', 
            content: `No problem! Let me know if you need anything else.` 
          }
        ]);
        setIsLoading(false);
        return;
      }
      // If unclear response, let it fall through to normal chat
    }

    try {
      // Proceed with normal chat (will detect workflow after answering)
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

      // Capture Q&A interaction for storage
      if (data.response && (data.documents || []).length > 0) {
        await captureQAInteraction(userMessage, data.response, data.documents || []);
      }

      console.log('Chat response received:', {
        responseLength: data.response?.length || 0,
        documentsUsed: (data.documents || []).length,
        externalResourcesUsed: (data.externalResources || []).length,
        metadata: data.metadata,
        hasConversationHistory: !!data.conversationHistory,
        hasResponse: !!data.response
      });

      // After answering, check if we should offer a workflow
      try {
        console.log('Detecting workflow for message:', userMessage);
        const workflowDetection = await detectWorkflow(userMessage);
        console.log('Workflow detection result:', workflowDetection);
        
        if (workflowDetection.shouldStartWorkflow && workflowDetection.template && !workflowDetection.hasActiveWorkflow) {
          console.log('Offering workflow:', workflowDetection.template.name);
          // Get the current conversation history (already set by the chat response above)
          setConversationHistory(prev => [
            ...prev,
            {
              role: 'assistant',
              content: `\n\n---\n\n💡 **Would you like help creating a ${workflowDetection.template.name}?**\n\nI can guide you through a step-by-step process to create a professional ${workflowDetection.template.name} document.\n\nWould you like to start the workflow? (Type "yes" or "start workflow" to begin)`,
              metadata: {
                isWorkflowOffer: true,
                workflowTemplate: workflowDetection.template,
                workflowFirstStep: workflowDetection.firstStep
              }
            }
          ]);
        } else {
          console.log('Workflow not offered:', {
            shouldStart: workflowDetection.shouldStartWorkflow,
            hasTemplate: !!workflowDetection.template,
            hasActive: workflowDetection.hasActiveWorkflow
          });
        }
      } catch (workflowError) {
        console.error('Workflow detection error:', workflowError);
        // Don't let workflow detection errors break the chat
      }
      
      setIsLoading(false);

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
        const errorText = await response.text();
        console.error('Failed to detect workflow:', response.status, errorText);
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

        // Build workflow start message (no SOP search during workflow)
        let startMessage = `🚀 **${template.name}** workflow started!\n\n`;
        startMessage += `**${data.currentStep.questionText}**\n\n${data.currentStep.helpText ? `*${data.currentStep.helpText}*` : ''}\n\nType "exit workflow" at any time to cancel.`;

        // Add workflow start message to conversation
        setConversationHistory(prev => [
          ...prev,
          { 
            role: 'assistant', 
            content: startMessage
          }
        ]);
        
        // Clear used documents when starting workflow
        setUsedDocuments([]);
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
          // Build response message
          let responseMessage = '✅ Response recorded!';
          
          // If a group was completed with AI synthesis, show feedback
          if (data.groupCompleted && data.synthesizedOutput) {
            responseMessage += '\n\n✨ **AI Synthesis Complete!**\n\n';
            responseMessage += '_Your responses have been combined into a cohesive section:_\n\n';
            responseMessage += `> ${data.synthesizedOutput.substring(0, 200)}${data.synthesizedOutput.length > 200 ? '...' : ''}\n\n`;
            responseMessage += '_The full synthesized text will appear in your final document._';
          }
          
          // Show next step
          responseMessage += `\n\n**${data.nextStep.questionText}**\n\n${data.nextStep.helpText ? `*${data.nextStep.helpText}*` : ''}`;
          
          setConversationHistory(prev => [
            ...prev,
            { 
              role: 'assistant', 
              content: responseMessage
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
    setIsLoading(true);
    
    // Show progress message to user
    setConversationHistory(prev => [
      ...prev,
      { 
        role: 'assistant', 
        content: `Processing your workflow completion...\n\n⏳ **Generating document from your responses**\n✨ **Enhancing with AI for grammar and clarity**\n\nThis may take a few moments...` 
      }
    ]);
    
    try {
      // Create an AbortController for timeout
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 30000); // 30 second timeout
      
      const response = await fetch('/api/workflow-execution/complete-workflow', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          instanceId: workflowState.instanceId
        }),
        signal: controller.signal
      });
      
      clearTimeout(timeoutId);

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

        // Build completion message (shorter - document shown in right pane)
        let completionMessage = `🎉 **${workflowState.template.name}** completed successfully!\n\n`;
        
        if (data.hasAiImprovements && data.polishedDocument) {
          completionMessage += `✨ **AI has reviewed and improved your document!**\n\n`;
          completionMessage += `**Improvements Made:**\n${data.aiSuggestions}\n\n`;
          completionMessage += `📄 Your completed document is now displayed in the right panel.\n\n`;
          completionMessage += `**What you can do:**\n`;
          completionMessage += `- Click **"Edit Document"** to make manual changes\n`;
          completionMessage += `- Click **"Export to Word"** when ready to download\n`;
          completionMessage += `- The document shows the AI-improved version by default`;
        } else {
          completionMessage += `📄 Your completed document is now displayed in the right panel.\n\n`;
          completionMessage += `**What you can do:**\n`;
          completionMessage += `- Click **"Edit Document"** to make manual changes\n`;
          completionMessage += `- Click **"Export to Word"** when ready to download`;
        }

        setConversationHistory(prev => [
          ...prev,
          { 
            role: 'assistant', 
            content: completionMessage
          }
        ]);

        // Display the completed document in the right pane
        if (onOpenDocumentInPane) {
          const documentToDisplay = data.hasAiImprovements ? data.polishedDocument : data.generatedDocument;
          
          // Create a pseudo-document object for the viewer
          onOpenDocumentInPane({
            veeva_document_id: `workflow_${data.instance.id}`,
            document_name: `${workflowState.template.name} - Completed`,
            document_type: 'Generated Workflow Document',
            version: '1.0',
            document_number: `WF-${data.instance.id}`,
            content: documentToDisplay,
            isWorkflowDocument: true,
            hasAiVersion: data.hasAiImprovements,
            originalContent: data.generatedDocument,
            aiContent: data.polishedDocument
          });
        }
      } else {
        // Handle specific HTTP error codes
        let errorMessage = `Sorry, I couldn't complete the workflow. `;
        
        if (response.status === 504) {
          errorMessage += `The request timed out while processing your document with AI. This can happen with longer documents. Please try again, or contact support if the issue persists.`;
        } else if (response.status === 500) {
          try {
            const error = await response.json();
            console.error('Failed to complete workflow:', error);
            errorMessage += `Server error: ${error.error || 'Unknown error'}. Please try again.`;
          } catch {
            errorMessage += `There was a server error. Please try again in a moment.`;
          }
        } else {
          errorMessage += `Please try again. (Error: ${response.status})`;
        }
        
        setConversationHistory(prev => [
          ...prev,
          { 
            role: 'assistant', 
            content: errorMessage
          }
        ]);
      }
    } catch (error) {
      console.error('Error completing workflow:', error);
      
      // Provide user-friendly error messages
      let errorMessage = `Sorry, I encountered an error completing the workflow. `;
      
      if (error.name === 'AbortError') {
        errorMessage += `The request took too long to complete (timeout after 30 seconds). This usually means the AI processing is taking longer than expected. Your workflow responses have been saved. Please try again or contact support if this persists.`;
      } else if (error.name === 'SyntaxError' && error.message.includes('JSON')) {
        errorMessage += `The server response was incomplete (likely due to a timeout). Your workflow data has been saved, but the AI enhancement couldn't complete. Please try again.`;
      } else if (error.message.includes('timeout') || error.message.includes('network')) {
        errorMessage += `There was a network issue. Please check your connection and try again.`;
      } else {
        errorMessage += `Please try again. If the problem persists, contact support.`;
      }
      
      setConversationHistory(prev => [
        ...prev,
        { 
          role: 'assistant', 
          content: errorMessage
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
            padding: '8px 12px',
            borderRadius: '12px',
            backgroundColor: isUser ? '#007bff' : '#f1f3f4',
            color: isUser ? 'white' : '#333',
            fontSize: '13px',
            lineHeight: '1.4',
            wordWrap: 'break-word'
          }}
        >
          {isAssistant ? (
            <ReactMarkdown 
              remarkPlugins={[remarkGfm]}
              components={{
                a: ({ node, ...props }) => (
                  <a 
                    {...props} 
                    target="_blank" 
                    rel="noopener noreferrer"
                    style={{
                      color: '#007bff',
                      textDecoration: 'underline',
                      cursor: 'pointer'
                    }}
                  />
                )
              }}
            >
              {message.content}
            </ReactMarkdown>
          ) : (
            message.content
          )}
        </div>

        {/* Note: Export buttons removed from chat - use the right pane editor instead */}

        {/* Workflow offer buttons */}
        {isAssistant && message.metadata && message.metadata.isWorkflowOffer && (
          <div style={{
            maxWidth: '80%',
            marginTop: '8px',
            padding: '12px',
            backgroundColor: '#eff6ff',
            borderRadius: '8px',
            border: '1px solid #bfdbfe'
          }}>
            <div style={{ display: 'flex', gap: '12px', justifyContent: 'center' }}>
              <button
                onClick={() => {
                  // Simulate user typing "yes"
                  setCurrentMessage('yes');
                  // Trigger send immediately
                  setTimeout(() => {
                    const sendBtn = document.querySelector('button[type="button"]');
                    if (sendBtn && sendBtn.textContent === 'Send') {
                      sendBtn.click();
                    }
                  }, 100);
                }}
                style={{
                  padding: '10px 20px',
                  backgroundColor: '#16a34a',
                  color: 'white',
                  border: 'none',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  fontSize: '14px',
                  fontWeight: '500',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
                  transition: 'background-color 0.2s ease'
                }}
                onMouseEnter={(e) => e.target.style.backgroundColor = '#15803d'}
                onMouseLeave={(e) => e.target.style.backgroundColor = '#16a34a'}
              >
                <span>✅</span>
                Yes, Start Workflow
              </button>
              <button
                onClick={() => {
                  // Simulate user typing "no"
                  setCurrentMessage('no');
                  // Trigger send immediately
                  setTimeout(() => {
                    const sendBtn = document.querySelector('button[type="button"]');
                    if (sendBtn && sendBtn.textContent === 'Send') {
                      sendBtn.click();
                    }
                  }, 100);
                }}
                style={{
                  padding: '10px 20px',
                  backgroundColor: '#6b7280',
                  color: 'white',
                  border: 'none',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  fontSize: '14px',
                  fontWeight: '500',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
                  transition: 'background-color 0.2s ease'
                }}
                onMouseEnter={(e) => e.target.style.backgroundColor = '#4b5563'}
                onMouseLeave={(e) => e.target.style.backgroundColor = '#6b7280'}
              >
                <span>❌</span>
                No Thanks
              </button>
            </div>
          </div>
        )}

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

        {/* External resources for the last assistant message */}
        {isLastAssistantMessage && usedExternalResources && usedExternalResources.length > 0 && (
          <div style={{
            maxWidth: '80%',
            marginTop: '8px',
            padding: '12px',
            backgroundColor: '#eff6ff',
            borderRadius: '8px',
            border: '1px solid #bfdbfe'
          }}>
            <div style={{
              fontSize: '12px',
              fontWeight: '600',
              color: '#1e40af',
              marginBottom: '8px',
              display: 'flex',
              alignItems: 'center',
              gap: '4px'
            }}>
              🔗 Related external resources:
            </div>
            
            <div style={{
              display: 'flex',
              flexDirection: 'column',
              gap: '6px'
            }}>
              {usedExternalResources.map((resource, resIndex) => (
                <div key={resIndex} style={{
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
                      {resource.title}
                    </div>
                    {resource.description && (
                      <div style={{
                        fontSize: '11px',
                        color: '#666'
                      }}>
                        {resource.description}
                      </div>
                    )}
                  </div>
                  <a
                    href={resource.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{
                      padding: '6px 12px',
                      backgroundColor: '#1e40af',
                      color: 'white',
                      border: 'none',
                      borderRadius: '4px',
                      cursor: 'pointer',
                      fontSize: '11px',
                      fontWeight: '500',
                      whiteSpace: 'nowrap',
                      marginLeft: '8px',
                      textDecoration: 'none',
                      display: 'inline-block'
                    }}
                  >
                    Open
                  </a>
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
          padding: '10px 14px',
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
                  fontSize: '14px',
                  color: '#374151',
                  fontWeight: '600',
                  fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
                }}>
                  Document Chat Agent
                </h3>
                {workflowState.isActive && workflowState.template && (
                  <div style={{
                    marginTop: '4px',
                    padding: '3px 6px',
                    backgroundColor: '#4338ca',
                    color: '#ffffff',
                    borderRadius: '3px',
                    fontSize: '10px',
                    fontWeight: '500',
                    display: 'inline-block',
                    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
                  }}>
                    🔄 {workflowState.template.name} - Step {workflowState.currentStep?.stepOrder || 1}
                  </div>
                )}
              </div>
            </div>
            {conversationHistory.length > 0 && (
              <button
                onClick={clearConversation}
                style={{
                  padding: '4px 10px',
                  backgroundColor: '#6b7280',
                  color: '#ffffff',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  fontSize: '11px',
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

        {/* Messages */}
        <div style={{
          flex: 1,
          overflow: 'auto',
          padding: '12px',
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
              <div style={{ fontSize: '48px', marginBottom: '16px' }}>🚀</div>
              <h4 style={{ 
                margin: '0 0 8px 0', 
                color: '#374151',
                fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
              }}>
                What can I help you with today?
              </h4>
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
          padding: '10px 14px',
          borderTop: '1px solid #e5e7eb',
          backgroundColor: '#f8fafc',
          borderBottomLeftRadius: '8px',
          borderBottomRightRadius: '8px'
        }}>
          <div style={{ display: 'flex', gap: '8px' }}>
            <textarea
              ref={inputRef}
              value={currentMessage}
              onChange={(e) => setCurrentMessage(e.target.value)}
              onKeyPress={handleKeyPress}
              onFocus={(e) => {
                e.target.style.borderColor = '#4338ca';
                e.target.style.boxShadow = '0 0 0 2px rgba(67, 56, 202, 0.1)';
              }}
              onBlur={(e) => {
                e.target.style.borderColor = '#d1d5db';
                e.target.style.boxShadow = 'none';
              }}
              placeholder={workflowState.isActive ? "Answer the workflow question above..." : "Ask a question about your documents..."}
              disabled={isLoading}
              style={{
                flex: 1,
                padding: '8px 10px',
                border: '1px solid #d1d5db',
                borderRadius: '6px',
                resize: 'none',
                fontSize: '13px',
                fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
                minHeight: '36px',
                maxHeight: '100px',
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
                padding: '8px 16px',
                backgroundColor: (!currentMessage.trim() || isLoading) ? '#9ca3af' : '#4338ca',
                color: 'white',
                border: 'none',
                borderRadius: '6px',
                cursor: (!currentMessage.trim() || isLoading) ? 'not-allowed' : 'pointer',
                fontSize: '13px',
                fontWeight: '500',
                fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
                minWidth: '70px',
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
            marginTop: '4px',
            fontSize: '10px',
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
