import { getStore } from '@netlify/blobs';
import { writeBlobAudit } from './blob-audit.js';

const STORE_NAME = 'chat-uploads';

export const handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers: { 'Allow': 'POST' },
      body: JSON.stringify({ error: 'Method Not Allowed' })
    };
  }

  if (!event.body) {
    return {
      statusCode: 400,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Request body is required' })
    };
  }

  let key;
  try {
    const payload = JSON.parse(event.body);
    key = payload?.key;
  } catch (error) {
    return {
      statusCode: 400,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Invalid JSON body' })
    };
  }

  if (!key || typeof key !== 'string') {
    return {
      statusCode: 400,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Blob key is required' })
    };
  }

  const STORE_INIT_TIMEOUT = 5000; // 5 seconds
  const store = await Promise.race([
    getStore({
      name: STORE_NAME,
      siteID: process.env.NETLIFY_BLOBS_SITE_ID,
      token: process.env.NETLIFY_BLOBS_TOKEN
    }),
    new Promise((_, reject) => setTimeout(() => reject(new Error('Store initialization timeout')), STORE_INIT_TIMEOUT))
  ]);

  try {
    if (typeof store.delete === 'function') {
      await store.delete(key);
    } else if (typeof store.del === 'function') {
      await store.del(key);
    } else {
      throw new Error('Blob store does not support deletion');
    }

    await writeBlobAudit({
      action: 'delete',
      blobKey: key,
      status: 'success'
    });

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ deleted: true })
    };
  } catch (error) {
    console.error('Failed to delete blob:', error);
    await writeBlobAudit({
      action: 'delete',
      blobKey: key,
      status: 'error',
      errorMessage: error.message
    });

    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Failed to delete blob' })
    };
  }
};
