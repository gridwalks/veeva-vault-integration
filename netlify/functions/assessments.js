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
    const assessmentId = pathParts[pathParts.length - 1] && !isNaN(pathParts[pathParts.length - 1]) 
      ? parseInt(pathParts[pathParts.length - 1]) 
      : null;

    // Check if this is a submit endpoint
    if (pathParts[pathParts.length - 1] === 'submit' && event.httpMethod === 'POST') {
      return await submitAssessment(pool, userId, event.body, corsHeaders);
    }

    if (event.httpMethod === 'GET') {
      if (assessmentId) {
        // GET /api/assessments/:id - Get assessment details
        return await getAssessmentDetails(pool, assessmentId, userId, corsHeaders);
      } else {
        // GET /api/assessments - List assessments
        const queryParams = event.queryStringParameters || {};
        return await listAssessments(pool, queryParams, corsHeaders);
      }
    } else if (event.httpMethod === 'POST') {
      // POST /api/assessments - Create assessment (admin only)
      if (!isAdmin) {
        return createErrorResponse(403, 'Admin access required', corsHeaders);
      }
      return await createAssessment(pool, event.body, corsHeaders);
    } else if (event.httpMethod === 'PUT') {
      // PUT /api/assessments/:id - Update assessment (admin only)
      if (!isAdmin) {
        return createErrorResponse(403, 'Admin access required', corsHeaders);
      }
      if (!assessmentId) {
        return createErrorResponse(400, 'Assessment ID is required', corsHeaders);
      }
      return await updateAssessment(pool, assessmentId, event.body, corsHeaders);
    } else if (event.httpMethod === 'DELETE') {
      // DELETE /api/assessments/:id - Delete assessment (admin only)
      if (!isAdmin) {
        return createErrorResponse(403, 'Admin access required', corsHeaders);
      }
      if (!assessmentId) {
        return createErrorResponse(400, 'Assessment ID is required', corsHeaders);
      }
      return await deleteAssessment(pool, assessmentId, corsHeaders);
    } else {
      return createErrorResponse(405, 'Method not allowed', corsHeaders);
    }
  } catch (error) {
    console.error('Error in assessments:', error);
    return createErrorResponse(500, error.message || 'Internal server error', corsHeaders);
  }
};

// List assessments
async function listAssessments(pool, queryParams, corsHeaders) {
  try {
    const { lesson_id, search } = queryParams;
    
    let query = `SELECT * FROM gxp_assessments WHERE 1=1`;
    const params = [];
    let paramIndex = 1;

    if (lesson_id) {
      query += ` AND lesson_id = $${paramIndex++}`;
      params.push(parseInt(lesson_id));
    }

    if (search) {
      query += ` AND (title ILIKE $${paramIndex} OR description ILIKE $${paramIndex})`;
      params.push(`%${search}%`);
      paramIndex++;
    }

    query += ` ORDER BY created_at DESC`;

    const result = await pool.query(query, params);
    
    return createSuccessResponse({
      assessments: result.rows,
      total: result.rows.length
    }, 200);
  } catch (error) {
    console.error('Error listing assessments:', error);
    throw error;
  }
}

// Get assessment details
async function getAssessmentDetails(pool, assessmentId, userId, corsHeaders) {
  try {
    const result = await pool.query(
      `SELECT * FROM gxp_assessments WHERE id = $1`,
      [assessmentId]
    );

    if (result.rows.length === 0) {
      return createErrorResponse(404, 'Assessment not found', corsHeaders);
    }

    const assessment = result.rows[0];

    // Get user's submission history
    const submissionsResult = await pool.query(
      `SELECT 
        id,
        attempt_number,
        score,
        passed,
        time_taken_minutes,
        submitted_at
      FROM gxp_assessment_submissions
      WHERE user_id = $1 AND assessment_id = $2
      ORDER BY attempt_number DESC`,
      [userId, assessmentId]
    );

    assessment.submissions = submissionsResult.rows;
    assessment.can_retake = assessment.submissions.length < assessment.max_attempts;

    return createSuccessResponse({ assessment }, 200);
  } catch (error) {
    console.error('Error getting assessment details:', error);
    throw error;
  }
}

