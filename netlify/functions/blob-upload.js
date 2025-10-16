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

  const store = getStore(STORE_NAME);
  const includeUrl = (event.queryStringParameters?.includeUrl || '').toLowerCase() === 'true';
  const headers = event.headers || {};
  const rawFileName = normalizeHeader(headers, 'x-file-name') || normalizeHeader(headers, 'x-filename');
  const fileName = rawFileName ? decodeFilename(rawFileName) : `chat-upload-${Date.now()}`;
  const contentType = normalizeHeader(headers, 'content-type') || 'application/octet-stream';
  const fileSizeHeader = normalizeHeader(headers, 'content-length') || normalizeHeader(headers, 'x-file-size');

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
    console.error('Blob upload failed:', error);
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
