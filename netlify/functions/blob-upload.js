import { randomUUID } from 'crypto';
import { getStore } from '@netlify/blobs';
import { writeBlobAudit } from './blob-audit.js';

const STORE_NAME = 'chat-uploads';
const SIGNED_URL_TTL_MS = 60 * 60 * 1000; // 1 hour default lifetime

function decodeFilename(rawName = '') {
  try {
    return decodeURIComponent(rawName);
  } catch (error) {
    return rawName;
  }
}

function normalizeHeader(headers, key) {
  if (!headers) return undefined;
  const lowerKey = key.toLowerCase();
  for (const headerKey of Object.keys(headers)) {
    if (headerKey.toLowerCase() === lowerKey) {
      return headers[headerKey];
    }
  }
  return undefined;
}

async function generateSignedUrl(store, key, expiresAt) {
  if (!store) return null;

  try {
    if (typeof store.generateSignedUrl === 'function') {
      return await store.generateSignedUrl({
        key,
        expiresAt
      });
    }

    if (typeof store.getSignedUrl === 'function') {
      return await store.getSignedUrl({
        key,
        expiresAt
      });
    }
  } catch (error) {
    console.warn('Failed to generate signed URL for blob:', key, error);
  }

  return null;
}

export const handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers: { 'Allow': 'POST' },
      body: JSON.stringify({ error: 'Method Not Allowed' })
    };
  }

  let store;
  try {
    const STORE_INIT_TIMEOUT = 5000; // 5 seconds
    const storePromise = getStore({
      name: STORE_NAME,
      siteID: process.env.NETLIFY_BLOBS_SITE_ID,
      token: process.env.NETLIFY_BLOBS_TOKEN
    });
    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(() => reject(new Error('Store initialization timeout')), STORE_INIT_TIMEOUT)
    );
    store = await Promise.race([storePromise, timeoutPromise]);
  } catch (error) {
    console.error('Failed to access blob store:', {
      message: error?.message,
      stack: error?.stack,
      storeName: STORE_NAME,
      hasToken: !!process.env.NETLIFY_BLOBS_TOKEN,
      hasSiteId: !!process.env.NETLIFY_BLOBS_SITE_ID
    });
    return {
      statusCode: 502,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Blob storage is currently unavailable' })
    };
  }

  if (!store || typeof store.set !== 'function') {
    console.error('Blob store is unavailable or missing required methods.');
    return {
      statusCode: 502,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Blob storage is currently unavailable' })
    };
  }
  const includeUrl = (event.queryStringParameters?.includeUrl || '').toLowerCase() === 'true';
  const headers = event.headers || {};
  const rawFileName = normalizeHeader(headers, 'x-file-name') || normalizeHeader(headers, 'x-filename');
  const fileName = rawFileName ? decodeFilename(rawFileName) : `chat-upload-${Date.now()}`;
  const contentType = normalizeHeader(headers, 'content-type') || 'application/octet-stream';
  const fileSizeHeader = normalizeHeader(headers, 'content-length') || normalizeHeader(headers, 'x-file-size');

  // Enforce upload size limits to avoid function/body limits
  const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB safe under Netlify limits
  const declaredSize = fileSizeHeader ? parseInt(fileSizeHeader, 10) : null;
  if (declaredSize && declaredSize > MAX_FILE_SIZE) {
    return {
      statusCode: 413,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'File too large', maxSize: MAX_FILE_SIZE, receivedSize: declaredSize })
    };
  }

  if (!event.body) {
    return {
      statusCode: 400,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Request body is empty' })
    };
  }

  const buffer = event.isBase64Encoded
    ? Buffer.from(event.body, 'base64')
    : Buffer.from(event.body, 'binary');

  if (buffer.length === 0) {
    return {
      statusCode: 400,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'No file content received' })
    };
  }

  // Warn if buffer size does not match declared size (if provided)
  if (declaredSize && Math.abs(buffer.length - declaredSize) > 1024) {
    console.warn('Buffer size mismatch detected during blob upload', {
      fileName,
      declaredSize,
      bufferLength: buffer.length,
      difference: buffer.length - declaredSize
    });
  }

  const createdAt = new Date().toISOString();
  const blobKey = `${createdAt.replace(/[:.]/g, '-')}-${randomUUID()}`;

  try {
    await store.set(blobKey, buffer, {
      metadata: {
        fileName,
        contentType,
        size: buffer.length.toString(),
        declaredSize: fileSizeHeader || buffer.length.toString(),
        createdAt
      }
    });

    let signedUrl = null;
    if (includeUrl) {
      const expiresAt = new Date(Date.now() + SIGNED_URL_TTL_MS).toISOString();
      signedUrl = await generateSignedUrl(store, blobKey, expiresAt);
    }

    await writeBlobAudit({
      action: 'upload',
      blobKey,
      status: 'success',
      metadata: {
        fileName,
        contentType,
        size: buffer.length,
        declaredSize: fileSizeHeader ? Number(fileSizeHeader) : null,
        createdAt,
        includeUrl
      }
    });

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-store'
      },
      body: JSON.stringify({
        key: blobKey,
        url: signedUrl,
        createdAt
      })
    };
  } catch (error) {
    console.error('Blob upload failed:', {
      message: error?.message,
      stack: error?.stack,
      fileName,
      contentType,
      size: buffer.length
    });
    await writeBlobAudit({
      action: 'upload',
      blobKey,
      status: 'error',
      metadata: {
        fileName,
        contentType,
        size: buffer.length,
        createdAt,
        includeUrl
      },
      errorMessage: error.message
    });

    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Failed to upload file' })
    };
  }
};
