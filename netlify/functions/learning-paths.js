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

    const userId = authResult.claims?.sub || null;
    const isAdmin = await verifyAdminRole(authResult.token);

    // Initialize database
    await initDatabase();
    const pool = getPool();

    // Route based on HTTP method and path
    const pathParts = event.path?.split('/').filter(Boolean) || [];
    const pathId = pathParts[pathParts.length - 1] && !isNaN(pathParts[pathParts.length - 1]) 
      ? parseInt(pathParts[pathParts.length - 1]) 
      : null;

    if (event.httpMethod === 'GET') {
      if (pathId) {
        // GET /api/learning-paths/:id - Get learning path details
        return await getLearningPathDetails(pool, pathId, corsHeaders);
      } else {
        // GET /api/learning-paths - List all learning paths
        const queryParams = event.queryStringParameters || {};
        return await listLearningPaths(pool, queryParams, corsHeaders);
      }
    } else if (event.httpMethod === 'POST') {
      // POST /api/learning-paths - Create learning path (admin only)
      if (!isAdmin) {
        return createErrorResponse(403, 'Admin access required', corsHeaders);
      }
      return await createLearningPath(pool, event.body, corsHeaders);
    } else if (event.httpMethod === 'PUT') {
      // PUT /api/learning-paths/:id - Update learning path (admin only)
      if (!isAdmin) {
        return createErrorResponse(403, 'Admin access required', corsHeaders);
      }
      if (!pathId) {
        return createErrorResponse(400, 'Learning path ID is required', corsHeaders);
      }
      return await updateLearningPath(pool, pathId, event.body, corsHeaders);
    } else if (event.httpMethod === 'DELETE') {
      // DELETE /api/learning-paths/:id - Delete learning path (admin only)
      if (!isAdmin) {
        return createErrorResponse(403, 'Admin access required', corsHeaders);
      }
      if (!pathId) {
        return createErrorResponse(400, 'Learning path ID is required', corsHeaders);
      }
      return await deleteLearningPath(pool, pathId, corsHeaders);
    } else {
      return createErrorResponse(405, 'Method not allowed', corsHeaders);
    }
  } catch (error) {
    console.error('Error in learning-paths:', error);
    return createErrorResponse(500, error.message || 'Internal server error', corsHeaders);
  }
};

// List all learning paths
async function listLearningPaths(pool, queryParams, corsHeaders) {
  try {
    const { category, is_published, search } = queryParams;
    
    let query = `
      SELECT 
        lp.id,
        lp.path_name,
        lp.description,
        lp.category,
        lp.course_ids,
        lp.estimated_total_hours,
        lp.is_published,
        lp.created_at,
        lp.updated_at,
        array_length(lp.course_ids, 1) as course_count
      FROM gxp_learning_paths lp
    `;
    
    const conditions = [];
    const params = [];
    let paramIndex = 1;

    if (category) {
      conditions.push(`lp.category = $${paramIndex++}`);
      params.push(category);
    }

    if (is_published !== undefined) {
      conditions.push(`lp.is_published = $${paramIndex++}`);
      params.push(is_published === 'true');
    }

    if (search) {
      conditions.push(`(lp.path_name ILIKE $${paramIndex} OR lp.description ILIKE $${paramIndex})`);
      params.push(`%${search}%`);
      paramIndex++;
    }

    if (conditions.length > 0) {
      query += ` WHERE ${conditions.join(' AND ')}`;
    }

    query += ` ORDER BY lp.created_at DESC`;

    const result = await pool.query(query, params);

    // Enrich with course details
    const enrichedPaths = await Promise.all(result.rows.map(async (path) => {
      if (path.course_ids && path.course_ids.length > 0) {
        const coursePlaceholders = path.course_ids.map((_, i) => `$${i + 1}`).join(',');
        const coursesResult = await pool.query(
          `SELECT id, title, description, difficulty, estimated_hours, thumbnail_url 
           FROM gxp_courses 
           WHERE id IN (${coursePlaceholders})
           ORDER BY array_position($${path.course_ids.length + 1}::integer[], id)`,
          [...path.course_ids, path.course_ids]
        );
        path.courses = coursesResult.rows;
      } else {
        path.courses = [];
      }
      return path;
    }));
    
    return createSuccessResponse({
      learning_paths: enrichedPaths,
      total: enrichedPaths.length
    }, 200);
  } catch (error) {
    console.error('Error listing learning paths:', error);
    throw error;
  }
}

// Get learning path details
async function getLearningPathDetails(pool, pathId, corsHeaders) {
  try {
    const result = await pool.query(
      `SELECT * FROM gxp_learning_paths WHERE id = $1`,
      [pathId]
    );

    if (result.rows.length === 0) {
      return createErrorResponse(404, 'Learning path not found', corsHeaders);
    }

    const path = result.rows[0];

    // Get course details
    if (path.course_ids && path.course_ids.length > 0) {
      const coursePlaceholders = path.course_ids.map((_, i) => `$${i + 1}`).join(',');
      const coursesResult = await pool.query(
        `SELECT id, title, description, category, difficulty, estimated_hours, thumbnail_url, is_published
         FROM gxp_courses 
         WHERE id IN (${coursePlaceholders})
         ORDER BY array_position($${path.course_ids.length + 1}::integer[], id)`,
        [...path.course_ids, path.course_ids]
      );
      path.courses = coursesResult.rows;
    } else {
      path.courses = [];
    }

    return createSuccessResponse({ learning_path: path }, 200);
  } catch (error) {
    console.error('Error getting learning path details:', error);
    throw error;
  }
}