// Create assessment
async function createAssessment(pool, body, corsHeaders) {
  try {
    const data = parseRequestBody(body, corsHeaders);
    if (!data) {
      return getJsonParseErrorResponse(corsHeaders);
    }

    const { lesson_id, title, description, questions_json, passing_score, time_limit_minutes, max_attempts, shuffle_questions, show_correct_answers } = data;

    if (!title) {
      return createErrorResponse(400, 'Title is required', corsHeaders);
    }

    if (!questions_json || !Array.isArray(questions_json) || questions_json.length === 0) {
      return createErrorResponse(400, 'Questions array is required and must not be empty', corsHeaders);
    }

    // Validate questions structure
    for (const question of questions_json) {
      if (!question.question || !question.type) {
        return createErrorResponse(400, 'Each question must have "question" and "type" fields', corsHeaders);
      }
    }

    const result = await pool.query(
      `INSERT INTO gxp_assessments 
        (lesson_id, title, description, questions_json, passing_score, time_limit_minutes, max_attempts, shuffle_questions, show_correct_answers)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        RETURNING *`,
      [
        lesson_id || null,
        title,
        description || null,
        JSON.stringify(questions_json),
        passing_score || 70.00,
        time_limit_minutes || null,
        max_attempts || 3,
        shuffle_questions || false,
        show_correct_answers !== undefined ? show_correct_answers : true
      ]
    );

    return createSuccessResponse({ assessment: result.rows[0] }, 201);
  } catch (error) {
    console.error('Error creating assessment:', error);
    throw error;
  }
}

// Update assessment
async function updateAssessment(pool, assessmentId, body, corsHeaders) {
  try {
    const data = parseRequestBody(body, corsHeaders);
    if (!data) {
      return getJsonParseErrorResponse(corsHeaders);
    }

    // Check if assessment exists
    const existing = await pool.query('SELECT id FROM gxp_assessments WHERE id = $1', [assessmentId]);
    if (existing.rows.length === 0) {
      return createErrorResponse(404, 'Assessment not found', corsHeaders);
    }

    const { lesson_id, title, description, questions_json, passing_score, time_limit_minutes, max_attempts, shuffle_questions, show_correct_answers } = data;

    // Validate questions if provided
    if (questions_json !== undefined) {
      if (!Array.isArray(questions_json) || questions_json.length === 0) {
        return createErrorResponse(400, 'Questions must be a non-empty array', corsHeaders);
      }

      for (const question of questions_json) {
        if (!question.question || !question.type) {
          return createErrorResponse(400, 'Each question must have "question" and "type" fields', corsHeaders);
        }
      }
    }

    const updateFields = [];
    const params = [];
    let paramIndex = 1;

    if (lesson_id !== undefined) {
      updateFields.push(`lesson_id = $${paramIndex++}`);
      params.push(lesson_id);
    }
    if (title !== undefined) {
      updateFields.push(`title = $${paramIndex++}`);
      params.push(title);
    }
    if (description !== undefined) {
      updateFields.push(`description = $${paramIndex++}`);
      params.push(description);
    }
    if (questions_json !== undefined) {
      updateFields.push(`questions_json = $${paramIndex++}`);
      params.push(JSON.stringify(questions_json));
    }
    if (passing_score !== undefined) {
      updateFields.push(`passing_score = $${paramIndex++}`);
      params.push(passing_score);
    }
    if (time_limit_minutes !== undefined) {
      updateFields.push(`time_limit_minutes = $${paramIndex++}`);
      params.push(time_limit_minutes);
    }
    if (max_attempts !== undefined) {
      updateFields.push(`max_attempts = $${paramIndex++}`);
      params.push(max_attempts);
    }
    if (shuffle_questions !== undefined) {
      updateFields.push(`shuffle_questions = $${paramIndex++}`);
      params.push(shuffle_questions);
    }
    if (show_correct_answers !== undefined) {
      updateFields.push(`show_correct_answers = $${paramIndex++}`);
      params.push(show_correct_answers);
    }

    if (updateFields.length === 0) {
      return createErrorResponse(400, 'No fields to update', corsHeaders);
    }

    updateFields.push(`updated_at = CURRENT_TIMESTAMP`);
    params.push(assessmentId);

    const result = await pool.query(
      `UPDATE gxp_assessments 
        SET ${updateFields.join(', ')}
        WHERE id = $${paramIndex}
        RETURNING *`,
      params
    );

    return createSuccessResponse({ assessment: result.rows[0] }, 200);
  } catch (error) {
    console.error('Error updating assessment:', error);
    throw error;
  }
}

// Delete assessment
async function deleteAssessment(pool, assessmentId, corsHeaders) {
  try {
    // Check if assessment exists
    const existing = await pool.query('SELECT id FROM gxp_assessments WHERE id = $1', [assessmentId]);
    if (existing.rows.length === 0) {
      return createErrorResponse(404, 'Assessment not found', corsHeaders);
    }

    await pool.query('DELETE FROM gxp_assessments WHERE id = $1', [assessmentId]);

    return createSuccessResponse({ message: 'Assessment deleted successfully' }, 200);
  } catch (error) {
    console.error('Error deleting assessment:', error);
    throw error;
  }
}

