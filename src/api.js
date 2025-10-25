export async function listApproved({ name = "", limit = 50, offset = 0 } = {}) {
  const startTime = Date.now();
  console.log('Fetching approved documents...', { name, limit, offset });
  
  try {
    const p = new URLSearchParams({ name, limit, offset });
    const res = await fetch(`/api/list-approved?${p}`);
    
    if (!res.ok) {
      const errorText = await res.text();
      console.error('Failed to load documents:', {
        status: res.status,
        statusText: res.statusText,
        errorText,
        url: res.url,
        params: { name, limit, offset }
      });
      throw new Error(`Failed to load documents: ${res.status} ${res.statusText}`);
    }
    
    const data = await res.json();
    const duration = Date.now() - startTime;
    console.log(`Approved documents fetched in ${duration}ms:`, {
      total: data.total,
      itemsReturned: data.items?.length || 0,
      pageOffset: data.pageOffset,
      pageSize: data.pageSize
    });
    
    return data;
  } catch (error) {
    const duration = Date.now() - startTime;
    console.error(`Error fetching approved documents after ${duration}ms:`, {
      message: error.message,
      stack: error.stack,
      params: { name, limit, offset }
    });
    throw error;
  }
}

export async function indexDocuments({ name = "", limit = 100, force = false, batchSize = 5, batchOffset = 0 } = {}) {
  const startTime = Date.now();
  console.log('Starting document indexing...', { name, limit, force, batchSize, batchOffset });
  
  try {
    const p = new URLSearchParams({ name, limit });
    if (force) p.set('force', 'true');
    if (batchSize) p.set('batchSize', batchSize);
    if (batchOffset) p.set('batchOffset', batchOffset);
    const res = await fetch(`/api/index-documents?${p}`);
    
    if (!res.ok) {
      const errorText = await res.text();
      console.error('Failed to index documents:', {
        status: res.status,
        statusText: res.statusText,
        errorText,
        url: res.url,
        params: { name, limit, force }
      });
      throw new Error(`Failed to index documents: ${res.status} ${res.statusText}`);
    }
    
    const data = await res.json();
    const duration = Date.now() - startTime;
    console.log(`Document indexing completed in ${duration}ms:`, {
      total: data.total,
      processed: data.processed,
      duration: data.duration,
      stats: data.stats,
      batchInfo: data.batchInfo
    });
    
    return data;
  } catch (error) {
    const duration = Date.now() - startTime;
    console.error(`Error indexing documents after ${duration}ms:`, {
      message: error.message,
      stack: error.stack,
      params: { name, limit, force }
    });
    throw error;
  }
}

export async function getIndexedDocuments({ name = "", limit = 50, offset = 0 } = {}) {
  const startTime = Date.now();
  console.log('Fetching indexed documents...', { name, limit, offset });
  
  try {
    const p = new URLSearchParams({ name, limit, offset });
    const res = await fetch(`/api/get-indexed-documents?${p}`);
    
    if (!res.ok) {
      const errorText = await res.text();
      console.error('Failed to load indexed documents:', {
        status: res.status,
        statusText: res.statusText,
        errorText,
        url: res.url,
        params: { name, limit, offset }
      });
      throw new Error(`Failed to load indexed documents: ${res.status} ${res.statusText}`);
    }
    
    const data = await res.json();
    const duration = Date.now() - startTime;
    console.log(`Indexed documents fetched in ${duration}ms:`, {
      total: data.total,
      itemsReturned: data.items?.length || 0,
      pageOffset: data.pageOffset,
      pageSize: data.pageSize,
      apiDuration: data.duration
    });
    
    return data;
  } catch (error) {
    const duration = Date.now() - startTime;
    console.error(`Error fetching indexed documents after ${duration}ms:`, {
      message: error.message,
      stack: error.stack,
      params: { name, limit, offset }
    });
    throw error;
  }
}

