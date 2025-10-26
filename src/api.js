/**
 * Generic API request wrapper
 * Handles timing, error handling, and logging for all API requests
 */
async function apiRequest({ url, params = {}, method = 'GET', body = null, successMessage, errorMessage, headers = {} }) {
  const startTime = Date.now();
  
  try {
    // Build query string from params
    const queryString = params ? new URLSearchParams(params).toString() : '';
    const fullUrl = queryString ? `${url}?${queryString}` : url;
    
    console.log(successMessage || 'API request...', params);
    
    // Build request config
    const config = { method };
    
    // Add headers
    if (Object.keys(headers).length > 0) {
      config.headers = { ...headers };
    }
    if (body) {
      if (!config.headers) config.headers = {};
      config.headers['Content-Type'] = 'application/json';
      config.body = JSON.stringify(body);
    }
    
    // Make request
    const res = await fetch(fullUrl, config);
    
    // Handle error response
    if (!res.ok) {
      let errorText;
      try {
        errorText = await res.text();
        let parsedError;
        try {
          parsedError = JSON.parse(errorText);
        } catch {
          parsedError = { error: errorText };
        }
        console.error(errorMessage || 'Request failed:', {
          status: res.status,
          statusText: res.statusText,
          error: parsedError.error,
          details: parsedError.details,
          url: res.url,
          params
        });
        throw new Error(parsedError.error || errorMessage || `Request failed: ${res.status} ${res.statusText}`);
      } catch (parseError) {
        console.error(errorMessage || 'Request failed:', {
          status: res.status,
          statusText: res.statusText,
          errorText,
          url: res.url,
          params
        });
        throw new Error(errorMessage || `Request failed: ${res.statusText}`);
      }
    }
    // Parse successful response
    const data = await res.json();
    const duration = Date.now() - startTime;
    console.log(`Request completed in ${duration}ms`, data);
    
    return data;
  } catch (error) {
    const duration = Date.now() - startTime;
    console.error(`Request error after ${duration}ms:`, {
      message: error.message,
      stack: error.stack,
      params
    });
    throw error;
  }
}

/**
 * Extract specific data path from response
 */
function extractData(data, path = 'data') {
  if (path === 'data.data') {
    return data?.data?.data || data?.data || data;
  }
  return path ? data?.[path] : data;
}

// Document listing functions
export async function listApproved({ name = "", limit = 50, offset = 0 } = {}) {
  const data = await apiRequest({
    url: '/api/list-approved',
    params: { name, limit, offset },
    successMessage: 'Fetching approved documents...',
    errorMessage: 'Failed to load documents'
  });
  return data;
}

export async function indexDocuments({ name = "", limit = 100, force = false, batchSize = 5, batchOffset = 0 } = {}) {
  const params = { name, limit };
  if (force) params.force = 'true';
  if (batchSize) params.batchSize = batchSize;
  if (batchOffset) params.batchOffset = batchOffset;
  
  return apiRequest({
    url: '/api/index-documents',
    params,
    successMessage: 'Starting document indexing...',
    errorMessage: 'Failed to index documents'
  });
}

export async function getIndexedDocuments({ name = "", limit = 50, offset = 0 } = {}) {
  const data = await apiRequest({
    url: '/api/get-indexed-documents',
    params: { name, limit, offset },
    successMessage: 'Fetching indexed documents...',
    errorMessage: 'Failed to load indexed documents'
  });
  console.log(`Indexed documents fetched:`, {
    total: data.total,
    itemsReturned: data.items?.length || 0,
    pageOffset: data.pageOffset,
    pageSize: data.pageSize,
    apiDuration: data.duration
  });
  return data;
}

export async function getCfrTitle21({ packageId = null, fromDate = null } = {}) {
  const params = {};
  if (packageId) params.packageId = packageId;
  if (fromDate) params.fromDate = fromDate;
  
  const data = await apiRequest({
    url: '/api/cfr-title-21',
    params,
    successMessage: 'Fetching CFR Title 21 data...',
    errorMessage: 'Failed to load CFR Title 21 data'
  });
  
  // Handle application-level errors
  if (data && data.success === false) {
    console.warn('CFR Title 21 API returned an application error', {
      packageId, fromDate, code: data.code, error: data.error, details: data.details
    });
    throw new Error(data.error || 'Unable to load CFR Title 21 data.');
  }
  
  return data;
}

