import { getPool, initDatabase } from "./db.js";

export const handler = async (event) => {
  const startTime = Date.now();
  console.log('Starting indexed documents retrieval...', {
    timestamp: new Date().toISOString(),
    queryParams: Object.fromEntries(new URL(event.rawUrl).searchParams)
  });

  try {
    // Initialize database
    await initDatabase();

    const q = new URL(event.rawUrl).searchParams;
    const nameLike = q.get("name")?.trim();
    const limit = Math.min(Number(q.get("limit") || 100), 1000);
    const offset = Number(q.get("offset") || 0);

    console.log('Querying indexed documents...', { nameLike, limit, offset });

    const pool = getPool();

    // Check if the new columns exist in qms_chat_documents table
    let hasNewColumns = false;
    try {
      const columnCheck = await pool.query(`
        SELECT column_name
        FROM information_schema.columns
        WHERE table_name = 'qms_chat_documents'
        AND column_name IN ('blob_url', 'original_filename', 'mime_type')
      `);
      hasNewColumns = columnCheck.rows.length >= 3;
    } catch (error) {
      console.log('Error checking columns:', error.message);
      hasNewColumns = false;
    }

    const blobColumns = hasNewColumns
      ? 'blob_url, original_filename, mime_type'
      : 'null as blob_url, null as original_filename, null as mime_type';

    let query = `
      SELECT
        id::text as id,
        null as veeva_document_id,
        null as document_number,
        document_name,
        '1' as major_version,
        '0' as minor_version,
        document_type,
        'uploaded' as status,
        ai_summary as summary,
        null as manual_summary,
        created_at as indexed_at,
        updated_at,
        'upload' as source_type,
        ${blobColumns}
      FROM qms_chat_documents
    `;

    const queryParams = [];
    let paramCount = 0;

    if (nameLike) {
      paramCount++;
      query += ` WHERE document_name ILIKE $${paramCount}`;
      queryParams.push(`%${nameLike}%`);
    }

    query += ` ORDER BY updated_at DESC LIMIT $${++paramCount} OFFSET $${++paramCount}`;
    queryParams.push(limit, offset);

    const queryStartTime = Date.now();
    const result = await pool.query(query, queryParams);
    const queryDuration = Date.now() - queryStartTime;
    console.log(`Query executed in ${queryDuration}ms`, { rowsReturned: result.rows.length });

    // Get total count
    let countQuery = `SELECT COUNT(*) FROM qms_chat_documents`;
    const countParams = [];
    if (nameLike) {
      countQuery += ` WHERE document_name ILIKE $1`;
      countParams.push(`%${nameLike}%`);
    }
    const countResult = await pool.query(countQuery, countParams);
    const total = parseInt(countResult.rows[0].count);

    const totalDuration = Date.now() - startTime;

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        total,
        pageOffset: offset,
        pageSize: limit,
        duration: totalDuration,
        items: result.rows.map(row => ({
          id: row.id,
          veeva_document_id: null,
          document_number: null,
          document_name: row.document_name,
          major_version: row.major_version,
          minor_version: row.minor_version,
          document_type: row.document_type,
          status: row.status,
          summary: row.summary,
          manual_summary: null,
          indexed_at: row.indexed_at,
          updated_at: row.updated_at,
          source_type: row.source_type,
          blob_url: row.blob_url,
          original_filename: row.original_filename,
          mime_type: row.mime_type
        }))
      }),
    };
  } catch (e) {
    const totalDuration = Date.now() - startTime;
    console.error('Get indexed documents error:', { message: e.message, duration: `${totalDuration}ms` });
    return { statusCode: 500, body: JSON.stringify({ error: e.message }) };
  }
};
