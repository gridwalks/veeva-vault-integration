import { getStore } from '@netlify/blobs';
import { writeBlobAudit } from './blob-audit.js';
import { STORE_NAMES } from './blob-storage-config.js';

const STORE_NAME = STORE_NAMES.UPLOADS;
const MAX_BLOB_AGE_MS = 36 * 60 * 60 * 1000; // 36 hours

function parseTimestamp(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export const handler = async () => {
  const STORE_INIT_TIMEOUT = 5000; // 5 seconds
  const store = await Promise.race([
    getStore({
      name: STORE_NAME,
      siteID: process.env.NETLIFY_BLOBS_SITE_ID,
      token: process.env.NETLIFY_BLOBS_TOKEN
    }),
    new Promise((_, reject) => setTimeout(() => reject(new Error('Store initialization timeout')), STORE_INIT_TIMEOUT))
  ]);
  const cutoff = Date.now() - MAX_BLOB_AGE_MS;

  try {
    const listResult = await store.list?.();
    const blobs = Array.isArray(listResult?.blobs) ? listResult.blobs : Array.isArray(listResult) ? listResult : [];

    let deleted = 0;
    const skipped = [];

    for (const blob of blobs) {
      const createdAt = parseTimestamp(blob?.metadata?.createdAt) || parseTimestamp(blob?.createdAt) || parseTimestamp(blob?.uploadedAt);

      if (!createdAt) {
        skipped.push({ key: blob?.key, reason: 'missing_created_at' });
        continue;
      }

      if (createdAt.getTime() > cutoff) {
        continue;
      }

      try {
        if (typeof store.delete === 'function') {
          await store.delete(blob.key);
        } else if (typeof store.del === 'function') {
          await store.del(blob.key);
        } else {
          throw new Error('Blob store does not support deletion');
        }

        deleted += 1;
        await writeBlobAudit({
          action: 'cleanup',
          blobKey: blob.key,
          status: 'success',
          metadata: {
            createdAt: createdAt.toISOString(),
            deletedAt: new Date().toISOString()
          }
        });
      } catch (deleteError) {
        console.error('Cleanup failed for blob:', blob?.key, deleteError);
        await writeBlobAudit({
          action: 'cleanup',
          blobKey: blob?.key,
          status: 'error',
          metadata: {
            createdAt: createdAt.toISOString()
          },
          errorMessage: deleteError.message
        });
      }
    }

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        deleted,
        scanned: blobs.length,
        skipped
      })
    };
  } catch (error) {
    console.error('Failed to clean up blobs:', error);
    await writeBlobAudit({
      action: 'cleanup',
      blobKey: null,
      status: 'error',
      errorMessage: error.message
    });

    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Failed to clean up blobs' })
    };
  }
};
