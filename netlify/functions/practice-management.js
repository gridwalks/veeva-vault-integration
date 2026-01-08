import { getPool, initDatabase } from "./db.js";
import { getCorsHeaders, handleOptionsRequest, extractAuthToken, parseRequestBody, getJsonParseErrorResponse, createErrorResponse, createSuccessResponse } from "./shared-utils.js";
import { verifyAuthToken, verifyAdminRole } from "./security-utils.js";

export const handler = async (event) => {
  // Handle CORS preflight
  if (event.httpMethod === 'OPTIONS') {
    const corsHeaders = getCorsHeaders(['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'], event);
    return handleOptionsRequest(corsHeaders);
  }

  const corsHeaders = getCorsHeaders(['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'], event);

  try {
    // Verify authentication
    const authResult = verifyAuthToken(event);
    if (!authResult.valid) {
      return createErrorResponse(401, 'Authentication required', corsHeaders);
    }

    const isAdmin = await verifyAdminRole(authResult.token);
    if (!isAdmin) {
      return createErrorResponse(403, 'Admin access required', corsHeaders);
    }

    // Initialize database
    await initDatabase();
    const pool = getPool();

    const pathParts = event.path?.split('/').filter(Boolean) || [];
    const associationId = pathParts[pathParts.length - 1] && !isNaN(pathParts[pathParts.length - 1]) 
      ? parseInt(pathParts[pathParts.length - 1]) 
      : null;

    // Route based on HTTP method and path
    if (event.httpMethod === 'GET') {
      if (pathParts[pathParts.length - 1] === 'practices') {
        // GET /api/practice-management/practices - List all practices
        return await listPractices(pool, corsHeaders);
      } else if (pathParts[pathParts.length - 1] === 'regulations') {
        // GET /api/practice-management/regulations - List all CFR regulations
        return await listRegulations(pool, event.queryStringParameters || {}, corsHeaders);
      } else if (pathParts[pathParts.length - 2] === 'associations' && pathParts[pathParts.length - 1] === 'by-practice') {
        // GET /api/practice-management/associations/by-practice?practice_id=X - Get associations by practice
        const practiceId = event.queryStringParameters?.practice_id;
        return await getAssociationsByPractice(pool, practiceId, corsHeaders);
      } else if (pathParts[pathParts.length - 2] === 'associations' && pathParts[pathParts.length - 1] === 'by-regulation') {
        // GET /api/practice-management/associations/by-regulation?regulation_id=X - Get associations by regulation
        const regulationId = event.queryStringParameters?.regulation_id;
        return await getAssociationsByRegulation(pool, regulationId, corsHeaders);
      } else if (pathParts[pathParts.length - 1] === 'associations') {
        // GET /api/practice-management/associations - List all associations
        return await listAssociations(pool, event.queryStringParameters || {}, corsHeaders);
      }
    } else if (event.httpMethod === 'POST') {
      if (pathParts[pathParts.length - 1] === 'associations') {
        // POST /api/practice-management/associations - Create association
        return await createAssociation(pool, event.body, corsHeaders);
      }
    } else if (event.httpMethod === 'DELETE') {
      if (associationId) {
        // DELETE /api/practice-management/associations/:id - Delete association
        return await deleteAssociation(pool, associationId, corsHeaders);
      }
    }

    return createErrorResponse(404, 'Endpoint not found', corsHeaders);
  } catch (error) {
    console.error('Error in practice-management:', error);
    return createErrorResponse(500, error.message || 'Internal server error', corsHeaders);
  }
};

// List all practices
async function listPractices(pool, corsHeaders) {
  try {
    const result = await pool.query(`
      SELECT id, practice_code, practice_name, description, created_at, updated_at
      FROM pharmaceutical_practices
      ORDER BY practice_code
    `);
    
    return createSuccessResponse({
      practices: result.rows
    }, corsHeaders);
  } catch (error) {
    console.error('Error listing practices:', error);
    return createErrorResponse(500, error.message, corsHeaders);
  }
}

