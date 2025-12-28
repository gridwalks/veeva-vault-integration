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

    const userId = authResult.claims?.sub || authResult.claims?.encrypted ? null : null;
    const isAdmin = await verifyAdminRole(authResult.token);

    // Initialize database
    await initDatabase();
    const pool = getPool();

    // Route based on HTTP method and path
    const pathParts = event.path?.split('/').filter(Boolean) || [];
    const courseId = pathParts[pathParts.length - 1] && !isNaN(pathParts[pathParts.length - 1]) 
      ? parseInt(pathParts[pathParts.length - 1]) 
      : null;
    const queryParams = event.queryStringParameters || {};

    // Check if this is a certificate endpoint
    if (pathParts[pathParts.length - 1] === 'certificates' && event.httpMethod === 'GET') {
      const targetUserId = queryParams.user_id || userId;
      // Users can only view their own certificates unless they're admin
      if (targetUserId !== userId && !isAdmin) {
        return createErrorResponse(403, 'Access denied', corsHeaders);
      }
      return await getCertificates(pool, targetUserId, queryParams, corsHeaders);
    }

    if (event.httpMethod === 'GET') {
      if (courseId) {
        // GET /api/course-management/:id - Get course details with modules and lessons
        return await getCourseDetails(pool, courseId, corsHeaders);
      } else {
        // GET /api/course-management - List all courses
        const queryParams = event.queryStringParameters || {};
        return await listCourses(pool, queryParams, corsHeaders);
      }
    } else if (event.httpMethod === 'POST') {
      // POST /api/course-management - Create course (admin only)
      if (!isAdmin) {
        return createErrorResponse(403, 'Admin access required', corsHeaders);
      }
      return await createCourse(pool, event.body, corsHeaders, userId);
    } else if (event.httpMethod === 'PUT') {
      // PUT /api/course-management/:id - Update course (admin only)
      if (!isAdmin) {
        return createErrorResponse(403, 'Admin access required', corsHeaders);
      }
      if (!courseId) {
        return createErrorResponse(400, 'Course ID is required', corsHeaders);
      }
      return await updateCourse(pool, courseId, event.body, corsHeaders);
    } else if (event.httpMethod === 'DELETE') {
      // DELETE /api/course-management/:id - Delete course (admin only)
      if (!isAdmin) {
        return createErrorResponse(403, 'Admin access required', corsHeaders);
      }
      if (!courseId) {
        return createErrorResponse(400, 'Course ID is required', corsHeaders);
      }
      return await deleteCourse(pool, courseId, corsHeaders);
    } else {
      return createErrorResponse(405, 'Method not allowed', corsHeaders);
    }
  } catch (error) {
    console.error('Error in course-management:', error);
    return createErrorResponse(500, error.message || 'Internal server error', corsHeaders);
  }
};

// Get certificates for a user
async function getCertificates(pool, userId, queryParams, corsHeaders) {
  try {
    const { course_id } = queryParams;

    let query = `
      SELECT 
        cert.id,
        cert.certificate_number,
        cert.course_id,
        cert.certificate_data,
        cert.pdf_url,
        cert.issued_at,
        cert.expires_at,
        cert.is_verified,
        c.title as course_title,
        c.category as course_category
      FROM gxp_certificates cert
      INNER JOIN gxp_courses c ON cert.course_id = c.id
      WHERE cert.user_id = $1
    `;

    const params = [userId];
    if (course_id) {
      query += ` AND cert.course_id = $2`;
      params.push(parseInt(course_id));
    }

    query += ` ORDER BY cert.issued_at DESC`;

    const result = await pool.query(query, params);

    return createSuccessResponse({
      certificates: result.rows,
      total: result.rows.length
    }, 200);
  } catch (error) {
    console.error('Error getting certificates:', error);
    throw error;
  }
}

// List all courses with optional filters
async function listCourses(pool, queryParams, corsHeaders) {
  try {
    const { category, difficulty, is_published, instructor_id, search } = queryParams;
    
    let query = `
      SELECT 
        c.id,
        c.title,
        c.description,
        c.category,
        c.difficulty,
        c.estimated_hours,
        c.instructor_id,
        c.is_published,
        c.thumbnail_url,
        c.created_at,
        c.updated_at,
        COUNT(DISTINCT m.id) as module_count,
        COUNT(DISTINCT l.id) as lesson_count
      FROM gxp_courses c
      LEFT JOIN gxp_modules m ON c.id = m.course_id
      LEFT JOIN gxp_lessons l ON m.id = l.module_id
    `;
    
    const conditions = [];
    const params = [];
    let paramIndex = 1;

    if (category) {
      conditions.push(`c.category = $${paramIndex++}`);
      params.push(category);
    }

    if (difficulty) {
      conditions.push(`c.difficulty = $${paramIndex++}`);
      params.push(difficulty);
    }

    if (is_published !== undefined) {
      conditions.push(`c.is_published = $${paramIndex++}`);
      params.push(is_published === 'true');
    }

    if (instructor_id) {
      conditions.push(`c.instructor_id = $${paramIndex++}`);
      params.push(instructor_id);
    }

    if (search) {
      conditions.push(`(c.title ILIKE $${paramIndex} OR c.description ILIKE $${paramIndex})`);
      params.push(`%${search}%`);
      paramIndex++;
    }

    if (conditions.length > 0) {
      query += ` WHERE ${conditions.join(' AND ')}`;
    }

    query += ` GROUP BY c.id ORDER BY c.created_at DESC`;

    const result = await pool.query(query, params);
    
    return createSuccessResponse({
      courses: result.rows,
      total: result.rows.length
    }, 200);
  } catch (error) {
    console.error('Error listing courses:', error);
    throw error;
  }
}