export async function getCfrTitle21({ packageId = null, fromDate = null } = {}) {
  const startTime = Date.now();
  console.log('Fetching CFR Title 21 data...', { packageId, fromDate });

  try {
    const params = new URLSearchParams();
    if (packageId) {
      params.set('packageId', packageId);
    }
    if (fromDate) {
      params.set('fromDate', fromDate);
    }

    const url = `/api/cfr-title-21${params.toString() ? `?${params.toString()}` : ''}`;
    const res = await fetch(url);

    if (!res.ok) {
      const errorText = await res.text();
      console.error('Failed to load CFR Title 21 data:', {
        status: res.status,
        statusText: res.statusText,
        errorText,
        url: res.url,
        packageId,
        fromDate
      });
      throw new Error(`Failed to load CFR Title 21 data: ${res.status} ${res.statusText}`);
    }

    const data = await res.json();

    if (data && data.success === false) {
      console.warn('CFR Title 21 API returned an application error', {
        packageId,
        fromDate,
        code: data.code,
        error: data.error,
        details: data.details
      });
      const message = data.error || 'Unable to load CFR Title 21 data.';
      throw new Error(message);
    }

    const duration = Date.now() - startTime;
    console.log('CFR Title 21 data fetched successfully', {
      packageId,
      fromDate,
      hasPackages: Array.isArray(data.packages),
      packageCount: data.packages?.length || 0,
      totalGranules: data.totalGranules || null,
      duration
    });

    return data;
  } catch (error) {
    const duration = Date.now() - startTime;
    console.error('Error fetching CFR Title 21 data', {
      message: error.message,
      stack: error.stack,
      packageId,
      fromDate,
      duration
    });
    throw error;
  }
}

export async function getIndexingLogs({ 
  limit = 50, 
  offset = 0, 
  operationType = null, 
  sourceType = null, 
  status = null, 
  batchId = null, 
  startDate = null, 
  endDate = null 
} = {}) {
  const startTime = Date.now();
  console.log('Fetching indexing logs...', { 
    limit, offset, operationType, sourceType, status, batchId, startDate, endDate 
  });
  
  try {
    const params = new URLSearchParams({ limit, offset });
    if (operationType) params.set('operationType', operationType);
    if (sourceType) params.set('sourceType', sourceType);
    if (status) params.set('status', status);
    if (batchId) params.set('batchId', batchId);
    if (startDate) params.set('startDate', startDate);
    if (endDate) params.set('endDate', endDate);
    
    const res = await fetch(`/api/get-indexing-logs?${params}`);
    
    if (!res.ok) {
      const errorText = await res.text();
      console.error('Failed to fetch indexing logs:', {
        status: res.status,
        statusText: res.statusText,
        errorText,
        url: res.url,
        params: { limit, offset, operationType, sourceType, status, batchId, startDate, endDate }
      });
      throw new Error(`Failed to fetch indexing logs: ${res.status} ${res.statusText}`);
    }
    
    const data = await res.json();
    const duration = Date.now() - startTime;
    console.log(`Indexing logs fetched in ${duration}ms:`, {
      logCount: data.logs?.length || 0,
      total: data.pagination?.total || 0,
      hasMore: data.pagination?.hasMore || false
    });
    
    return data;
  } catch (error) {
    const duration = Date.now() - startTime;
    console.error(`Error fetching indexing logs after ${duration}ms:`, {
      message: error.message,
      stack: error.stack,
      params: { limit, offset, operationType, sourceType, status, batchId, startDate, endDate }
    });
    throw error;
  }
}