export async function getIndexingLogs({ limit = 50, offset = 0, operationType = null, sourceType = null, status = null, batchId = null, startDate = null, endDate = null } = {}) {
  const params = { limit, offset };
  if (operationType) params.operationType = operationType;
  if (sourceType) params.sourceType = sourceType;
  if (status) params.status = status;
  if (batchId) params.batchId = batchId;
  if (startDate) params.startDate = startDate;
  if (endDate) params.endDate = endDate;
  
  const data = await apiRequest({
    url: '/api/get-indexing-logs',
    params,
    successMessage: 'Fetching indexing logs...',
    errorMessage: 'Failed to fetch indexing logs'
  });
  
  console.log(`Indexing logs fetched:`, {
    logCount: data.logs?.length || 0,
    total: data.pagination?.total || 0,
    hasMore: data.pagination?.hasMore || false
  });
  
  return data;
}

export async function cleanupIndexingLogs({ retentionDays = 30, dryRun = false } = {}) {
  return apiRequest({
    url: '/api/cleanup-indexing-logs',
    params: { retentionDays, dryRun },
    method: 'POST',
    successMessage: 'Cleaning up indexing logs...',
    errorMessage: 'Failed to cleanup indexing logs'
  });
}

export function downloadUrl({ id, major, minor }) {
  const p = new URLSearchParams({ docId: id });
  if (major && minor) { p.set("major", major); p.set("minor", minor); }
  return `/api/download-file?${p}`;
}

export function downloadUploadedDocumentUrl({ documentId }) {
  const p = new URLSearchParams({ documentId });
  return `/api/download-uploaded-document?${p}`;
}

export async function deleteDocument({ documentId, sourceType }) {
  const data = await apiRequest({
    url: '/api/delete-document',
    params: { id: documentId, source_type: sourceType },
    method: 'DELETE',
    successMessage: 'Deleting document...',
    errorMessage: 'Failed to delete document'
  });
  
  console.log(`Document deleted:`, {
    documentId, sourceType, deletedChunks: data.deletedChunks, duration: data.duration
  });
  
  return data;
}

export async function getUploadedDocuments({ limit = 50, offset = 0, search = '', userId } = {}) {
  const params = { limit, offset, userId };
  if (search) params.search = search;
  
  return apiRequest({
    url: '/api/list-uploaded-documents',
    params,
    successMessage: 'Fetching uploaded documents...',
    errorMessage: 'Failed to load uploaded documents'
  });
}

export async function getBlobDocuments({ limit = 50, offset = 0, search = '', userId } = {}) {
  const params = { limit, offset, userId };
  if (search) params.search = search;
  
  return apiRequest({
    url: '/api/list-blob-documents',
    params,
    successMessage: 'Fetching blob documents...',
    errorMessage: 'Failed to load blob documents'
  });
}

export async function updateUploadedDocumentMetadata({ documentId, userId, documentName, safeFileName, documentType, version, manualSummary, aiSummary }) {
  return apiRequest({
    url: '/api/update-uploaded-document',
    method: 'PUT',
    body: { documentId, userId, documentName, safeFileName, documentType, version, manualSummary, aiSummary },
    successMessage: 'Updating uploaded document metadata...',
    errorMessage: 'Failed to update metadata'
  });
}

export async function chatWithDocuments({ message, documentIds = [], conversationHistory = [], userId, attachments = [] }) {
  return apiRequest({
    url: '/api/chat-with-documents',
    method: 'POST',
    body: { message, documentIds, conversationHistory, userId, attachments },
    successMessage: 'Sending chat message...',
    errorMessage: 'Failed to send chat message'
  });
}

export async function updateManualSummary({ documentId, manualSummary }) {
  return apiRequest({
    url: '/api/update-manual-summary',
    method: 'POST',
    body: { documentId, manualSummary },
    successMessage: 'Updating manual summary...',
    errorMessage: 'Failed to update manual summary'
  });
}

// External Resources API functions
export async function getExternalResources() {
  return apiRequest({
    url: '/api/external-resources',
    successMessage: 'Fetching external resources...',
    errorMessage: 'Failed to load external resources'
  });
}

export async function createExternalResource({ title, url, description, category, tags }) {
  return apiRequest({
    url: '/api/external-resources',
    method: 'POST',
    body: { title, url, description, category, tags },
    successMessage: 'Creating external resource...',
    errorMessage: 'Failed to create external resource'
  });
}

