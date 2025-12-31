import { getPool, initDatabase } from "./db.js";
import { getCorsHeaders, handleOptionsRequest, extractAuthToken, parseRequestBody, getJsonParseErrorResponse, createErrorResponse, createSuccessResponse } from "./shared-utils.js";
import { verifyAuthToken, verifyAdminRole } from "./security-utils.js";

export const handler = async (event) => {
  // Handle CORS preflight
  if (event.httpMethod === 'OPTIONS') {
    const corsHeaders = getCorsHeaders(['GET', 'POST', 'PUT', 'OPTIONS'], event);
    return handleOptionsRequest(corsHeaders);
  }

  const corsHeaders = getCorsHeaders(['GET', 'POST', 'PUT', 'OPTIONS'], event);

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
    const targetUserId = pathParts[pathParts.length - 1] || userId;

    // Users can only view their own progress unless they're admin
    if (targetUserId !== userId && !isAdmin) {
      return createErrorResponse(403, 'Access denied', corsHeaders);
    }

    if (event.httpMethod === 'GET') {
      // GET /api/student-progress/:userId - Get student progress dashboard
      return await getStudentProgress(pool, targetUserId, event.queryStringParameters || {}, corsHeaders);
    } else if (event.httpMethod === 'POST') {
      // POST /api/student-progress - Update lesson progress
      return await updateLessonProgress(pool, userId, event.body, corsHeaders);
    } else if (event.httpMethod === 'PUT') {
      // PUT /api/student-progress/:lessonId - Update specific lesson progress
      const lessonId = pathParts[pathParts.length - 1] && !isNaN(pathParts[pathParts.length - 1]) 
        ? parseInt(pathParts[pathParts.length - 1]) 
        : null;
      if (!lessonId) {
        return createErrorResponse(400, 'Lesson ID is required', corsHeaders);
      }
      return await updateLessonProgress(pool, userId, event.body, corsHeaders, lessonId);
    } else {
      return createErrorResponse(405, 'Method not allowed', corsHeaders);
    }
  } catch (error) {
    console.error('Error in student-progress:', error);
    return createErrorResponse(500, error.message || 'Internal server error', corsHeaders);
  }
};