export async function cleanupIndexingLogs({ retentionDays = 30, dryRun = false } = {}) {
  const startTime = Date.now();
  console.log('Cleaning up indexing logs...', { retentionDays, dryRun });
  
  try {
    const params = new URLSearchParams({ retentionDays, dryRun });
    
    const res = await fetch(`/api/cleanup-indexing-logs?${params}`, {
      method: 'POST'
    });
    
    if (!res.ok) {
      const errorText = await res.text();
      console.error('Failed to cleanup indexing logs:', {
        status: res.status,
        statusText: res.statusText,
        errorText,
        url: res.url,
        params: { retentionDays, dryRun }
      });
      throw new Error(`Failed to cleanup indexing logs: ${res.status} ${res.statusText}`);
    }
    
    const data = await res.json();
    const duration = Date.now() - startTime;
    console.log(`Indexing logs cleanup completed in ${duration}ms:`, {
      success: data.success,
      logsDeleted: data.logsDeleted,
      dryRun: data.dryRun
    });
    
    return data;
  } catch (error) {
    const duration = Date.now() - startTime;
    console.error(`Error cleaning up indexing logs after ${duration}ms:`, {
      message: error.message,
      stack: error.stack,
      params: { retentionDays, dryRun }
    });
    throw error;
  }
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
  const startTime = Date.now();
  console.log('Deleting document...', { documentId, sourceType });
  
  try {
    const p = new URLSearchParams({ id: documentId, source_type: sourceType });
    const res = await fetch(`/api/delete-document?${p}`, {
      method: 'DELETE'
    });
    
    if (!res.ok) {
      const errorText = await res.text();
      console.error('Failed to delete document:', {
        status: res.status,
        statusText: res.statusText,
        errorText,
        url: res.url,
        params: { documentId, sourceType }
      });
      throw new Error(`Failed to delete document: ${res.status} ${res.statusText}`);
    }
    
    const data = await res.json();
    const duration = Date.now() - startTime;
    console.log(`Document deleted in ${duration}ms:`, {
      documentId,
      sourceType,
      deletedChunks: data.deletedChunks,
      duration: data.duration
    });
    
    return data;
  } catch (error) {
    const duration = Date.now() - startTime;
    console.error(`Error deleting document after ${duration}ms:`, {
      message: error.message,
      stack: error.stack,
      params: { documentId, sourceType }
    });
    throw error;
  }
}

export async function getUploadedDocuments({ limit = 50, offset = 0, search = '', userId } = {}) {
  const startTime = Date.now();
  console.log('Fetching uploaded documents...', { limit, offset, search, userId });

  try {
    const params = new URLSearchParams({ limit, offset, userId });
    if (search) params.set('search', search);

    const res = await fetch(`/api/list-uploaded-documents?${params}`);
    
    if (!res.ok) {
      const errorText = await res.text();
      console.error('Failed to load uploaded documents:', {
        status: res.status,
        statusText: res.statusText,
        errorText,
        url: res.url,
        params: { limit, offset, search }
      });
      throw new Error(`Failed to load uploaded documents: ${res.status} ${res.statusText}`);
    }
    
    const data = await res.json();
    const duration = Date.now() - startTime;
    console.log(`Uploaded documents fetched in ${duration}ms:`, {
      total: data.total,
      itemsReturned: data.items?.length || 0,
      pageOffset: data.pageOffset,
      pageSize: data.pageSize
    });
    
    return data;
  } catch (error) {
    const duration = Date.now() - startTime;
    console.error(`Error fetching uploaded documents after ${duration}ms:`, {
      message: error.message,
      stack: error.stack,
      params: { limit, offset, search }
    });
    throw error;
  }
}

export async function getBlobDocuments({ limit = 50, offset = 0, search = '', userId } = {}) {
  const startTime = Date.now();
  console.log('Fetching blob documents...', { limit, offset, search, userId });

  try {
    const params = new URLSearchParams({ limit, offset, userId });
    if (search) params.set('search', search);

    const res = await fetch(`/api/list-blob-documents?${params}`);
    
    if (!res.ok) {
      const errorText = await res.text();
      console.error('Failed to load blob documents:', {
        status: res.status,
        statusText: res.statusText,
        errorText,
        url: res.url,
        params: { limit, offset, search }
      });
      throw new Error(`Failed to load blob documents: ${res.status} ${res.statusText}`);
    }
    
    const data = await res.json();
    const duration = Date.now() - startTime;
    console.log(`Blob documents fetched in ${duration}ms:`, {
      total: data.total,
      itemsReturned: data.items?.length || 0,
      pageOffset: data.pageOffset,
      pageSize: data.pageSize,
      source: data.source
    });
    
    return data;
  } catch (error) {
    const duration = Date.now() - startTime;
    console.error(`Error fetching blob documents after ${duration}ms:`, {
      message: error.message,
      stack: error.stack,
      params: { limit, offset, search }
    });
    throw error;
  }
}

