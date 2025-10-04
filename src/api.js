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

export async function indexDocuments({ name = "", limit = 100 } = {}) {
  const startTime = Date.now();
  console.log('Starting document indexing...', { name, limit });
  
  try {
    const p = new URLSearchParams({ name, limit });
    const res = await fetch(`/api/index-documents?${p}`);
    
    if (!res.ok) {
      const errorText = await res.text();
      console.error('Failed to index documents:', {
        status: res.status,
        statusText: res.statusText,
        errorText,
        url: res.url,
        params: { name, limit }
      });
      throw new Error(`Failed to index documents: ${res.status} ${res.statusText}`);
    }
    
    const data = await res.json();
    const duration = Date.now() - startTime;
    console.log(`Document indexing completed in ${duration}ms:`, {
      total: data.total,
      processed: data.processed,
      duration: data.duration,
      stats: data.stats
    });
    
    return data;
  } catch (error) {
    const duration = Date.now() - startTime;
    console.error(`Error indexing documents after ${duration}ms:`, {
      message: error.message,
      stack: error.stack,
      params: { name, limit }
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