export async function updateExternalResource({ id, title, url, description, category, tags }) {
  return apiRequest({
    url: `/api/external-resources/${id}`,
    method: 'PUT',
    body: { title, url, description, category, tags },
    successMessage: 'Updating external resource...',
    errorMessage: 'Failed to update external resource'
  });
}

export async function deleteExternalResource({ id }) {
  return apiRequest({
    url: `/api/external-resources/${id}`,
    method: 'DELETE',
    successMessage: 'Deleting external resource...',
    errorMessage: 'Failed to delete external resource'
  });
}

export async function updateUserProfile({ userId, name, picture, accessToken }) {
  const headers = accessToken ? { Authorization: `Bearer ${accessToken}` } : {};
  
  const data = await apiRequest({
    url: '/api/update-user-profile',
    method: 'PUT',
    body: { userId, name, picture },
    headers,
    successMessage: 'Updating user profile...',
    errorMessage: 'Failed to update user profile'
  });
  
  return data.user;
}

export async function changeUserPassword({ currentPassword, newPassword, userId, accessToken }) {
  const headers = accessToken ? { Authorization: `Bearer ${accessToken}` } : {};
  
  return apiRequest({
    url: '/api/change-user-password',
    method: 'PUT',
    body: { currentPassword, newPassword, userId },
    headers,
    successMessage: 'Changing user password...',
    errorMessage: 'Failed to change password'
  });
}

// Q&A Interactions API functions
export async function getQAInteractions({ page = 1, limit = 50, search = '', user_id, session_id } = {}) {
  const params = { page, limit };
  if (search) params.search = search;
  if (user_id) params.user_id = user_id;
  if (session_id) params.session_id = session_id;
  
  const data = await apiRequest({
    url: '/api/qa-interactions',
    params,
    successMessage: 'Fetching Q&A interactions...',
    errorMessage: 'Failed to load Q&A interactions'
  });
  
  return extractData(data, 'data');
}

export async function createQAInteraction({ question, answer, document_ids = [], document_names = [], user_id, session_id, user_rating = null, feedback_notes = null }) {
  const data = await apiRequest({
    url: '/api/qa-interactions',
    method: 'POST',
    body: { question, answer, document_ids, document_names, user_id, session_id, user_rating, feedback_notes },
    successMessage: 'Creating Q&A interaction...',
    errorMessage: 'Failed to create Q&A interaction'
  });
  
  return extractData(data, 'data');
}

export async function updateQAFeedback({ interactionId, user_rating, feedback_notes = null }) {
  const data = await apiRequest({
    url: `/api/qa-interactions/${interactionId}/feedback`,
    method: 'PUT',
    body: { user_rating, feedback_notes },
    successMessage: 'Updating Q&A feedback...',
    errorMessage: 'Failed to update Q&A feedback'
  });
  
  return extractData(data, 'data');
}

export async function deleteQAInteraction({ id }) {
  return apiRequest({
    url: `/api/qa-interactions/${id}`,
    method: 'DELETE',
    successMessage: 'Deleting Q&A interaction...',
    errorMessage: 'Failed to delete Q&A interaction'
  });
}