export async function updateUploadedDocumentMetadata({
  documentId,
  userId,
  documentName,
  safeFileName,
  documentType,
  version,
  manualSummary,
  aiSummary
}) {
  const startTime = Date.now();
  console.log('Updating uploaded document metadata...', {
    documentId,
    userId,
    hasName: typeof documentName !== 'undefined',
    hasSafeName: typeof safeFileName !== 'undefined',
    hasType: typeof documentType !== 'undefined',
    hasVersion: typeof version !== 'undefined',
    hasManualSummary: typeof manualSummary !== 'undefined',
    hasSummary: typeof aiSummary !== 'undefined'
  });

  try {
    const res = await fetch('/api/update-uploaded-document', {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        documentId,
        userId,
        documentName,
        safeFileName,
        documentType,
        version,
        manualSummary,
        aiSummary
      })
    });

    if (!res.ok) {
      const errorText = await res.text();
      console.error('Failed to update uploaded document metadata:', {
        status: res.status,
        statusText: res.statusText,
        errorText,
        documentId,
        userId
      });
      throw new Error(`Failed to update metadata: ${res.status} ${res.statusText}`);
    }

    const data = await res.json();
    const duration = Date.now() - startTime;
    console.log(`Uploaded document metadata updated in ${duration}ms`, {
      documentId,
      userId
    });

    return data;
  } catch (error) {
    const duration = Date.now() - startTime;
    console.error(`Error updating uploaded document metadata after ${duration}ms:`, {
      message: error.message,
      stack: error.stack,
      documentId,
      userId
    });
    throw error;
  }
}

export async function chatWithDocuments({ message, documentIds = [], conversationHistory = [], userId, attachments = [] }) {
  const startTime = Date.now();
  console.log('Sending chat message...', {
    message: message.substring(0, 100) + '...',
    documentIds,
    userId,
    attachmentCount: attachments.length
  });

  try {
    const res = await fetch('/api/chat-with-documents', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        message,
        documentIds,
        conversationHistory,
        userId,
        attachments
      })
    });
    
    if (!res.ok) {
      let errorMessage = `Failed to send chat message: ${res.status} ${res.statusText}`;
      let errorDetails = null;
      
      try {
        const errorData = await res.json();
        if (errorData.error) {
          errorMessage = errorData.error;
          errorDetails = errorData.details;
        }
      } catch (parseError) {
        // If parsing fails, fall back to text
        const errorText = await res.text();
        console.error('Failed to send chat message:', {
          status: res.status,
          statusText: res.statusText,
          errorText
        });
      }
      
      console.error('Failed to send chat message:', {
        status: res.status,
        statusText: res.statusText,
        errorMessage,
        errorDetails
      });
      
      throw new Error(errorDetails ? `${errorMessage}\nDetails: ${errorDetails}` : errorMessage);
    }
    
    const data = await res.json();
    const duration = Date.now() - startTime;
    console.log(`Chat response received in ${duration}ms:`, {
      responseLength: data.response?.length || 0,
      documentsUsed: data.documents?.length || 0,
      metadata: data.metadata
    });
    
    return data;
  } catch (error) {
    const duration = Date.now() - startTime;
    console.error(`Error sending chat message after ${duration}ms:`, {
      message: error.message,
      stack: error.stack
    });
    throw error;
  }
}

export async function updateManualSummary({ documentId, manualSummary }) {
  const startTime = Date.now();
  console.log('Updating manual summary...', { documentId, summaryLength: manualSummary?.length });
  
  try {
    const res = await fetch('/api/update-manual-summary', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        documentId,
        manualSummary
      })
    });
    
    if (!res.ok) {
      const errorText = await res.text();
      console.error('Failed to update manual summary:', {
        status: res.status,
        statusText: res.statusText,
        errorText
      });
      throw new Error(`Failed to update manual summary: ${res.status} ${res.statusText}`);
    }
    
    const data = await res.json();
    const duration = Date.now() - startTime;
    console.log(`Manual summary updated in ${duration}ms:`, {
      documentId: data.document?.id,
      summaryLength: data.document?.manual_summary?.length
    });
    
    return data;
  } catch (error) {
    const duration = Date.now() - startTime;
    console.error(`Error updating manual summary after ${duration}ms:`, {
      message: error.message,
      stack: error.stack
    });
    throw error;
  }
}