// Get student progress dashboard
async function getStudentProgress(pool, userId, queryParams, corsHeaders) {
  try {
    const { course_id, status, limit = 50, offset = 0 } = queryParams;

    // Get overall progress statistics
    let statsQuery = `
      SELECT 
        COUNT(DISTINCT l.id) as total_lessons,
        COUNT(DISTINCT CASE WHEN sp.status = 'completed' THEN l.id END) as completed_lessons,
        COUNT(DISTINCT CASE WHEN sp.status = 'in_progress' THEN l.id END) as in_progress_lessons,
        COUNT(DISTINCT c.id) as total_courses,
        COUNT(DISTINCT CASE WHEN course_completion.completed = true THEN c.id END) as completed_courses,
        COALESCE(SUM(sp.time_spent_minutes), 0) as total_time_minutes
      FROM gxp_lessons l
      INNER JOIN gxp_modules m ON l.module_id = m.id
      INNER JOIN gxp_courses c ON m.course_id = c.id
      LEFT JOIN gxp_student_progress sp ON l.id = sp.lesson_id AND sp.user_id = $1
      LEFT JOIN (
        SELECT 
          c.id as course_id,
          COUNT(DISTINCT l.id) as total_lessons,
          COUNT(DISTINCT CASE WHEN sp.status = 'completed' THEN l.id END) as completed_lessons,
          CASE 
            WHEN COUNT(DISTINCT l.id) > 0 AND COUNT(DISTINCT CASE WHEN sp.status = 'completed' THEN l.id END) = COUNT(DISTINCT l.id) 
            THEN true 
            ELSE false 
          END as completed
        FROM gxp_courses c
        INNER JOIN gxp_modules m ON c.id = m.course_id
        INNER JOIN gxp_lessons l ON m.id = l.module_id
        LEFT JOIN gxp_student_progress sp ON l.id = sp.lesson_id AND sp.user_id = $1
        GROUP BY c.id
      ) course_completion ON c.id = course_completion.course_id
      WHERE c.is_published = true
    `;

    const statsParams = [userId];
    if (course_id) {
      statsQuery += ` AND c.id = $${statsParams.length + 1}`;
      statsParams.push(course_id);
    }

    const statsResult = await pool.query(statsQuery, statsParams);
    const stats = statsResult.rows[0] || {
      total_lessons: 0,
      completed_lessons: 0,
      in_progress_lessons: 0,
      total_courses: 0,
      completed_courses: 0,
      total_time_minutes: 0
    };

    // Get detailed lesson progress
    let progressQuery = `
      SELECT 
        sp.id,
        sp.lesson_id,
        sp.status,
        sp.progress_percentage,
        sp.time_spent_minutes,
        sp.completed_at,
        sp.last_accessed_at,
        sp.notes,
        l.title as lesson_title,
        l.description as lesson_description,
        l.estimated_minutes,
        l.content_type,
        m.id as module_id,
        m.title as module_title,
        m.module_order,
        c.id as course_id,
        c.title as course_title,
        c.category as course_category
      FROM gxp_student_progress sp
      INNER JOIN gxp_lessons l ON sp.lesson_id = l.id
      INNER JOIN gxp_modules m ON l.module_id = m.id
      INNER JOIN gxp_courses c ON m.course_id = c.id
      WHERE sp.user_id = $1 AND c.is_published = true
    `;

    const progressParams = [userId];
    let paramIndex = 2;

    if (course_id) {
      progressQuery += ` AND c.id = $${paramIndex++}`;
      progressParams.push(course_id);
    }

    if (status) {
      progressQuery += ` AND sp.status = $${paramIndex++}`;
      progressParams.push(status);
    }

    progressQuery += ` ORDER BY sp.last_accessed_at DESC LIMIT $${paramIndex++} OFFSET $${paramIndex++}`;
    progressParams.push(parseInt(limit), parseInt(offset));

    const progressResult = await pool.query(progressQuery, progressParams);

    // Get course progress summary
    let courseProgressQuery = `
      SELECT 
        c.id,
        c.title,
        c.category,
        c.estimated_hours,
        COUNT(DISTINCT l.id) as total_lessons,
        COUNT(DISTINCT CASE WHEN sp.status = 'completed' THEN l.id END) as completed_lessons,
        ROUND(
          CASE 
            WHEN COUNT(DISTINCT l.id) > 0 
            THEN (COUNT(DISTINCT CASE WHEN sp.status = 'completed' THEN l.id END)::decimal / COUNT(DISTINCT l.id)::decimal) * 100
            ELSE 0 
          END, 
          2
        ) as completion_percentage,
        COALESCE(SUM(sp.time_spent_minutes), 0) as time_spent_minutes
      FROM gxp_courses c
      INNER JOIN gxp_modules m ON c.id = m.course_id
      INNER JOIN gxp_lessons l ON m.id = l.module_id
      LEFT JOIN gxp_student_progress sp ON l.id = sp.lesson_id AND sp.user_id = $1
      WHERE c.is_published = true
    `;

    const courseProgressParams = [userId];
    if (course_id) {
      courseProgressQuery += ` AND c.id = $2`;
      courseProgressParams.push(course_id);
    }
    
    courseProgressQuery += ` GROUP BY c.id, c.title, c.category, c.estimated_hours ORDER BY c.title`;

    const courseProgressResult = await pool.query(courseProgressQuery, courseProgressParams);

    // Get certificates
    const certificatesResult = await pool.query(
      `SELECT 
        cert.id,
        cert.certificate_number,
        cert.course_id,
        cert.issued_at,
        cert.expires_at,
        cert.is_verified,
        c.title as course_title
      FROM gxp_certificates cert
      INNER JOIN gxp_courses c ON cert.course_id = c.id
      WHERE cert.user_id = $1
      ORDER BY cert.issued_at DESC`,
      [userId]
    );

    // Get badges
    const badgesResult = await pool.query(
      `SELECT 
        sb.id,
        sb.badge_id,
        sb.earned_at,
        sb.context_json,
        b.badge_name,
        b.description,
        b.icon_url,
        b.category
      FROM gxp_student_badges sb
      INNER JOIN gxp_badges b ON sb.badge_id = b.id
      WHERE sb.user_id = $1
      ORDER BY sb.earned_at DESC`,
      [userId]
    );

    return createSuccessResponse({
      statistics: {
        total_lessons: parseInt(stats.total_lessons) || 0,
        completed_lessons: parseInt(stats.completed_lessons) || 0,
        in_progress_lessons: parseInt(stats.in_progress_lessons) || 0,
        total_courses: parseInt(stats.total_courses) || 0,
        completed_courses: parseInt(stats.completed_courses) || 0,
        total_time_minutes: parseInt(stats.total_time_minutes) || 0,
        overall_completion_percentage: stats.total_lessons > 0 
          ? Math.round((parseInt(stats.completed_lessons) / parseInt(stats.total_lessons)) * 100) 
          : 0
      },
      lesson_progress: progressResult.rows,
      course_progress: courseProgressResult.rows,
      certificates: certificatesResult.rows,
      badges: badgesResult.rows
    }, 200);
  } catch (error) {
    console.error('Error getting student progress:', error);
    throw error;
  }
}