export async function exportQAInteractions({ search = '', user_id, session_id, start_date, end_date } = {}) {
  const params = {};
  if (search) params.search = search;
  if (user_id) params.user_id = user_id;
  if (session_id) params.session_id = session_id;
  if (start_date) params.start_date = start_date;
  if (end_date) params.end_date = end_date;
  
  const csvContent = await fetch(`/api/qa-interactions/export?${new URLSearchParams(params)}`)
    .then(res => res.ok ? res.text() : Promise.reject(new Error(`Failed to export: ${res.status}`)));
  
  // Create and download the CSV file
  const blob = new Blob([csvContent], { type: 'text/csv' });
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `qa-interactions-${new Date().toISOString().split('T')[0]}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  window.URL.revokeObjectURL(url);
  
  return { success: true, contentLength: csvContent.length };
}

// Workflow Instances API functions
export async function getWorkflowInstances({ status, limit = 50, offset = 0, userId, viewMode = 'my_workflows', isAdmin = false } = {}) {
  const params = { limit, offset };
  if (status) params.status = status;
  if (userId) params.userId = userId;
  if (viewMode) params.viewMode = viewMode;
  if (isAdmin) params.isAdmin = isAdmin;
  
  return apiRequest({
    url: '/api/workflow-management/workflow-instances',
    params,
    successMessage: 'Fetching workflow instances...',
    errorMessage: 'Failed to load workflow instances'
  });
}

export async function updateWorkflowVisibility({ instanceId, isPublic, userId, isAdmin = false }) {
  return apiRequest({
    url: `/api/workflow-management/workflow-instances/${instanceId}`,
    method: 'PUT',
    body: { isPublic, userId, isAdmin },
    successMessage: 'Updating workflow visibility...',
    errorMessage: 'Failed to update workflow visibility'
  });
}

export async function repolishWorkflowDocument({ instanceId, editedDocument }) {
  return apiRequest({
    url: '/api/workflow-execution/repolish-document',
    method: 'POST',
    body: { instanceId, editedDocument },
    successMessage: 'Re-polishing workflow document...',
    errorMessage: 'Failed to re-polish document'
  });
}

export async function refineWorkflowDocument({ instanceId, currentDocument, instructions }) {
  return apiRequest({
    url: '/api/workflow-execution/refine-document',
    method: 'POST',
    body: { instanceId, currentDocument, instructions },
    successMessage: 'Refining workflow document with AI...',
    errorMessage: 'Failed to refine document'
  });
}

export async function regenerateDocumentSummary({ documentId, sourceType }) {
  return apiRequest({
    url: '/api/regenerate-document-summary',
    method: 'POST',
    body: { documentId, sourceType },
    successMessage: 'Regenerating document summary...',
    errorMessage: 'Failed to regenerate summary'
  });
}

export async function acceptRegeneratedSummary({ documentId, newSummary }) {
  return apiRequest({
    url: '/api/accept-regenerated-summary',
    method: 'POST',
    body: { documentId, newSummary },
    successMessage: 'Accepting regenerated summary...',
    errorMessage: 'Failed to accept summary'
  });
}

export async function pauseWorkflow({ instanceId, userId }) {
  return apiRequest({
    url: '/api/workflow-execution/pause-workflow',
    method: 'POST',
    body: { instanceId, userId },
    successMessage: 'Pausing workflow...',
    errorMessage: 'Failed to pause workflow'
  });
}

export async function resumeWorkflow({ instanceId, userId }) {
  return apiRequest({
    url: '/api/workflow-execution/resume-workflow',
    method: 'POST',
    body: { instanceId, userId },
    successMessage: 'Resuming workflow...',
    errorMessage: 'Failed to resume workflow'
  });
}

export async function deleteWorkflow({ instanceId, userId }) {
  return apiRequest({
    url: '/api/workflow-execution/delete-workflow',
    method: 'POST',
    body: { instanceId, userId },
    successMessage: 'Deleting workflow...',
    errorMessage: 'Failed to delete workflow'
  });
}

// Chat session functions
export async function saveChatSession({ userId, sessionName, conversationHistory, documentMetadata }) {
  const data = await apiRequest({
    url: '/api/chat-sessions',
    method: 'POST',
    body: { user_id: userId, session_name: sessionName, conversation_history: conversationHistory, document_metadata: documentMetadata },
    successMessage: 'Saving chat session...',
    errorMessage: 'Failed to save chat session'
  });
  
  return extractData(data, 'data');
}

export async function getChatSessions({ userId, limit = 20, offset = 0, searchText, startDate, endDate }) {
  const params = { user_id: userId, limit, offset };
  if (searchText) params.search = searchText;
  if (startDate) params.startDate = startDate;
  if (endDate) params.endDate = endDate;
  
  const data = await apiRequest({
    url: '/api/chat-sessions',
    params,
    successMessage: 'Fetching chat sessions...',
    errorMessage: 'Failed to fetch chat sessions'
  });
  
  return extractData(data, 'data');
}

export async function getChatSession({ sessionId }) {
  const data = await apiRequest({
    url: `/api/chat-sessions/${sessionId}`,
    successMessage: 'Fetching chat session...',
    errorMessage: 'Failed to fetch chat session'
  });
  
  return extractData(data, 'data');
}

export async function updateChatSessionName({ sessionId, sessionName }) {
  const data = await apiRequest({
    url: `/api/chat-sessions/${sessionId}`,
    method: 'PUT',
    body: { session_name: sessionName },
    successMessage: 'Updating chat session name...',
    errorMessage: 'Failed to update chat session name'
  });
  
  return extractData(data, 'data');
}

export async function deleteChatSession({ sessionId }) {
  return apiRequest({
    url: `/api/chat-sessions/${sessionId}`,
    method: 'DELETE',
    successMessage: 'Deleting chat session...',
    errorMessage: 'Failed to delete chat session'
  });
}