// External Resources API functions
export async function getExternalResources() {
  const startTime = Date.now();
  console.log('Fetching external resources...');
  
  try {
    const res = await fetch('/api/external-resources');
    
    if (!res.ok) {
      const errorText = await res.text();
      console.error('Failed to load external resources:', {
        status: res.status,
        statusText: res.statusText,
        errorText
      });
      throw new Error(`Failed to load external resources: ${res.status} ${res.statusText}`);
    }
    
    const data = await res.json();
    const duration = Date.now() - startTime;
    console.log(`External resources fetched in ${duration}ms:`, {
      count: data.resources?.length || 0
    });
    
    return data;
  } catch (error) {
    const duration = Date.now() - startTime;
    console.error(`Error fetching external resources after ${duration}ms:`, {
      message: error.message,
      stack: error.stack
    });
    throw error;
  }
}

export async function createExternalResource({ title, url, description, category, tags }) {
  const startTime = Date.now();
  console.log('Creating external resource...', { title, url, category });
  
  try {
    const res = await fetch('/api/external-resources', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        title,
        url,
        description,
        category,
        tags
      })
    });
    
    if (!res.ok) {
      const errorData = await res.json();
      console.error('Failed to create external resource:', {
        status: res.status,
        statusText: res.statusText,
        error: errorData.error,
        details: errorData.details
      });
      throw new Error(errorData.error || `Failed to create external resource: ${res.status} ${res.statusText}`);
    }
    
    const data = await res.json();
    const duration = Date.now() - startTime;
    console.log(`External resource created in ${duration}ms:`, {
      id: data.resource?.id,
      title: data.resource?.title
    });
    
    return data;
  } catch (error) {
    const duration = Date.now() - startTime;
    console.error(`Error creating external resource after ${duration}ms:`, {
      message: error.message,
      stack: error.stack
    });
    throw error;
  }
}

