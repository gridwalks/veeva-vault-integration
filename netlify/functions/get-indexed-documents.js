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

    console.log('Querying indexed documents...', {
      nameLike,
      limit,
      offset
    });

    const pool = getPool();
    
    let query = `
      SELECT * FROM (
        SELECT 
          id, veeva_document_id, document_number, document_name, 
          major_version, minor_version, document_type, status, 
          summary, manual_summary, indexed_at, updated_at,
          'veeva' as source_type, null as blob_url, null as original_filename, null as mime_type
        FROM Veeva_Doc_Chat_document_index
        
        UNION ALL
        
        SELECT 
          id as id, 
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
          blob_url,
          original_filename,
          mime_type
        FROM qms_chat_documents
      ) combined_documents
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

    console.log('Executing query:', { query, queryParams });

    const queryStartTime = Date.now();
    const result = await pool.query(query, queryParams);
    const queryDuration = Date.now() - queryStartTime;

    console.log(`Query executed in ${queryDuration}ms`, {
      rowsReturned: result.rows.length
    });

    // Get total count for pagination
    let countQuery = `
      SELECT COUNT(*) FROM (
        SELECT id FROM Veeva_Doc_Chat_document_index
        UNION ALL
        SELECT id FROM qms_chat_documents
      ) combined_documents
    `;
    if (nameLike) {
      countQuery = `
        SELECT COUNT(*) FROM (
          SELECT id FROM Veeva_Doc_Chat_document_index WHERE document_name ILIKE $1
          UNION ALL
          SELECT id FROM qms_chat_documents WHERE document_name ILIKE $1
        ) combined_documents
      `;
    }
    
    const countStartTime = Date.now();
    const countResult = await pool.query(countQuery, nameLike ? [`%${nameLike}%`] : []);
    const countDuration = Date.now() - countStartTime;
    const total = parseInt(countResult.rows[0].count);

    console.log(`Count query executed in ${countDuration}ms`, {
      totalRecords: total
    });

    const totalDuration = Date.now() - startTime;
    console.log('Indexed documents retrieval completed:', {
      totalDuration: `${totalDuration}ms`,
      totalRecords: total,
      returnedRecords: result.rows.length,
      hasFilter: !!nameLike,
      timestamp: new Date().toISOString()
    });

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
          veeva_document_id: row.veeva_document_id,
          document_number: row.document_number,
          document_name: row.document_name,
          major_version: row.major_version,
          minor_version: row.minor_version,
          document_type: row.document_type,
          status: row.status,
          summary: row.summary,
          manual_summary: row.manual_summary,
          indexed_at: row.indexed_at,
          updated_at: row.updated_at,
        }))
      }),
    };
  } catch (e) {
    const totalDuration = Date.now() - startTime;
    console.error('Get indexed documents error:', {
      message: e.message,
      stack: e.stack,
      duration: `${totalDuration}ms`,
      timestamp: new Date().toISOString(),
      queryParams: Object.fromEntries(new URL(event.rawUrl).searchParams)
    });
    return { statusCode: 500, body: JSON.stringify({ error: e.message }) };
  }
};
