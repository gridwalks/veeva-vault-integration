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

    // Check if this is a module endpoint
    if (pathParts[pathParts.length - 2] === 'modules' && pathParts[pathParts.length - 1] && !isNaN(pathParts[pathParts.length - 1])) {
      const moduleId = parseInt(pathParts[pathParts.length - 1]);
      if (event.httpMethod === 'PUT') {
        // PUT /api/course-management/modules/:id - Update module (admin only)
        if (!isAdmin) {
          return createErrorResponse(403, 'Admin access required', corsHeaders);
        }
        return await updateModule(pool, moduleId, event.body, corsHeaders);
      } else if (event.httpMethod === 'DELETE') {
        // DELETE /api/course-management/modules/:id - Delete module (admin only)
        if (!isAdmin) {
          return createErrorResponse(403, 'Admin access required', corsHeaders);
        }
        return await deleteModule(pool, moduleId, corsHeaders);
      }
    }

    // Check if this is a lesson endpoint
    if (pathParts[pathParts.length - 2] === 'lessons' && pathParts[pathParts.length - 1] && !isNaN(pathParts[pathParts.length - 1])) {
      const lessonId = parseInt(pathParts[pathParts.length - 1]);
      if (event.httpMethod === 'PUT') {
        // PUT /api/course-management/lessons/:id - Update lesson (admin only)
        if (!isAdmin) {
          return createErrorResponse(403, 'Admin access required', corsHeaders);
        }
        return await updateLesson(pool, lessonId, event.body, corsHeaders);
      } else if (event.httpMethod === 'GET') {
        // GET /api/course-management/lessons/:id - Get lesson details
        return await getLessonDetails(pool, lessonId, corsHeaders);
      } else if (event.httpMethod === 'DELETE') {
        // DELETE /api/course-management/lessons/:id - Delete lesson (admin only)
        if (!isAdmin) {
          return createErrorResponse(403, 'Admin access required', corsHeaders);
        }
        return await deleteLesson(pool, lessonId, corsHeaders);
      }
    }

    // Check if this is a create module endpoint: POST /api/course-management/courses/:courseId/modules
    if (pathParts[pathParts.length - 1] === 'modules' && pathParts[pathParts.length - 2] && !isNaN(pathParts[pathParts.length - 2]) && 
        pathParts[pathParts.length - 3] === 'courses' && event.httpMethod === 'POST') {
      const courseId = parseInt(pathParts[pathParts.length - 2]);
      if (!isAdmin) {
        return createErrorResponse(403, 'Admin access required', corsHeaders);
      }
      return await createModule(pool, courseId, event.body, corsHeaders);
    }

    // Check if this is a create lesson endpoint: POST /api/course-management/modules/:moduleId/lessons
    if (pathParts[pathParts.length - 1] === 'lessons' && pathParts[pathParts.length - 2] && !isNaN(pathParts[pathParts.length - 2]) && 
        pathParts[pathParts.length - 3] === 'modules' && event.httpMethod === 'POST') {
      const moduleId = parseInt(pathParts[pathParts.length - 2]);
      if (!isAdmin) {
        return createErrorResponse(403, 'Admin access required', corsHeaders);
      }
      return await createLesson(pool, moduleId, event.body, corsHeaders);
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

    // Get modules with lessons and linked resource details
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
            'cfr_regulation_title', cfr.title,
            'cfr_regulation_identifier', cfr.regulation_id,
            'document_id', l.document_id,
            'document_name', d.document_name,
            'document_number', d.document_number,
            'workflow_template_id', l.workflow_template_id,
            'workflow_template_name', w.name,
            'created_at', l.created_at,
            'updated_at', l.updated_at
          ) ORDER BY l.lesson_order
        ) FILTER (WHERE l.id IS NOT NULL) as lessons
      FROM gxp_modules m
      LEFT JOIN gxp_lessons l ON m.id = l.module_id
      LEFT JOIN cfr_title21_regulations cfr ON l.cfr_regulation_id = cfr.id
      LEFT JOIN Veeva_Doc_Chat_document_index d ON l.document_id = d.id
      LEFT JOIN qms_chat_workflow_templates w ON l.workflow_template_id = w.id
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