// Update lesson progress
async function updateLessonProgress(pool, userId, body, corsHeaders, lessonId = null) {
  try {
    const data = parseRequestBody(body, corsHeaders);
    if (!data) {
      return getJsonParseErrorResponse(corsHeaders);
    }

    const targetLessonId = lessonId || data.lesson_id;
    if (!targetLessonId) {
      return createErrorResponse(400, 'Lesson ID is required', corsHeaders);
    }

    const { status, progress_percentage, time_spent_minutes, notes } = data;

    // Check if lesson exists
    const lessonCheck = await pool.query('SELECT id FROM gxp_lessons WHERE id = $1', [targetLessonId]);
    if (lessonCheck.rows.length === 0) {
      return createErrorResponse(404, 'Lesson not found', corsHeaders);
    }

    // Check if progress record exists
    const existing = await pool.query(
      'SELECT id FROM gxp_student_progress WHERE user_id = $1 AND lesson_id = $2',
      [userId, targetLessonId]
    );

    let result;
    if (existing.rows.length > 0) {
      // Update existing progress
      const updateFields = [];
      const params = [];
      let paramIndex = 1;

      if (status !== undefined) {
        updateFields.push(`status = $${paramIndex++}`);
        params.push(status);
        
        // Set completed_at if status is 'completed'
        if (status === 'completed') {
          updateFields.push(`completed_at = CURRENT_TIMESTAMP`);
        } else if (status !== 'completed') {
          updateFields.push(`completed_at = NULL`);
        }
      }
      if (progress_percentage !== undefined) {
        updateFields.push(`progress_percentage = $${paramIndex++}`);
        params.push(Math.max(0, Math.min(100, parseFloat(progress_percentage) || 0)));
      }
      if (time_spent_minutes !== undefined) {
        updateFields.push(`time_spent_minutes = $${paramIndex++}`);
        params.push(Math.max(0, parseFloat(time_spent_minutes) || 0));
      }
      if (notes !== undefined) {
        updateFields.push(`notes = $${paramIndex++}`);
        params.push(notes);
      }

      updateFields.push(`last_accessed_at = CURRENT_TIMESTAMP`);
      updateFields.push(`updated_at = CURRENT_TIMESTAMP`);
      params.push(userId, targetLessonId);

      result = await pool.query(
        `UPDATE gxp_student_progress 
          SET ${updateFields.join(', ')}
          WHERE user_id = $${paramIndex - 1} AND lesson_id = $${paramIndex}
          RETURNING *`,
        params
      );
    } else {
      // Create new progress record
      const completedAt = status === 'completed' ? 'CURRENT_TIMESTAMP' : 'NULL';
      result = await pool.query(
        `INSERT INTO gxp_student_progress 
          (user_id, lesson_id, status, progress_percentage, time_spent_minutes, notes, completed_at, last_accessed_at)
          VALUES ($1, $2, $3, $4, $5, $6, ${completedAt}, CURRENT_TIMESTAMP)
          RETURNING *`,
        [
          userId,
          targetLessonId,
          status || 'in_progress',
          Math.max(0, Math.min(100, parseFloat(progress_percentage) || 0)),
          Math.max(0, parseFloat(time_spent_minutes) || 0),
          notes || null
        ]
      );
    }

    return createSuccessResponse({ progress: result.rows[0] }, 200);
  } catch (error) {
    console.error('Error updating lesson progress:', error);
    throw error;
  }
}