// Get course details with modules and lessons
async function getCourseDetails(pool, courseId, corsHeaders) {
  try {
    // Get course
    const courseResult = await pool.query(
      `SELECT * FROM gxp_courses WHERE id = $1`,
      [courseId]
    );

    if (courseResult.rows.length === 0) {
      return createErrorResponse(404, 'Course not found', corsHeaders);
    }

    const course = courseResult.rows[0];

    // Get modules with lessons
    const modulesResult = await pool.query(
      `SELECT 
        m.id,
        m.module_order,
        m.title,
        m.description,
        m.created_at,
        m.updated_at,
        json_agg(
          json_build_object(
            'id', l.id,
            'lesson_order', l.lesson_order,
            'title', l.title,
            'description', l.description,
            'content_type', l.content_type,
            'estimated_minutes', l.estimated_minutes,
            'cfr_regulation_id', l.cfr_regulation_id,
            'document_id', l.document_id,
            'workflow_template_id', l.workflow_template_id,
            'created_at', l.created_at,
            'updated_at', l.updated_at
          ) ORDER BY l.lesson_order
        ) FILTER (WHERE l.id IS NOT NULL) as lessons
      FROM gxp_modules m
      LEFT JOIN gxp_lessons l ON m.id = l.module_id
      WHERE m.course_id = $1
      GROUP BY m.id, m.module_order, m.title, m.description, m.created_at, m.updated_at
      ORDER BY m.module_order`,
      [courseId]
    );

    course.modules = modulesResult.rows.map(module => ({
      ...module,
      lessons: module.lessons || []
    }));

    return createSuccessResponse({ course }, 200);
  } catch (error) {
    console.error('Error getting course details:', error);
    throw error;
  }
}

// Create a new course
async function createCourse(pool, body, corsHeaders, userId) {
  try {
    const data = parseRequestBody(body, corsHeaders);
    if (!data) {
      return getJsonParseErrorResponse(corsHeaders);
    }

    const { title, description, category, difficulty, estimated_hours, thumbnail_url, is_published } = data;

    if (!title) {
      return createErrorResponse(400, 'Title is required', corsHeaders);
    }

    const result = await pool.query(
      `INSERT INTO gxp_courses 
        (title, description, category, difficulty, estimated_hours, instructor_id, thumbnail_url, is_published)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        RETURNING *`,
      [title, description || null, category || null, difficulty || 'beginner', estimated_hours || null, userId, thumbnail_url || null, is_published || false]
    );

    return createSuccessResponse({ course: result.rows[0] }, 201);
  } catch (error) {
    console.error('Error creating course:', error);
    throw error;
  }
}

// Update a course
async function updateCourse(pool, courseId, body, corsHeaders) {
  try {
    const data = parseRequestBody(body, corsHeaders);
    if (!data) {
      return getJsonParseErrorResponse(corsHeaders);
    }

    // Check if course exists
    const existing = await pool.query('SELECT id FROM gxp_courses WHERE id = $1', [courseId]);
    if (existing.rows.length === 0) {
      return createErrorResponse(404, 'Course not found', corsHeaders);
    }

    const { title, description, category, difficulty, estimated_hours, instructor_id, thumbnail_url, is_published } = data;

    const updateFields = [];
    const params = [];
    let paramIndex = 1;

    if (title !== undefined) {
      updateFields.push(`title = $${paramIndex++}`);
      params.push(title);
    }
    if (description !== undefined) {
      updateFields.push(`description = $${paramIndex++}`);
      params.push(description);
    }
    if (category !== undefined) {
      updateFields.push(`category = $${paramIndex++}`);
      params.push(category);
    }
    if (difficulty !== undefined) {
      updateFields.push(`difficulty = $${paramIndex++}`);
      params.push(difficulty);
    }
    if (estimated_hours !== undefined) {
      updateFields.push(`estimated_hours = $${paramIndex++}`);
      params.push(estimated_hours);
    }
    if (instructor_id !== undefined) {
      updateFields.push(`instructor_id = $${paramIndex++}`);
      params.push(instructor_id);
    }
    if (thumbnail_url !== undefined) {
      updateFields.push(`thumbnail_url = $${paramIndex++}`);
      params.push(thumbnail_url);
    }
    if (is_published !== undefined) {
      updateFields.push(`is_published = $${paramIndex++}`);
      params.push(is_published);
    }

    if (updateFields.length === 0) {
      return createErrorResponse(400, 'No fields to update', corsHeaders);
    }

    updateFields.push(`updated_at = CURRENT_TIMESTAMP`);
    params.push(courseId);

    const result = await pool.query(
      `UPDATE gxp_courses 
        SET ${updateFields.join(', ')}
        WHERE id = $${paramIndex}
        RETURNING *`,
      params
    );

    return createSuccessResponse({ course: result.rows[0] }, 200);
  } catch (error) {
    console.error('Error updating course:', error);
    throw error;
  }
}

// Delete a course (cascade will delete modules and lessons)
async function deleteCourse(pool, courseId, corsHeaders) {
  try {
    // Check if course exists
    const existing = await pool.query('SELECT id FROM gxp_courses WHERE id = $1', [courseId]);
    if (existing.rows.length === 0) {
      return createErrorResponse(404, 'Course not found', corsHeaders);
    }

    await pool.query('DELETE FROM gxp_courses WHERE id = $1', [courseId]);

    return createSuccessResponse({ message: 'Course deleted successfully' }, 200);
  } catch (error) {
    console.error('Error deleting course:', error);
    throw error;
  }
}

