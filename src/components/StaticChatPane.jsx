import { useState, useRef, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { useAuth0 } from '@auth0/auth0-react';
import DocumentViewer from './DocumentViewer.jsx';
import ChatPromptBox from './ChatPromptBox.jsx';
import { createQAInteraction, getUploadedDocuments, downloadUploadedDocumentUrl, updateQAFeedback, pauseWorkflow, resumeWorkflow, saveChatSession, getChatSession } from '../api';

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

export default function StaticChatPane({ selectedDocuments = [], onOpenDocumentInPane, userId, resumeWorkflowId, onResumeWorkflowComplete, loadChatSessionId, onLoadChatSessionComplete, onReferencedDocumentsUpdate, onClearWorkspace }) {
  const { user, getAccessTokenSilently } = useAuth0();
  const [conversationHistory, setConversationHistory] = useState([]);
  const [attachedDocuments, setAttachedDocuments] = useState([]);
  const [isProcessingAttachments, setIsProcessingAttachments] = useState(false);
  const [uploadedBlobs, setUploadedBlobs] = useState([]);
  const [purgeUploadsOnClear, setPurgeUploadsOnClear] = useState(true);
  const [interactionIds, setInteractionIds] = useState(new Map()); // Track interaction IDs by message index
  
  // Debug conversation history changes
  useEffect(() => {
    console.log('Conversation history updated:', conversationHistory.length, 'messages');
    conversationHistory.forEach((msg, index) => {
      console.log(`Message ${index}:`, { role: msg.role, content: msg.content?.substring(0, 50) + '...' });
    });
  }, [conversationHistory]);

  useEffect(() => {
    uploadedBlobKeysRef.current = uploadedBlobs.map(blob => blob.key);
  }, [uploadedBlobs]);

  useEffect(() => {
    return () => {
      if (purgeUploadsOnClear && uploadedBlobKeysRef.current.length > 0) {
        purgeUploadedBlobs(uploadedBlobKeysRef.current);
      }
    };
  }, [purgeUploadsOnClear]);
  const [currentMessage, setCurrentMessage] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const [usedDocuments, setUsedDocuments] = useState([]);
  const [usedExternalResources, setUsedExternalResources] = useState([]);
  const [viewerOpen, setViewerOpen] = useState(false);
  const [selectedDocument, setSelectedDocument] = useState(null);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(null);
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

  // Workflow state
  const [workflowState, setWorkflowState] = useState({
    isActive: false,
    instanceId: null,
    currentStep: null,
    template: null,
    responses: {}
  });

  useEffect(() => {
    // Only scroll to bottom when user sends a message (isLoading becomes true)
    // Don't scroll when AI responds (isLoading becomes false)
    if (isLoading && !prevLoadingRef.current) {
      // User just sent a message - scroll to bottom
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
    prevLoadingRef.current = isLoading;
  }, [conversationHistory, isLoading]);

  // Handle resume workflow from WorkflowHistory
  useEffect(() => {
    if (resumeWorkflowId && user) {
      console.log('Resuming workflow:', resumeWorkflowId);
      handleResumeWorkflow(resumeWorkflowId);
      // Clear the resumeWorkflowId to prevent re-triggering
      if (onResumeWorkflowComplete) {
        onResumeWorkflowComplete();
      }
    }
  }, [resumeWorkflowId, user, onResumeWorkflowComplete]);

  // Handle load chat session
  useEffect(() => {
    if (loadChatSessionId && user) {
      console.log('Loading chat session:', loadChatSessionId);
      handleLoadChatSession(loadChatSessionId);
      // Clear the loadChatSessionId to prevent re-triggering
      if (onLoadChatSessionComplete) {
        onLoadChatSessionComplete();
      }
    }
  }, [loadChatSessionId, user, onLoadChatSessionComplete]);

  const handleLoadChatSession = async (sessionId) => {
    try {
      const sessionData = await getChatSession({ sessionId });
      
      if (sessionData && sessionData.conversation_history) {
        // Parse JSON if it's a string
        const history = typeof sessionData.conversation_history === 'string' 
          ? JSON.parse(sessionData.conversation_history)
          : sessionData.conversation_history;
        
        // Load conversation history
        setConversationHistory(history);
        
        // Restore document metadata if available
        if (sessionData.document_metadata) {
          const metadata = typeof sessionData.document_metadata === 'string'
            ? JSON.parse(sessionData.document_metadata)
            : sessionData.document_metadata;
          
          // Note: We're setting metadata but the actual documents may not be available
          // This is informational for the user
          console.log('Session document metadata:', metadata);
          
          // Attempt to restore uploaded blobs (these may no longer exist)
          if (metadata.uploadedBlobs && Array.isArray(metadata.uploadedBlobs)) {
            setUploadedBlobs(metadata.uploadedBlobs);
          }
        }
        
        // Scroll to top of messages
        setTimeout(() => {
          if (messagesEndRef.current) {
            messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
          }
        }, 100);
        
        console.log('Chat session loaded successfully');
      } else {
        console.error('Invalid session data received');
      }
    } catch (error) {
      console.error('Error loading chat session:', error);
      setError(`Failed to load chat session: ${error.message}`);
    }
  };


  const uploadFileToBlob = async (file) => {
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
      type: file.type
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
          urlReturned: Boolean(upload.url)
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

      // If not all files uploaded successfully, show detailed error
      if (newBlobUploads.length !== files.length) {
        const failedCount = files.length - newBlobUploads.length;
        const errorMessage = {
          role: 'assistant',
          content: `⚠️ Warning: Only ${newBlobUploads.length} of ${files.length} files uploaded successfully. ${failedCount} file${failedCount !== 1 ? 's' : ''} failed to process. This is usually due to file size limits (files over 5MB may not process correctly) or content complexity. Please try with smaller files.`
        };
        setConversationHistory(prev => [...prev, errorMessage]);
      }
      
      // Remove the processing message and add confirmation
      setConversationHistory(prev => {
        const withoutProcessing = prev.filter(msg => !msg.content.includes('Processing'));
        return [
          ...withoutProcessing,
          {
            role: 'assistant',
            content: `✅ Files processed successfully! Now I can answer your question about the ${newBlobUploads.length} upload${newBlobUploads.length !== 1 ? 's' : ''} you attached.`
          }
        ];
      });
    }

    // Check for exit workflow command
    if (userMessage.toLowerCase().includes('exit workflow')) {
      exitWorkflow();
      return;
    }

    // Check for save and exit workflow command
    if (userMessage.toLowerCase().includes('save and exit')) {
      await saveAndExitWorkflow();
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
      // Combine Veeva document IDs and attached document IDs (including newly uploaded ones)
      const veevaDocIds = selectedDocuments.map(doc => doc.veeva_document_id);
      const attachedDocIds = attachedDocuments.map(doc => doc.id);
      const allDocumentIds = [...veevaDocIds, ...attachedDocIds];
      
      // Check if user is asking for comparison but hasn't selected any documents
      // Use more restrictive patterns that clearly indicate comparison intent
      const lowerMessage = userMessage.toLowerCase();
      const isComparisonQuery = lowerMessage.includes('compare') || 
                               lowerMessage.includes('comparison') ||
                               lowerMessage.includes('compare to') ||
                               lowerMessage.includes('compare with') ||
                               lowerMessage.includes('review against') ||
                               lowerMessage.includes('errors based on') ||
                               lowerMessage.includes('differences between') ||
                               (lowerMessage.includes('versus') && (lowerMessage.includes('document') || lowerMessage.includes('doc'))) ||
                               (lowerMessage.includes('vs') && (lowerMessage.includes('document') || lowerMessage.includes('doc')));
      
      // Check if user has documents (either attached or in current message)
      const hasDocuments = allDocumentIds.length > 0 || (files && files.length > 0) || uploadedBlobs.length > 0 || newBlobUploads.length > 0;
      
      if (isComparisonQuery && !hasDocuments) {
        // Add a helpful message about selecting documents
        const helpfulMessage = {
          role: 'assistant',
          content: `I'd be happy to help you compare documents! However, I don't see any documents selected for comparison.

**To compare documents, please:**

1. **Click the + button** (📎) next to the text input to attach your files
2. **Type your comparison question** and click send

The documents will be automatically included in the comparison analysis.

**Supported file types:** PDF, DOC, DOCX, TXT, CSV`
        };
        
        setConversationHistory(prev => [...prev, helpfulMessage]);
        setIsLoading(false);
        return;
      }
      
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

      const requestBody = {
        message: userMessage,
        documentIds: allDocumentIds,
        conversationHistory: newHistory,
        userId: userId,
        attachments: blobAttachmentsForRequest
      };
      
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
      
      console.log('Sending chat request:', {
        message: userMessage,
        documentIds: requestBody.documentIds,
        selectedDocumentsCount: selectedDocuments.length,
        attachedDocumentsCount: attachedDocuments.length,
        newUploadCount: newBlobUploads.length,
        totalBlobAttachments: blobAttachmentsForRequest.length,
        conversationHistoryLength: newHistory.length
      });
      
      // Get access token for authentication
      if (!user) {
        throw new Error('User not authenticated. Please log in.');
      }
      
      let accessToken;
      try {
        accessToken = await getAccessTokenSilently();
        if (!accessToken) {
          throw new Error('Failed to retrieve access token');
        }
        console.log('Access token retrieved successfully', { 
          tokenLength: accessToken.length, 
          tokenPrefix: accessToken.substring(0, 20) + '...' 
        });
      } catch (tokenError) {
        console.error('Error retrieving access token:', tokenError);
        throw new Error('Authentication failed: Unable to retrieve access token. Please try logging out and back in.');
      }
      
      const headers = {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${accessToken}`
      };
      console.log('Request headers:', { 
        hasAuthorization: !!headers.Authorization, 
        authHeaderPrefix: headers.Authorization?.substring(0, 20) + '...' 
      });
      
      const response = await fetch('/api/chat-with-documents', {
        method: 'POST',
        headers,
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
      
      // Handle different response formats - prioritize conversationHistory
      if (data.conversationHistory && Array.isArray(data.conversationHistory) && data.conversationHistory.length > 0) {
        // API returns full conversation history - use it directly
        console.log('Using API conversation history:', data.conversationHistory.length, 'messages');
        console.log('Raw conversation history:', data.conversationHistory.map((msg, i) => ({ index: i, role: msg.role, content: msg.content.substring(0, 50) + '...' })));
        
        // Only remove obvious duplicates (same role and content in consecutive messages)
        const cleanedHistory = [];
        for (let i = 0; i < data.conversationHistory.length; i++) {
          const message = data.conversationHistory[i];
          const prevMessage = cleanedHistory[cleanedHistory.length - 1];
          
          // Only skip if this is an exact duplicate of the previous message
          if (prevMessage && 
              prevMessage.role === message.role && 
              prevMessage.content === message.content &&
              prevMessage.content.trim().length > 0) {
            console.log(`Removing exact duplicate message at index ${i}:`, message.content.substring(0, 50) + '...');
            continue;
          }
          
          cleanedHistory.push(message);
        }
        
        console.log('Cleaned conversation history:', cleanedHistory.length, 'messages');
        console.log('Cleaned conversation history details:', cleanedHistory.map((msg, i) => ({ index: i, role: msg.role, content: msg.content.substring(0, 50) + '...' })));
        setConversationHistory(cleanedHistory);
      } else if (data.response && data.response.trim().length > 0) {
        // Fallback: API returns just the response, append to existing history
        console.log('Fallback: Appending API response to existing history');
        console.log('Response content:', data.response.substring(0, 100) + '...');
        setConversationHistory(prev => {
          // Remove the last message if it's a duplicate user message
          const lastMessage = prev[prev.length - 1];
          if (lastMessage && lastMessage.role === 'user' && lastMessage.content === userMessage) {
            console.log('Removing duplicate user message before adding assistant response');
            return [
              ...prev.slice(0, -1),
              { role: 'assistant', content: data.response }
            ];
          }
          return [
            ...prev,
            { role: 'assistant', content: data.response }
          ];
        });
      } else {
        console.error('Unexpected API response format or empty response:', data);
        throw new Error('Unexpected response format from chat API or empty response received');
      }

      
      setUsedDocuments(data.documents || []);
      setUsedExternalResources(data.externalResources || []);

      // Notify parent component about referenced documents and external resources
      if (onReferencedDocumentsUpdate) {
        onReferencedDocumentsUpdate(data.documents || [], data.externalResources || []);
      }

      // Capture Q&A interaction for storage
      if (data.response && (data.documents || []).length > 0) {
        await captureQAInteraction(userMessage, data.response, data.documents || [], conversationHistory.length);
      }

      console.log('Chat response received:', {
        responseLength: data.response?.length || 0,
        responsePreview: data.response ? data.response.substring(0, 100) + '...' : 'No response',
        documentsUsed: (data.documents || []).length,
        externalResourcesUsed: (data.externalResources || []).length,
        metadata: data.metadata,
        hasConversationHistory: !!data.conversationHistory,
        hasResponse: !!data.response,
        conversationHistoryLength: data.conversationHistory?.length || 0
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
      setConversationHistory(prev => {
        // Ensure we don't duplicate the user message
        const lastMessage = prev[prev.length - 1];
        if (lastMessage && lastMessage.role === 'user' && lastMessage.content === userMessage) {
          return [
            ...prev,
            { 
              role: 'assistant', 
              content: `I'm sorry, I encountered an error: ${err.message}. Please try again.` 
            }
          ];
        } else {
          return [
            ...prev,
            { role: 'user', content: userMessage },
            { 
              role: 'assistant', 
              content: `I'm sorry, I encountered an error: ${err.message}. Please try again.` 
            }
          ];
        }
      });
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

  // Helper function to generate session name from first user question
  const generateSessionName = () => {
    const firstUserMessage = conversationHistory.find(msg => msg.role === 'user');
    if (!firstUserMessage) return null;
    
    const text = firstUserMessage.content;
    if (!text) return 'Chat Session';
    
    // Truncate intelligently at word boundaries (max 50 chars)
    if (text.length <= 50) return text;
    
    const truncated = text.substring(0, 50);
    const lastSpace = truncated.lastIndexOf(' ');
    return lastSpace > 0 ? truncated.substring(0, lastSpace) + '...' : truncated + '...';
  };

  const clearConversation = async () => {
    // Auto-save session before clearing if there are messages
    if (conversationHistory.length > 0 && user?.sub) {
      try {
        const sessionName = generateSessionName();
        const documentMetadata = {
          selectedDocuments: selectedDocuments.map(doc => ({
            id: doc.veeva_document_id,
            name: getDocumentDisplayName(doc),
            number: getDocumentDisplayNumber(doc)
          })),
          attachedDocuments: attachedDocuments.map(doc => ({
            id: doc.id,
            name: getDocumentDisplayName(doc),
            number: getDocumentDisplayNumber(doc)
          })),
          uploadedBlobs: uploadedBlobs.map(blob => ({
            key: blob.key,
            name: blob.name,
            size: blob.size,
            type: blob.type
          }))
        };

        await saveChatSession({
          userId: user.sub,
          sessionName: sessionName || 'Chat Session',
          conversationHistory: conversationHistory,
          documentMetadata: documentMetadata
        });
        
        console.log('Chat session saved successfully');
      } catch (error) {
        console.error('Error saving chat session:', error);
        // Don't block clearing if save fails
      }
    }

    // Now clear the conversation
    setConversationHistory([]);
    setUsedDocuments([]);
    setUsedExternalResources([]);
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
    
    // Clear workspace (referenced documents and external resources)
    if (onClearWorkspace) {
      onClearWorkspace();
    }
  };

  const handleOpenDocument = (document) => {
    console.log('StaticChatPane handleOpenDocument called with:', document);
    const displayName = getDocumentDisplayName(document);
    const displayNumber = getDocumentDisplayNumber(document);

    if (onOpenDocumentInPane) {
      // Route document to the right pane (both Veeva and uploaded documents)
      const mappedDocument = {
        veeva_document_id: document.id,
        // Preserve all ID fields for blob documents
        id: document.id,
        document_id: document.document_id || document.id,
        document_name: displayName,
        document_type: document.type,
        version: document.version,
        document_number: displayNumber,
        // Add uploaded document properties
        isUploaded: document.isUploaded || document.source_type === 'upload',
        source_type: document.source_type || 'veeva'
      };
      console.log('Mapped document for pane:', mappedDocument);
      onOpenDocumentInPane(mappedDocument);
    } else {
      // Fallback to direct download if no callback provided
      if (document.isUploaded || document.source_type === 'upload') {
        // For uploaded documents, use the download API
        const url = downloadUploadedDocumentUrl({ documentId: document.id || document.document_id });
        const a = window.document.createElement('a');
        a.href = url;
        a.target = '_blank';
        a.rel = 'noopener noreferrer';
        a.download = getDocumentSafeName(document) || document.original_filename || document.document_name || 'document';
        window.document.body.appendChild(a);
        a.click();
        a.remove();
      } else {
        // For Veeva documents, use the regular download API
        const [major, minor] = document.version.split('.');
        const url = `/api/download-file?docId=${document.id}&major=${major}&minor=${minor}`;
        const a = window.document.createElement('a');
        a.href = url;
        a.target = '_blank';
        a.rel = 'noopener noreferrer';
        a.download = displayName;
        window.document.body.appendChild(a);
        a.click();
        a.remove();
      }
    }
  };

  const handleCloseViewer = () => {
    setViewerOpen(false);
    setSelectedDocument(null);
  };

  const captureQAInteraction = async (question, answer, documents, messageIndex = null) => {
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
        user_id: userId,
        session_id: Date.now().toString() // Simple session identifier
      });

      console.log('Q&A interaction captured successfully:', result);
      
      // Store interaction ID for feedback functionality
      if (messageIndex !== null && result?.id) {
        console.log('Storing interaction ID:', { messageIndex, interactionId: result.id });
        setInteractionIds(prev => new Map(prev).set(messageIndex, result.id));
      } else {
        console.warn('No interaction ID available for message:', { messageIndex, result });
      }
      
      return result;
    } catch (error) {
      console.warn('Error capturing Q&A interaction:', error);
      // Don't throw error as this shouldn't break the chat functionality
      return null;
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
      if (!user) {
        alert('User not authenticated');
        return;
      }
      
      const response = await fetch('/api/workflow-execution/start-workflow', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          templateId: template.id,
          userId: user.sub, // Auth0 user ID
          createdByUserName: user.name || user.email || 'Unknown User', // Use Auth0 name or email
          sessionId: Date.now().toString(),
          isPublic: false // Default to private
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
        startMessage += `**${data.currentStep.questionText}**\n\n${data.currentStep.helpText ? `*${data.currentStep.helpText}*` : ''}\n\nType "save and exit" to pause, or "exit workflow" to cancel.`;

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
        content: `Processing your workflow completion...\n\n🔄 **Generating document from your responses**\n✨ **Enhancing with AI for grammar and clarity**\n\nThis may take a few moments...` 
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
            aiContent: data.polishedDocument,
            documentVersions: data.documentVersions || [] // Pass version history
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

  const saveAndExitWorkflow = async () => {
    try {
      if (!user) {
        alert('User not authenticated');
        return;
      }
      
      await pauseWorkflow({
        instanceId: workflowState.instanceId,
        userId: user.sub
      });
      
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
          content: 'Workflow saved! You can resume it later from the Workflow History page.' 
        }
      ]);
    } catch (error) {
      console.error('Error saving workflow:', error);
      alert('Failed to save workflow. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleResumeWorkflow = async (instanceId) => {
    try {
      if (!user) {
        alert('User not authenticated');
        return;
      }
      
      const data = await resumeWorkflow({
        instanceId,
        userId: user.sub
      });
      
      // Build summary of completed steps
      let summaryMessage = `Resuming **${data.instance.workflowName}** workflow...\n\n`;
      summaryMessage += `**Progress Summary:**\n`;
      
      data.completedSteps.forEach((step, idx) => {
        const response = data.responses[step.stepOrder];
        summaryMessage += `${idx + 1}. ${step.questionText}\n   ✓ ${response || 'Answered'}\n\n`;
      });
      
      summaryMessage += `---\n\n**${data.currentStep.questionText}**\n\n`;
      summaryMessage += data.currentStep.helpText ? `*${data.currentStep.helpText}*\n\n` : '';
      summaryMessage += `Type your answer or "save and exit" to pause again.`;
      
      // Update workflow state
      setWorkflowState({
        isActive: true,
        instanceId: data.instance.id,
        currentStep: data.currentStep,
        template: { id: data.instance.workflowTemplateId, name: data.instance.workflowName },
        responses: data.responses
      });
      
      // Add resume message to conversation
      setConversationHistory(prev => [
        ...prev,
        { role: 'assistant', content: summaryMessage }
      ]);
      
    } catch (error) {
      console.error('Error resuming workflow:', error);
      alert(error.message || 'Failed to resume workflow. It may have expired.');
    }
  };

  const renderMessage = (message, index) => {
    console.log(`Rendering message ${index}:`, { role: message.role, contentLength: message.content?.length });
    const isUser = message.role === 'user';
    const isAssistant = message.role === 'assistant';
    const isLastAssistantMessage = isAssistant && index === conversationHistory.length - 1;

    const handleCopy = async () => {
      try {
        await navigator.clipboard.writeText(message.content);
        // You could add a toast notification here
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

    const handleLike = async () => {
      console.log('Thumbs up clicked for message index:', index);
      console.log('Current interaction IDs:', Array.from(interactionIds.entries()));
      
      const interactionId = interactionIds.get(index);
      if (interactionId) {
        try {
          console.log('Submitting like for interaction ID:', interactionId);
          await updateQAFeedback({ interactionId, user_rating: 1 });
          console.log('Message liked successfully');
          // You could add visual feedback here
        } catch (error) {
          console.error('Error submitting like:', error);
        }
      } else {
        console.warn('No interaction ID found for this message:', { index, availableIds: Array.from(interactionIds.keys()) });
      }
    };

    const handleDislike = async () => {
      console.log('Thumbs down clicked for message index:', index);
      console.log('Current interaction IDs:', Array.from(interactionIds.entries()));
      
      const interactionId = interactionIds.get(index);
      if (interactionId) {
        try {
          console.log('Submitting dislike for interaction ID:', interactionId);
          await updateQAFeedback({ interactionId, user_rating: -1 });
          console.log('Message disliked successfully');
          // You could add visual feedback here
        } catch (error) {
          console.error('Error submitting dislike:', error);
        }
      } else {
        console.warn('No interaction ID found for this message:', { index, availableIds: Array.from(interactionIds.keys()) });
      }
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
              padding: '8px 12px',
              borderRadius: '12px',
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
                onClick={async () => {
                  // Directly start the workflow
                  await startWorkflow(message.metadata.workflowTemplate, message.metadata.workflowFirstStep);
                }}
                style={{
                  padding: '10px 20px',
                  backgroundColor: '#16a34a',
                  color: 'white',
                  border: 'none',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  fontSize: '13px',
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
                  // Directly handle workflow decline
                  setConversationHistory(prev => [
                    ...prev,
                    { 
                      role: 'assistant', 
                      content: `No problem! Let me know if you need anything else.` 
                    }
                  ]);
                }}
                style={{
                  padding: '10px 20px',
                  backgroundColor: '#6b7280',
                  color: 'white',
                  border: 'none',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  fontSize: '13px',
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
            alignItems: 'center',
            gap: '12px'
          }}>
            <div style={{ flex: 1 }}>
              <div>
                <h3 style={{ 
                  margin: 0, 
                  fontSize: '13px',
                  color: '#374151',
                  fontWeight: '600',
                  fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
                }}>
                  Document Chat Agent
                </h3>
                {selectedDocuments.length > 0 || attachedDocuments.length > 0 || uploadedBlobs.length > 0 ? (
                  <p style={{
                    margin: '2px 0 0 0',
                    fontSize: '11px',
                    color: '#666'
                  }}>
                    {selectedDocuments.length > 0 && `${selectedDocuments.length} Veeva document${selectedDocuments.length !== 1 ? 's' : ''}`}
                    {selectedDocuments.length > 0 && (attachedDocuments.length > 0 || uploadedBlobs.length > 0) && ', '}
                    {attachedDocuments.length > 0 && `${attachedDocuments.length} indexed upload${attachedDocuments.length !== 1 ? 's' : ''}`}
                    {attachedDocuments.length > 0 && uploadedBlobs.length > 0 && ', '}
                    {uploadedBlobs.length > 0 && `${uploadedBlobs.length} chat upload${uploadedBlobs.length !== 1 ? 's' : ''}`}
                    {(selectedDocuments.length + attachedDocuments.length + uploadedBlobs.length) >= 2 && (
                      <span style={{
                        marginLeft: '6px',
                        padding: '1px 4px',
                        backgroundColor: '#e3f2fd',
                        color: '#1976d2',
                        borderRadius: '8px', 
                        fontSize: '10px',
                        fontWeight: '500'
                      }}>
                        🔍 Comparison Ready
                      </span>
                    )}
                    {(attachedDocuments.length > 0 || uploadedBlobs.length > 0) && (
                      <span style={{
                        marginLeft: '6px',
                        padding: '1px 4px',
                        backgroundColor: '#e8f5e8',
                        color: '#2e7d32',
                        borderRadius: '8px',
                        fontSize: '10px',
                        fontWeight: '500'
                      }}>
                        📎 Attachments ready
                      </span>
                    )}
                  </p>
                ) : (
                  <p style={{
                    margin: '2px 0 0 0',
                    fontSize: '11px',
                    color: '#999'
                  }}>
                    No documents selected • Click + to attach files for comparison
                  </p>
                )}
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
                    <img src="/share-icon.png" alt="Workflow" style={{ width: '16px', height: '16px', marginRight: '8px' }} />{workflowState.template.name} - Step {workflowState.currentStep?.stepOrder || 1}
                  </div>
                )}
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              {conversationHistory.length > 0 && (
                <button
                  onClick={clearConversation}
                  style={{
                    padding: '4px 10px',
                    backgroundColor: '#4338ca',
                    color: '#ffffff',
                    border: 'none',
                    borderRadius: '4px',
                    cursor: 'pointer',
                    fontSize: '11px',
                    fontWeight: '500',
                    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
                    transition: 'background-color 0.2s ease'
                  }}
                  onMouseEnter={(e) => e.target.style.backgroundColor = '#312e81'}
                  onMouseLeave={(e) => e.target.style.backgroundColor = '#4338ca'}
                  title="Clear conversation"
                >
                  Clear
                </button>
              )}
            </div>
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
                  fontSize: '13px',
                  border: '1px solid #333'
                }}>
                  <div style={{ color: '#ffffff', fontWeight: '600', marginBottom: '8px' }}>
                    Selected documents:
                  </div>
                  <ul style={{ margin: '8px 0 0 0', paddingLeft: '20px', color: '#b0b0b0' }}>
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
                    backgroundColor: '#f3f4f6',
                    color: '#6b7280',
                    fontSize: '13px',
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
        <div className="p-3">
          <ChatPromptBox
            ref={chatPromptBoxRef}
            onSend={handleChatPromptSend}
            onFilesChange={(files) => {
              // Optional: Handle file changes if needed
            }}
            placeholder={workflowState.isActive ? "Answer the workflow question above..." : "Ask a question about your documents or click + to attach files for comparison..."}
            disabled={isLoading || isProcessingAttachments}
          />
          
          {/* Upload Progress Display */}
          {uploadProgress && (
            <div style={{ marginTop: '8px', fontSize: '11px', color: '#6b7280' }}>
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