// Submit assessment answers and calculate score
async function submitAssessment(pool, userId, body, corsHeaders) {
  try {
    const data = parseRequestBody(body, corsHeaders);
    if (!data) {
      return getJsonParseErrorResponse(corsHeaders);
    }

    const { assessment_id, answers_json, time_taken_minutes } = data;

    if (!assessment_id) {
      return createErrorResponse(400, 'Assessment ID is required', corsHeaders);
    }

    if (!answers_json || !Array.isArray(answers_json)) {
      return createErrorResponse(400, 'Answers array is required', corsHeaders);
    }

    // Get assessment
    const assessmentResult = await pool.query(
      `SELECT * FROM gxp_assessments WHERE id = $1`,
      [assessment_id]
    );

    if (assessmentResult.rows.length === 0) {
      return createErrorResponse(404, 'Assessment not found', corsHeaders);
    }

    const assessment = assessmentResult.rows[0];
    const questions = Array.isArray(assessment.questions_json) 
      ? assessment.questions_json 
      : JSON.parse(assessment.questions_json || '[]');

    // Check attempt limit
    const previousAttempts = await pool.query(
      `SELECT COUNT(*) as count FROM gxp_assessment_submissions 
       WHERE user_id = $1 AND assessment_id = $2`,
      [userId, assessment_id]
    );

    const attemptCount = parseInt(previousAttempts.rows[0].count) || 0;
    if (attemptCount >= assessment.max_attempts) {
      return createErrorResponse(403, `Maximum attempts (${assessment.max_attempts}) reached`, corsHeaders);
    }

    // Grade the assessment
    const gradingResult = gradeAssessment(questions, answers_json);
    const score = gradingResult.score;
    const passed = score >= assessment.passing_score;
    const feedback = assessment.show_correct_answers ? gradingResult.feedback : null;

    // Save submission
    const submissionResult = await pool.query(
      `INSERT INTO gxp_assessment_submissions 
        (user_id, assessment_id, attempt_number, answers_json, score, passed, time_taken_minutes, feedback_json)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        RETURNING *`,
      [
        userId,
        assessment_id,
        attemptCount + 1,
        JSON.stringify(answers_json),
        score,
        passed,
        time_taken_minutes || null,
        feedback ? JSON.stringify(feedback) : null
      ]
    );

    // If passed and this is linked to a lesson, update lesson progress
    if (passed && assessment.lesson_id) {
      await pool.query(
        `INSERT INTO gxp_student_progress 
          (user_id, lesson_id, status, progress_percentage, completed_at, last_accessed_at)
          VALUES ($1, $2, 'completed', 100, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
          ON CONFLICT (user_id, lesson_id) 
          DO UPDATE SET 
            status = 'completed',
            progress_percentage = 100,
            completed_at = CURRENT_TIMESTAMP,
            updated_at = CURRENT_TIMESTAMP`,
        [userId, assessment.lesson_id]
      );
    }

    return createSuccessResponse({
      submission: submissionResult.rows[0],
      score,
      passed,
      feedback: assessment.show_correct_answers ? feedback : null,
      can_retake: (attemptCount + 1) < assessment.max_attempts
    }, 200);
  } catch (error) {
    console.error('Error submitting assessment:', error);
    throw error;
  }
}

// Grade assessment answers
function gradeAssessment(questions, answers) {
  let correctCount = 0;
  const feedback = [];

  for (let i = 0; i < questions.length; i++) {
    const question = questions[i];
    const answer = answers[i];
    let isCorrect = false;
    let explanation = null;

    switch (question.type) {
      case 'multiple_choice':
      case 'single_choice':
        isCorrect = answer === question.correct_answer;
        if (question.explanation) {
          explanation = question.explanation;
        }
        break;

      case 'true_false':
        isCorrect = answer === question.correct_answer;
        if (question.explanation) {
          explanation = question.explanation;
        }
        break;

      case 'multiple_select':
        if (Array.isArray(answer) && Array.isArray(question.correct_answers)) {
          const answerSet = new Set(answer.sort());
          const correctSet = new Set(question.correct_answers.sort());
          isCorrect = answerSet.size === correctSet.size && 
                     [...answerSet].every(a => correctSet.has(a));
        }
        if (question.explanation) {
          explanation = question.explanation;
        }
        break;

      case 'short_answer':
      case 'essay':
        // For text answers, check if there's a keyword match or use AI grading
        // For now, we'll mark as correct if answer is provided (manual grading needed)
        isCorrect = answer && answer.trim().length > 0;
        explanation = 'This answer requires manual review';
        break;

      default:
        isCorrect = false;
    }

    if (isCorrect) {
      correctCount++;
    }

    feedback.push({
      question_index: i,
      question: question.question,
      user_answer: answer,
      correct_answer: question.correct_answer || question.correct_answers,
      is_correct: isCorrect,
      explanation: explanation
    });
  }

  const score = questions.length > 0 ? (correctCount / questions.length) * 100 : 0;

  return {
    score: Math.round(score * 100) / 100, // Round to 2 decimal places
    correct_count: correctCount,
    total_questions: questions.length,
    feedback
  };
}

