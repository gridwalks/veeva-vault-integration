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

export function downloadUrl({ id, major, minor }) {
  const p = new URLSearchParams({ docId: id });
  if (major && minor) { p.set("major", major); p.set("minor", minor); }
  return `/api/download-file?${p}`;
}

export function downloadUploadedDocumentUrl({ documentId }) {
  const p = new URLSearchParams({ documentId });
  return `/api/download-uploaded-document?${p}`;
}

export async function chatWithDocuments({ message, documentIds = [], conversationHistory = [] }) {
  const startTime = Date.now();
  console.log('Sending chat message...', { message: message.substring(0, 100) + '...', documentIds });
  
  try {
    const res = await fetch('/api/chat-with-documents', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        message,
        documentIds,
        conversationHistory
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