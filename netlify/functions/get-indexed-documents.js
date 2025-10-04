import { getPool, initDatabase } from "./db.js";

export const handler = async (event) => {
  try {
    // Initialize database
    await initDatabase();
    
    const q = new URL(event.rawUrl).searchParams;
    const nameLike = q.get("name")?.trim();
    const limit = Math.min(Number(q.get("limit") || 100), 1000);
    const offset = Number(q.get("offset") || 0);

    const pool = getPool();
    
    let query = `
      SELECT id, veeva_document_id, document_number, document_name, 
             major_version, minor_version, document_type, status, 
             summary, indexed_at, updated_at
      FROM document_index
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

    const result = await pool.query(query, queryParams);

    // Get total count for pagination
    let countQuery = 'SELECT COUNT(*) FROM document_index';
    if (nameLike) {
      countQuery += ' WHERE document_name ILIKE $1';
    }
    const countResult = await pool.query(countQuery, nameLike ? [`%${nameLike}%`] : []);
    const total = parseInt(countResult.rows[0].count);

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        total,
        pageOffset: offset,
        pageSize: limit,
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
          indexed_at: row.indexed_at,
          updated_at: row.updated_at,
        }))
      }),
    };
  } catch (e) {
    console.error('Get indexed documents error:', e);
    return { statusCode: 500, body: JSON.stringify({ error: e.message }) };
  }
};