// Create a new learning path
async function createLearningPath(pool, body, corsHeaders) {
  try {
    const data = parseRequestBody(body, corsHeaders);
    if (!data) {
      return getJsonParseErrorResponse(corsHeaders);
    }

    const { path_name, description, category, course_ids, estimated_total_hours, is_published } = data;

    if (!path_name) {
      return createErrorResponse(400, 'Path name is required', corsHeaders);
    }

    if (!course_ids || !Array.isArray(course_ids) || course_ids.length === 0) {
      return createErrorResponse(400, 'Course IDs array is required and must not be empty', corsHeaders);
    }

    // Validate that all course IDs exist
    const coursePlaceholders = course_ids.map((_, i) => `$${i + 1}`).join(',');
    const coursesCheck = await pool.query(
      `SELECT id FROM gxp_courses WHERE id IN (${coursePlaceholders})`,
      course_ids
    );

    if (coursesCheck.rows.length !== course_ids.length) {
      return createErrorResponse(400, 'One or more course IDs are invalid', corsHeaders);
    }

    const result = await pool.query(
      `INSERT INTO gxp_learning_paths 
        (path_name, description, category, course_ids, estimated_total_hours, is_published)
        VALUES ($1, $2, $3, $4, $5, $6)
        RETURNING *`,
      [path_name, description || null, category || null, course_ids, estimated_total_hours || null, is_published || false]
    );

    return createSuccessResponse({ learning_path: result.rows[0] }, 201);
  } catch (error) {
    console.error('Error creating learning path:', error);
    throw error;
  }
}

// Update a learning path
async function updateLearningPath(pool, pathId, body, corsHeaders) {
  try {
    const data = parseRequestBody(body, corsHeaders);
    if (!data) {
      return getJsonParseErrorResponse(corsHeaders);
    }

    // Check if learning path exists
    const existing = await pool.query('SELECT id FROM gxp_learning_paths WHERE id = $1', [pathId]);
    if (existing.rows.length === 0) {
      return createErrorResponse(404, 'Learning path not found', corsHeaders);
    }

    const { path_name, description, category, course_ids, estimated_total_hours, is_published } = data;

    // Validate course IDs if provided
    if (course_ids !== undefined) {
      if (!Array.isArray(course_ids) || course_ids.length === 0) {
        return createErrorResponse(400, 'Course IDs must be a non-empty array', corsHeaders);
      }

      const coursePlaceholders = course_ids.map((_, i) => `$${i + 1}`).join(',');
      const coursesCheck = await pool.query(
        `SELECT id FROM gxp_courses WHERE id IN (${coursePlaceholders})`,
        course_ids
      );

      if (coursesCheck.rows.length !== course_ids.length) {
        return createErrorResponse(400, 'One or more course IDs are invalid', corsHeaders);
      }
    }

    const updateFields = [];
    const params = [];
    let paramIndex = 1;

    if (path_name !== undefined) {
      updateFields.push(`path_name = $${paramIndex++}`);
      params.push(path_name);
    }
    if (description !== undefined) {
      updateFields.push(`description = $${paramIndex++}`);
      params.push(description);
    }
    if (category !== undefined) {
      updateFields.push(`category = $${paramIndex++}`);
      params.push(category);
    }
    if (course_ids !== undefined) {
      updateFields.push(`course_ids = $${paramIndex++}`);
      params.push(course_ids);
    }
    if (estimated_total_hours !== undefined) {
      updateFields.push(`estimated_total_hours = $${paramIndex++}`);
      params.push(estimated_total_hours);
    }
    if (is_published !== undefined) {
      updateFields.push(`is_published = $${paramIndex++}`);
      params.push(is_published);
    }

    if (updateFields.length === 0) {
      return createErrorResponse(400, 'No fields to update', corsHeaders);
    }

    updateFields.push(`updated_at = CURRENT_TIMESTAMP`);
    params.push(pathId);

    const result = await pool.query(
      `UPDATE gxp_learning_paths 
        SET ${updateFields.join(', ')}
        WHERE id = $${paramIndex}
        RETURNING *`,
      params
    );

    return createSuccessResponse({ learning_path: result.rows[0] }, 200);
  } catch (error) {
    console.error('Error updating learning path:', error);
    throw error;
  }
}

// Delete a learning path
async function deleteLearningPath(pool, pathId, corsHeaders) {
  try {
    // Check if learning path exists
    const existing = await pool.query('SELECT id FROM gxp_learning_paths WHERE id = $1', [pathId]);
    if (existing.rows.length === 0) {
      return createErrorResponse(404, 'Learning path not found', corsHeaders);
    }

    await pool.query('DELETE FROM gxp_learning_paths WHERE id = $1', [pathId]);

    return createSuccessResponse({ message: 'Learning path deleted successfully' }, 200);
  } catch (error) {
    console.error('Error deleting learning path:', error);
    throw error;
  }
}