// List all CFR regulations with optional search
async function listRegulations(pool, queryParams, corsHeaders) {
  try {
    const search = queryParams.search || '';
    const limit = parseInt(queryParams.limit || '100', 10);
    const offset = parseInt(queryParams.offset || '0', 10);
    
    let query = `
      SELECT 
        r.id,
        r.regulation_id,
        r.regulation_type,
        r.title,
        r.chapter_id,
        r.subchapter_id,
        COUNT(c.id) as chunk_count,
        COALESCE(
          (
            SELECT array_agg(pp.practice_code ORDER BY pp.practice_code)
            FROM practice_regulation_associations pra
            INNER JOIN pharmaceutical_practices pp ON pra.practice_id = pp.id
            WHERE pra.regulation_id = r.id
          ),
          ARRAY[]::VARCHAR[]
        ) as associated_practices
      FROM cfr_title21_regulations r
      LEFT JOIN cfr_title21_regulation_chunks c ON r.id = c.regulation_id
    `;
    
    const params = [];
    if (search) {
      query += ` WHERE r.title ILIKE $1 OR r.regulation_id ILIKE $1`;
      params.push(`%${search}%`);
    }
    
    query += ` GROUP BY r.id, r.regulation_id, r.regulation_type, r.title, r.chapter_id, r.subchapter_id`;
    query += ` ORDER BY r.regulation_id`;
    query += ` LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
    params.push(limit, offset);
    
    const result = await pool.query(query, params);
    
    // Get total count
    let countQuery = `SELECT COUNT(*) as total FROM cfr_title21_regulations r`;
    const countParams = [];
    if (search) {
      countQuery += ` WHERE r.title ILIKE $1 OR r.regulation_id ILIKE $1`;
      countParams.push(`%${search}%`);
    }
    const countResult = await pool.query(countQuery, countParams);
    const total = parseInt(countResult.rows[0].total, 10);
    
    return createSuccessResponse({
      regulations: result.rows.map(row => ({
        id: row.id,
        regulation_id: row.regulation_id,
        regulation_type: row.regulation_type,
        title: row.title,
        chapter_id: row.chapter_id,
        subchapter_id: row.subchapter_id,
        chunk_count: parseInt(row.chunk_count, 10),
        associated_practices: row.associated_practices || []
      })),
      total,
      limit,
      offset
    }, corsHeaders);
  } catch (error) {
    console.error('Error listing regulations:', error);
    return createErrorResponse(500, error.message, corsHeaders);
  }
}

// List all associations
async function listAssociations(pool, queryParams, corsHeaders) {
  try {
    const practiceId = queryParams.practice_id ? parseInt(queryParams.practice_id, 10) : null;
    const regulationId = queryParams.regulation_id ? parseInt(queryParams.regulation_id, 10) : null;
    
    let query = `
      SELECT 
        pra.id,
        pra.practice_id,
        pra.regulation_id,
        pra.association_type,
        pra.notes,
        pp.practice_code,
        pp.practice_name,
        r.regulation_id as regulation_identifier,
        r.title as regulation_title
      FROM practice_regulation_associations pra
      INNER JOIN pharmaceutical_practices pp ON pra.practice_id = pp.id
      INNER JOIN cfr_title21_regulations r ON pra.regulation_id = r.id
      WHERE 1=1
    `;
    
    const params = [];
    if (practiceId) {
      query += ` AND pra.practice_id = $${params.length + 1}`;
      params.push(practiceId);
    }
    if (regulationId) {
      query += ` AND pra.regulation_id = $${params.length + 1}`;
      params.push(regulationId);
    }
    
    query += ` ORDER BY pp.practice_code, r.regulation_id`;
    
    const result = await pool.query(query, params);
    
    return createSuccessResponse({
      associations: result.rows.map(row => ({
        id: row.id,
        practice_id: row.practice_id,
        regulation_id: row.regulation_id,
        association_type: row.association_type,
        notes: row.notes,
        practice_code: row.practice_code,
        practice_name: row.practice_name,
        regulation_identifier: row.regulation_identifier,
        regulation_title: row.regulation_title
      }))
    }, corsHeaders);
  } catch (error) {
    console.error('Error listing associations:', error);
    return createErrorResponse(500, error.message, corsHeaders);
  }
}

// Get associations by practice
async function getAssociationsByPractice(pool, practiceId, corsHeaders) {
  if (!practiceId) {
    return createErrorResponse(400, 'practice_id is required', corsHeaders);
  }
  
  try {
    const result = await pool.query(`
      SELECT 
        pra.id,
        pra.regulation_id,
        pra.association_type,
        pra.notes,
        r.regulation_id as regulation_identifier,
        r.title as regulation_title,
        r.regulation_type
      FROM practice_regulation_associations pra
      INNER JOIN cfr_title21_regulations r ON pra.regulation_id = r.id
      WHERE pra.practice_id = $1
      ORDER BY r.regulation_id
    `, [practiceId]);
    
    return createSuccessResponse({
      associations: result.rows
    }, corsHeaders);
  } catch (error) {
    console.error('Error getting associations by practice:', error);
    return createErrorResponse(500, error.message, corsHeaders);
  }
}

// Get associations by regulation
async function getAssociationsByRegulation(pool, regulationId, corsHeaders) {
  if (!regulationId) {
    return createErrorResponse(400, 'regulation_id is required', corsHeaders);
  }
  
  try {
    const result = await pool.query(`
      SELECT 
        pra.id,
        pra.practice_id,
        pra.association_type,
        pra.notes,
        pp.practice_code,
        pp.practice_name
      FROM practice_regulation_associations pra
      INNER JOIN pharmaceutical_practices pp ON pra.practice_id = pp.id
      WHERE pra.regulation_id = $1
      ORDER BY pp.practice_code
    `, [regulationId]);
    
    return createSuccessResponse({
      associations: result.rows
    }, corsHeaders);
  } catch (error) {
    console.error('Error getting associations by regulation:', error);
    return createErrorResponse(500, error.message, corsHeaders);
  }
}

// Create association
async function createAssociation(pool, body, corsHeaders) {
  try {
    const { practice_id, regulation_id, association_type = 'primary', notes = null } = parseRequestBody(body);
    
    if (!practice_id || !regulation_id) {
      return createErrorResponse(400, 'practice_id and regulation_id are required', corsHeaders);
    }
    
    // Check if association already exists
    const existing = await pool.query(`
      SELECT id FROM practice_regulation_associations
      WHERE practice_id = $1 AND regulation_id = $2
    `, [practice_id, regulation_id]);
    
    if (existing.rows.length > 0) {
      return createErrorResponse(409, 'Association already exists', corsHeaders);
    }
    
    const result = await pool.query(`
      INSERT INTO practice_regulation_associations (practice_id, regulation_id, association_type, notes)
      VALUES ($1, $2, $3, $4)
      RETURNING id, practice_id, regulation_id, association_type, notes, created_at
    `, [practice_id, regulation_id, association_type, notes]);
    
    return createSuccessResponse({
      association: result.rows[0]
    }, corsHeaders);
  } catch (error) {
    console.error('Error creating association:', error);
    if (error.code === '23503') { // Foreign key violation
      return createErrorResponse(400, 'Invalid practice_id or regulation_id', corsHeaders);
    }
    return createErrorResponse(500, error.message, corsHeaders);
  }
}

// Delete association
async function deleteAssociation(pool, associationId, corsHeaders) {
  try {
    const result = await pool.query(`
      DELETE FROM practice_regulation_associations
      WHERE id = $1
      RETURNING id
    `, [associationId]);
    
    if (result.rows.length === 0) {
      return createErrorResponse(404, 'Association not found', corsHeaders);
    }
    
    return createSuccessResponse({
      message: 'Association deleted successfully',
      id: associationId
    }, corsHeaders);
  } catch (error) {
    console.error('Error deleting association:', error);
    return createErrorResponse(500, error.message, corsHeaders);
  }
}