// Get lesson details
async function getLessonDetails(pool, lessonId, corsHeaders) {
  try {
    const result = await pool.query(
      `SELECT 
        l.*,
        c.title as course_title,
        m.title as module_title,
        cfr.title as cfr_regulation_title,
        cfr.regulation_id as cfr_regulation_identifier,
        d.document_name,
        d.document_number,
        w.name as workflow_template_name
      FROM gxp_lessons l
      INNER JOIN gxp_modules m ON l.module_id = m.id
      INNER JOIN gxp_courses c ON m.course_id = c.id
      LEFT JOIN cfr_title21_regulations cfr ON l.cfr_regulation_id = cfr.id
      LEFT JOIN Veeva_Doc_Chat_document_index d ON l.document_id = d.id
      LEFT JOIN qms_chat_workflow_templates w ON l.workflow_template_id = w.id
      WHERE l.id = $1`,
      [lessonId]
    );

    if (result.rows.length === 0) {
      return createErrorResponse(404, 'Lesson not found', corsHeaders);
    }

    return createSuccessResponse({ lesson: result.rows[0] }, 200);
  } catch (error) {
    console.error('Error getting lesson details:', error);
    throw error;
  }
}

// Update a lesson (for linking resources)
async function updateLesson(pool, lessonId, body, corsHeaders) {
  try {
    const data = parseRequestBody(body, corsHeaders);
    if (!data) {
      return getJsonParseErrorResponse(corsHeaders);
    }

    // Check if lesson exists
    const existing = await pool.query('SELECT id FROM gxp_lessons WHERE id = $1', [lessonId]);
    if (existing.rows.length === 0) {
      return createErrorResponse(404, 'Lesson not found', corsHeaders);
    }

    const { 
      title, 
      description, 
      content_type, 
      content_data, 
      estimated_minutes,
      cfr_regulation_id,
      document_id,
      workflow_template_id
    } = data;

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
    if (content_type !== undefined) {
      updateFields.push(`content_type = $${paramIndex++}`);
      params.push(content_type);
    }
    if (content_data !== undefined) {
      updateFields.push(`content_data = $${paramIndex++}`);
      params.push(JSON.stringify(content_data));
    }
    if (estimated_minutes !== undefined) {
      updateFields.push(`estimated_minutes = $${paramIndex++}`);
      params.push(estimated_minutes);
    }
    if (cfr_regulation_id !== undefined) {
      updateFields.push(`cfr_regulation_id = $${paramIndex++}`);
      params.push(cfr_regulation_id || null);
    }
    if (document_id !== undefined) {
      updateFields.push(`document_id = $${paramIndex++}`);
      params.push(document_id || null);
    }
    if (workflow_template_id !== undefined) {
      updateFields.push(`workflow_template_id = $${paramIndex++}`);
      params.push(workflow_template_id || null);
    }

    if (updateFields.length === 0) {
      return createErrorResponse(400, 'No fields to update', corsHeaders);
    }

    updateFields.push(`updated_at = CURRENT_TIMESTAMP`);
    params.push(lessonId);

    const result = await pool.query(
      `UPDATE gxp_lessons 
        SET ${updateFields.join(', ')}
        WHERE id = $${paramIndex}
        RETURNING *`,
      params
    );

    return createSuccessResponse({ lesson: result.rows[0] }, 200);
  } catch (error) {
    console.error('Error updating lesson:', error);
    throw error;
  }
}

// Create a new module
async function createModule(pool, courseId, body, corsHeaders) {
  try {
    const data = parseRequestBody(body, corsHeaders);
    if (!data) {
      return getJsonParseErrorResponse(corsHeaders);
    }

    // Verify course exists
    const courseCheck = await pool.query('SELECT id FROM gxp_courses WHERE id = $1', [courseId]);
    if (courseCheck.rows.length === 0) {
      return createErrorResponse(404, 'Course not found', corsHeaders);
    }

    const { title, description } = data;

    if (!title) {
      return createErrorResponse(400, 'Title is required', corsHeaders);
    }

    // Calculate next module_order
    const orderResult = await pool.query(
      `SELECT COALESCE(MAX(module_order), 0) + 1 as next_order 
       FROM gxp_modules 
       WHERE course_id = $1`,
      [courseId]
    );
    const moduleOrder = orderResult.rows[0].next_order;

    const result = await pool.query(
      `INSERT INTO gxp_modules 
        (course_id, module_order, title, description)
        VALUES ($1, $2, $3, $4)
        RETURNING *`,
      [courseId, moduleOrder, title, description || null]
    );

    return createSuccessResponse({ module: result.rows[0] }, 201);
  } catch (error) {
    console.error('Error creating module:', error);
    throw error;
  }
}