export async function updateExternalResource({ id, title, url, description, category, tags }) {
  const startTime = Date.now();
  console.log('Updating external resource...', { id, title, url, category });
  
  try {
    const res = await fetch(`/api/external-resources/${id}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        title,
        url,
        description,
        category,
        tags
      })
    });
    
    if (!res.ok) {
      const errorData = await res.json();
      console.error('Failed to update external resource:', {
        status: res.status,
        statusText: res.statusText,
        error: errorData.error,
        details: errorData.details
      });
      throw new Error(errorData.error || `Failed to update external resource: ${res.status} ${res.statusText}`);
    }
    
    const data = await res.json();
    const duration = Date.now() - startTime;
    console.log(`External resource updated in ${duration}ms:`, {
      id: data.resource?.id,
      title: data.resource?.title
    });
    
    return data;
  } catch (error) {
    const duration = Date.now() - startTime;
    console.error(`Error updating external resource after ${duration}ms:`, {
      message: error.message,
      stack: error.stack
    });
    throw error;
  }
}

export async function deleteExternalResource({ id }) {
  const startTime = Date.now();
  console.log('Deleting external resource...', { id });
  
  try {
    const res = await fetch(`/api/external-resources/${id}`, {
      method: 'DELETE'
    });
    
    if (!res.ok) {
      const errorData = await res.json();
      console.error('Failed to delete external resource:', {
        status: res.status,
        statusText: res.statusText,
        error: errorData.error
      });
      throw new Error(errorData.error || `Failed to delete external resource: ${res.status} ${res.statusText}`);
    }
    
    const data = await res.json();
    const duration = Date.now() - startTime;
    console.log(`External resource deleted in ${duration}ms:`, {
      id
    });
    
    return data;
  } catch (error) {
    const duration = Date.now() - startTime;
    console.error(`Error deleting external resource after ${duration}ms:`, {
      message: error.message,
      stack: error.stack
    });
    throw error;
  }
}

export async function updateUserProfile({ userId, name, picture, accessToken }) {
  const startTime = Date.now();
  console.log('Updating user profile...', { userId, name, picture });
  
  try {
    const headers = {
      'Content-Type': 'application/json',
    };
    
    // Add Authorization header if access token is provided
    if (accessToken) {
      headers['Authorization'] = `Bearer ${accessToken}`;
    }
    
    const res = await fetch('/api/update-user-profile', {
      method: 'PUT',
      headers,
      body: JSON.stringify({
        userId,
        name,
        picture
      })
    });
    
    if (!res.ok) {
      const errorData = await res.json();
      console.error('Failed to update user profile:', {
        status: res.status,
        statusText: res.statusText,
        error: errorData.error,
        details: errorData.details
      });
      throw new Error(errorData.error || `Failed to update user profile: ${res.status} ${res.statusText}`);
    }
    
    const data = await res.json();
    const duration = Date.now() - startTime;
    console.log(`User profile updated in ${duration}ms:`, {
      userId: data.user?.sub,
      name: data.user?.name
    });
    
    return data.user;
  } catch (error) {
    const duration = Date.now() - startTime;
    console.error(`Error updating user profile after ${duration}ms:`, {
      message: error.message,
      stack: error.stack
    });
    throw error;
  }
}

export async function changeUserPassword({ currentPassword, newPassword, accessToken }) {
  const startTime = Date.now();
  console.log('Changing user password...');
  
  try {
    const headers = {
      'Content-Type': 'application/json',
    };
    
    // Add Authorization header if access token is provided
    if (accessToken) {
      headers['Authorization'] = `Bearer ${accessToken}`;
    }
    
    const res = await fetch('/api/change-user-password', {
      method: 'PUT',
      headers,
      body: JSON.stringify({
        currentPassword,
        newPassword
      })
    });
    
    if (!res.ok) {
      const errorData = await res.json();
      console.error('Failed to change password:', {
        status: res.status,
        statusText: res.statusText,
        error: errorData.error,
        details: errorData.details
      });
      throw new Error(errorData.error || `Failed to change password: ${res.status} ${res.statusText}`);
    }
    
    const data = await res.json();
    const duration = Date.now() - startTime;
    console.log(`Password changed successfully in ${duration}ms`);
    
    return data;
  } catch (error) {
    const duration = Date.now() - startTime;
    console.error(`Error changing password after ${duration}ms:`, {
      message: error.message,
      stack: error.stack
    });
    throw error;
  }
}

// Q&A Interactions API functions
export async function getQAInteractions({ page = 1, limit = 50, search = '', user_id, session_id } = {}) {
  const startTime = Date.now();
  console.log('Fetching Q&A interactions...', { page, limit, search, user_id, session_id });
  
  try {
    const params = new URLSearchParams({ page, limit });
    if (search) params.set('search', search);
    if (user_id) params.set('user_id', user_id);
    if (session_id) params.set('session_id', session_id);
    
    const res = await fetch(`/api/qa-interactions?${params}`);
    
    if (!res.ok) {
      const errorText = await res.text();
      console.error('Failed to load Q&A interactions:', {
        status: res.status,
        statusText: res.statusText,
        errorText
      });
      throw new Error(`Failed to load Q&A interactions: ${res.status} ${res.statusText}`);
    }
    
    const data = await res.json();
    const duration = Date.now() - startTime;
    console.log(`Q&A interactions fetched in ${duration}ms:`, {
      total: data.data?.total || 0,
      itemsReturned: data.data?.items?.length || 0,
      page: data.data?.page,
      totalPages: data.data?.totalPages
    });
    
    return data.data;
  } catch (error) {
    const duration = Date.now() - startTime;
    console.error(`Error fetching Q&A interactions after ${duration}ms:`, {
      message: error.message,
      stack: error.stack
    });
    throw error;
  }
}

export async function createQAInteraction({ question, answer, document_ids = [], document_names = [], user_id, session_id }) {
  const startTime = Date.now();
  console.log('Creating Q&A interaction...', { question: question.substring(0, 100) + '...' });
  
  try {
    const res = await fetch('/api/qa-interactions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        question,
        answer,
        document_ids,
        document_names,
        user_id,
        session_id
      })
    });
    
    if (!res.ok) {
      const errorData = await res.json();
      console.error('Failed to create Q&A interaction:', {
        status: res.status,
        statusText: res.statusText,
        error: errorData.error
      });
      throw new Error(errorData.error || `Failed to create Q&A interaction: ${res.status} ${res.statusText}`);
    }
    
    const data = await res.json();
    const duration = Date.now() - startTime;
    console.log(`Q&A interaction created in ${duration}ms:`, {
      id: data.data?.id
    });
    
    return data.data;
  } catch (error) {
    const duration = Date.now() - startTime;
    console.error(`Error creating Q&A interaction after ${duration}ms:`, {
      message: error.message,
      stack: error.stack
    });
    throw error;
  }
}

export async function deleteQAInteraction({ id }) {
  const startTime = Date.now();
  console.log('Deleting Q&A interaction...', { id });
  
  try {
    const res = await fetch(`/api/qa-interactions/${id}`, {
      method: 'DELETE'
    });
    
    if (!res.ok) {
      const errorData = await res.json();
      console.error('Failed to delete Q&A interaction:', {
        status: res.status,
        statusText: res.statusText,
        error: errorData.error
      });
      throw new Error(errorData.error || `Failed to delete Q&A interaction: ${res.status} ${res.statusText}`);
    }
    
    const data = await res.json();
    const duration = Date.now() - startTime;
    console.log(`Q&A interaction deleted in ${duration}ms:`, {
      id
    });
    
    return data;
  } catch (error) {
    const duration = Date.now() - startTime;
    console.error(`Error deleting Q&A interaction after ${duration}ms:`, {
      message: error.message,
      stack: error.stack
    });
    throw error;
  }
}

export async function exportQAInteractions({ search = '', user_id, session_id, start_date, end_date } = {}) {
  const startTime = Date.now();
  console.log('Exporting Q&A interactions...', { search, user_id, session_id, start_date, end_date });
  
  try {
    const params = new URLSearchParams();
    if (search) params.set('search', search);
    if (user_id) params.set('user_id', user_id);
    if (session_id) params.set('session_id', session_id);
    if (start_date) params.set('start_date', start_date);
    if (end_date) params.set('end_date', end_date);
    
    const res = await fetch(`/api/qa-interactions/export?${params}`);
    
    if (!res.ok) {
      const errorText = await res.text();
      console.error('Failed to export Q&A interactions:', {
        status: res.status,
        statusText: res.statusText,
        errorText
      });
      throw new Error(`Failed to export Q&A interactions: ${res.status} ${res.statusText}`);
    }
    
    const csvContent = await res.text();
    const duration = Date.now() - startTime;
    console.log(`Q&A interactions exported in ${duration}ms:`, {
      contentLength: csvContent.length
    });
    
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
  } catch (error) {
    const duration = Date.now() - startTime;
    console.error(`Error exporting Q&A interactions after ${duration}ms:`, {
      message: error.message,
      stack: error.stack
    });
    throw error;
  }
}

// Workflow Instances API functions
export async function getWorkflowInstances({ status, limit = 50, offset = 0, userId } = {}) {
  const startTime = Date.now();
  console.log('Fetching workflow instances...', { status, limit, offset, userId });
  
  try {
    const params = new URLSearchParams({ limit, offset });
    if (status) params.set('status', status);
    if (userId) params.set('userId', userId);
    
    const res = await fetch(`/api/workflow-management/workflow-instances?${params}`);
    
    if (!res.ok) {
      const errorText = await res.text();
      console.error('Failed to load workflow instances:', {
        status: res.status,
        statusText: res.statusText,
        errorText
      });
      throw new Error(`Failed to load workflow instances: ${res.status} ${res.statusText}`);
    }
    
    const data = await res.json();
    const duration = Date.now() - startTime;
    console.log(`Workflow instances fetched in ${duration}ms:`, {
      count: data.instances?.length || 0
    });
    
    return data;
  } catch (error) {
    const duration = Date.now() - startTime;
    console.error(`Error fetching workflow instances after ${duration}ms:`, {
      message: error.message,
      stack: error.stack
    });
    throw error;
  }
}

export async function repolishWorkflowDocument({ instanceId, editedDocument }) {
  const startTime = Date.now();
  console.log('Re-polishing workflow document...', { instanceId, contentLength: editedDocument?.length });
  
  try {
    const res = await fetch('/api/workflow-execution/repolish-document', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        instanceId,
        editedDocument
      })
    });
    
    if (!res.ok) {
      const errorData = await res.json();
      console.error('Failed to re-polish document:', {
        status: res.status,
        statusText: res.statusText,
        error: errorData.error
      });
      throw new Error(errorData.error || `Failed to re-polish document: ${res.status} ${res.statusText}`);
    }
    
    const data = await res.json();
    const duration = Date.now() - startTime;
    console.log(`Document re-polished in ${duration}ms:`, {
      versions: data.versions?.length || 0,
      currentVersion: data.currentVersion,
      hasImprovements: data.hasAiImprovements
    });
    
    return data;
  } catch (error) {
    const duration = Date.now() - startTime;
    console.error(`Error re-polishing document after ${duration}ms:`, {
      message: error.message,
      stack: error.stack
    });
    throw error;
  }
}

export async function refineWorkflowDocument({ instanceId, currentDocument, instructions }) {
  const startTime = Date.now();
  console.log('Refining workflow document with AI...', { 
    instanceId, 
    contentLength: currentDocument?.length,
    instructionsLength: instructions?.length 
  });
  
  try {
    const res = await fetch('/api/workflow-execution/refine-document', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        instanceId,
        currentDocument,
        instructions
      })
    });
    
    if (!res.ok) {
      const errorData = await res.json();
      console.error('Failed to refine document:', {
        status: res.status,
        statusText: res.statusText,
        error: errorData.error
      });
      throw new Error(errorData.error || `Failed to refine document: ${res.status} ${res.statusText}`);
    }
    
    const data = await res.json();
    const duration = Date.now() - startTime;
    console.log(`Document refined in ${duration}ms:`, {
      versions: data.versions?.length || 0,
      currentVersion: data.currentVersion,
      hasImprovements: data.hasAiImprovements,
      aiSuggestions: data.aiSuggestions
    });
    
    return data;
  } catch (error) {
    const duration = Date.now() - startTime;
    console.error(`Error refining document after ${duration}ms:`, {
      message: error.message,
      stack: error.stack
    });
    throw error;
  }
}

export async function regenerateDocumentSummary({ documentId, sourceType }) {
  const startTime = Date.now();
  console.log('Regenerating document summary...', { documentId, sourceType });
  
  try {
    const res = await fetch('/api/regenerate-document-summary', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        documentId,
        sourceType
      })
    });
    
    if (!res.ok) {
      const errorData = await res.json();
      console.error('Failed to regenerate document summary:', {
        status: res.status,
        statusText: res.statusText,
        error: errorData.error
      });
      throw new Error(errorData.error || `Failed to regenerate summary: ${res.status} ${res.statusText}`);
    }
    
    const data = await res.json();
    const duration = Date.now() - startTime;
    console.log(`Document summary regenerated in ${duration}ms:`, {
      documentId: data.documentId,
      documentName: data.documentName,
      summaryLength: data.summaryLength,
      chunksRegenerated: data.chunksRegenerated,
      chunkCount: data.chunkCount
    });
    
    return data;
  } catch (error) {
    const duration = Date.now() - startTime;
    console.error(`Error regenerating document summary after ${duration}ms:`, {
      message: error.message,
      stack: error.stack
    });
    throw error;
  }
}

export async function acceptRegeneratedSummary({ documentId, newSummary }) {
  const startTime = Date.now();
  console.log('Accepting regenerated summary...', { documentId, summaryLength: newSummary?.length });
  
  try {
    const res = await fetch('/api/accept-regenerated-summary', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        documentId,
        newSummary
      })
    });
    
    if (!res.ok) {
      const errorData = await res.json();
      console.error('Failed to accept regenerated summary:', {
        status: res.status,
        statusText: res.statusText,
        error: errorData.error
      });
      throw new Error(errorData.error || `Failed to accept summary: ${res.status} ${res.statusText}`);
    }
    
    const data = await res.json();
    const duration = Date.now() - startTime;
    console.log(`Regenerated summary accepted in ${duration}ms:`, {
      documentId: data.documentId,
      summaryLength: data.summary?.length
    });
    
    return data;
  } catch (error) {
    const duration = Date.now() - startTime;
    console.error(`Error accepting regenerated summary after ${duration}ms:`, {
      message: error.message,
      stack: error.stack
    });
    throw error;
  }
}