// Update a module
async function updateModule(pool, moduleId, body, corsHeaders) {
  try {
    const data = parseRequestBody(body, corsHeaders);
    if (!data) {
      return getJsonParseErrorResponse(corsHeaders);
    }

    // Check if module exists
    const existing = await pool.query('SELECT id FROM gxp_modules WHERE id = $1', [moduleId]);
    if (existing.rows.length === 0) {
      return createErrorResponse(404, 'Module not found', corsHeaders);
    }

    const { title, description, module_order } = data;

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
    if (module_order !== undefined) {
      updateFields.push(`module_order = $${paramIndex++}`);
      params.push(module_order);
    }

    if (updateFields.length === 0) {
      return createErrorResponse(400, 'No fields to update', corsHeaders);
    }

    updateFields.push(`updated_at = CURRENT_TIMESTAMP`);
    params.push(moduleId);

    const result = await pool.query(
      `UPDATE gxp_modules 
        SET ${updateFields.join(', ')}
        WHERE id = $${paramIndex}
        RETURNING *`,
      params
    );

    return createSuccessResponse({ module: result.rows[0] }, 200);
  } catch (error) {
    console.error('Error updating module:', error);
    throw error;
  }
}

// Delete a module (cascade will delete lessons via DB constraint)
async function deleteModule(pool, moduleId, corsHeaders) {
  try {
    // Check if module exists
    const existing = await pool.query('SELECT id FROM gxp_modules WHERE id = $1', [moduleId]);
    if (existing.rows.length === 0) {
      return createErrorResponse(404, 'Module not found', corsHeaders);
    }

    await pool.query('DELETE FROM gxp_modules WHERE id = $1', [moduleId]);

    return createSuccessResponse({ message: 'Module deleted successfully' }, 200);
  } catch (error) {
    console.error('Error deleting module:', error);
    throw error;
  }
}

// Create a new lesson
async function createLesson(pool, moduleId, body, corsHeaders) {
  try {
    const data = parseRequestBody(body, corsHeaders);
    if (!data) {
      return getJsonParseErrorResponse(corsHeaders);
    }

    // Verify module exists
    const moduleCheck = await pool.query('SELECT id FROM gxp_modules WHERE id = $1', [moduleId]);
    if (moduleCheck.rows.length === 0) {
      return createErrorResponse(404, 'Module not found', corsHeaders);
    }

    const { title, description, content_type, estimated_minutes, cfr_regulation_id, document_id, workflow_template_id } = data;

    if (!title) {
      return createErrorResponse(400, 'Title is required', corsHeaders);
    }

    // Calculate next lesson_order
    const orderResult = await pool.query(
      `SELECT COALESCE(MAX(lesson_order), 0) + 1 as next_order 
       FROM gxp_lessons 
       WHERE module_id = $1`,
      [moduleId]
    );
    const lessonOrder = orderResult.rows[0].next_order;

    const result = await pool.query(
      `INSERT INTO gxp_lessons 
        (module_id, lesson_order, title, description, content_type, estimated_minutes, cfr_regulation_id, document_id, workflow_template_id)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        RETURNING *`,
      [
        moduleId, 
        lessonOrder, 
        title, 
        description || null, 
        content_type || 'text',
        estimated_minutes || null,
        cfr_regulation_id || null,
        document_id || null,
        workflow_template_id || null
      ]
    );

    return createSuccessResponse({ lesson: result.rows[0] }, 201);
  } catch (error) {
    console.error('Error creating lesson:', error);
    throw error;
  }
}

// Delete a lesson
async function deleteLesson(pool, lessonId, corsHeaders) {
  try {
    // Check if lesson exists
    const existing = await pool.query('SELECT id FROM gxp_lessons WHERE id = $1', [lessonId]);
    if (existing.rows.length === 0) {
      return createErrorResponse(404, 'Lesson not found', corsHeaders);
    }

    await pool.query('DELETE FROM gxp_lessons WHERE id = $1', [lessonId]);

    return createSuccessResponse({ message: 'Lesson deleted successfully' }, 200);
  } catch (error) {
    console.error('Error deleting lesson:', error);
    throw error;
  }
}

