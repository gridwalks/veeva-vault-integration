import { getPool, initDatabase } from "./db.js";
import { getCorsHeaders, handleOptionsRequest, createErrorResponse, createSuccessResponse } from "./shared-utils.js";
import { verifyAuthToken } from "./security-utils.js";
import OpenAI from "openai";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export const handler = async (event) => {
  // Handle CORS preflight
  if (event.httpMethod === 'OPTIONS') {
    const corsHeaders = getCorsHeaders(['GET', 'POST', 'OPTIONS'], event);
    return handleOptionsRequest(corsHeaders);
  }

  const corsHeaders = getCorsHeaders(['GET', 'POST', 'OPTIONS'], event);

  try {
    // Verify authentication
    const authResult = verifyAuthToken(event);
    if (!authResult.valid) {
      return createErrorResponse(401, 'Authentication required', corsHeaders);
    }

    const userId = authResult.claims?.sub || null;
    if (!userId) {
      return createErrorResponse(400, 'User ID is required', corsHeaders);
    }

    // Initialize database
    await initDatabase();
    const pool = getPool();

    if (event.httpMethod === 'GET') {
      const queryParams = event.queryStringParameters || {};
      return await getLearningRecommendations(pool, userId, queryParams, corsHeaders);
    } else if (event.httpMethod === 'POST') {
      return await analyzePerformance(pool, userId, event.body, corsHeaders);
    } else {
      return createErrorResponse(405, 'Method not allowed', corsHeaders);
    }
  } catch (error) {
    console.error('Error in adaptive-learning:', error);
    return createErrorResponse(500, error.message || 'Internal server error', corsHeaders);
  }
};

// Get personalized learning recommendations
async function getLearningRecommendations(pool, userId, queryParams, corsHeaders) {
  try {
    const { course_id, limit = 5 } = queryParams;

    // Get student's overall progress
    const progressQuery = `
      SELECT 
        sp.lesson_id,
        sp.status,
        sp.progress_percentage,
        sp.score,
        l.title as lesson_title,
        l.description as lesson_description,
        l.content_type,
        m.id as module_id,
        m.title as module_title,
        c.id as course_id,
        c.title as course_title,
        c.difficulty as course_difficulty
      FROM gxp_student_progress sp
      INNER JOIN gxp_lessons l ON sp.lesson_id = l.id
      INNER JOIN gxp_modules m ON l.module_id = m.id
      INNER JOIN gxp_courses c ON m.course_id = c.id
      WHERE sp.user_id = $1
      ${course_id ? 'AND c.id = $2' : ''}
      ORDER BY sp.last_accessed_at DESC
      LIMIT 50
    `;

    const progressParams = course_id ? [userId, parseInt(course_id)] : [userId];
    const progressResult = await pool.query(progressQuery, progressParams);
    const progressData = progressResult.rows;

    // Get assessment scores
    const assessmentQuery = `
      SELECT 
        a.lesson_id,
        assess.score,
        assess.submitted_at,
        l.title as lesson_title,
        c.id as course_id
      FROM gxp_assessment_submissions assess
      INNER JOIN gxp_assessments a ON assess.assessment_id = a.id
      INNER JOIN gxp_lessons l ON a.lesson_id = l.id
      INNER JOIN gxp_modules m ON l.module_id = m.id
      INNER JOIN gxp_courses c ON m.course_id = c.id
      WHERE assess.user_id = $1
      ${course_id ? 'AND c.id = $2' : ''}
      ORDER BY assess.submitted_at DESC
      LIMIT 20
    `;

    const assessmentResult = await pool.query(assessmentQuery, progressParams);
    const assessmentData = assessmentResult.rows;

    // Analyze performance gaps
    const gaps = analyzePerformanceGaps(progressData, assessmentData);

    // Get available courses/lessons for recommendations
    const availableQuery = `
      SELECT 
        l.id as lesson_id,
        l.title as lesson_title,
        l.description,
        l.content_type,
        l.estimated_minutes,
        m.id as module_id,
        m.title as module_title,
        c.id as course_id,
        c.title as course_title,
        c.difficulty,
        c.category,
        CASE 
          WHEN sp.id IS NULL THEN 'not_started'
          ELSE sp.status
        END as student_status
      FROM gxp_lessons l
      INNER JOIN gxp_modules m ON l.module_id = m.id
      INNER JOIN gxp_courses c ON m.course_id = c.id
      LEFT JOIN gxp_student_progress sp ON l.id = sp.lesson_id AND sp.user_id = $1
      WHERE c.is_published = true
      ${course_id ? 'AND c.id = $2' : ''}
      ORDER BY c.title, m.module_order, l.lesson_order
    `;

    const availableResult = await pool.query(availableQuery, progressParams);
    const availableLessons = availableResult.rows;

    // Generate AI-powered recommendations
    const recommendations = await generateRecommendations(
      progressData,
      assessmentData,
      gaps,
      availableLessons,
      parseInt(limit)
    );

    return createSuccessResponse({
      recommendations: recommendations.recommended_lessons || [],
      performance_analysis: {
        strengths: recommendations.strengths || [],
        weaknesses: recommendations.weaknesses || [],
        suggested_focus_areas: recommendations.focus_areas || []
      },
      gaps: gaps
    }, 200);
  } catch (error) {
    console.error('Error getting learning recommendations:', error);
    throw error;
  }
}

// Analyze student performance
async function analyzePerformance(pool, userId, body, corsHeaders) {
  try {
    const data = JSON.parse(body || '{}');
    const { course_id, lesson_id } = data;

    // Get comprehensive performance data
    const performanceData = await getPerformanceData(pool, userId, course_id, lesson_id);
    
    // Use AI to analyze and provide insights
    const analysis = await generatePerformanceAnalysis(performanceData);

    return createSuccessResponse({
      analysis: analysis.insights || [],
      recommendations: analysis.recommendations || [],
      next_steps: analysis.next_steps || []
    }, 200);
  } catch (error) {
    console.error('Error analyzing performance:', error);
    throw error;
  }
}

// Analyze performance gaps
function analyzePerformanceGaps(progressData, assessmentData) {
  const gaps = {
    incomplete_lessons: [],
    low_scores: [],
    not_started: []
  };

  // Find incomplete lessons
  progressData.forEach(progress => {
    if (progress.status !== 'completed' && progress.progress_percentage < 100) {
      gaps.incomplete_lessons.push({
        lesson_id: progress.lesson_id,
        lesson_title: progress.lesson_title,
        progress: progress.progress_percentage,
        course_id: progress.course_id,
        course_title: progress.course_title
      });
    }
  });

  // Find low assessment scores
  assessmentData.forEach(assessment => {
    if (assessment.score < 70) {
      gaps.low_scores.push({
        lesson_id: assessment.lesson_id,
        lesson_title: assessment.lesson_title,
        score: assessment.score,
        course_id: assessment.course_id
      });
    }
  });

  return gaps;
}

// Get comprehensive performance data
async function getPerformanceData(pool, userId, courseId, lessonId) {
  let query = `
    SELECT 
      c.id as course_id,
      c.title as course_title,
      l.id as lesson_id,
      l.title as lesson_title,
      sp.status,
      sp.progress_percentage,
      sp.score,
      sp.time_spent_minutes,
      assess.score as assessment_score,
      assess.submitted_at as assessment_date
    FROM gxp_courses c
    INNER JOIN gxp_modules m ON c.id = m.course_id
    INNER JOIN gxp_lessons l ON m.id = l.module_id
    LEFT JOIN gxp_student_progress sp ON l.id = sp.lesson_id AND sp.user_id = $1
    LEFT JOIN gxp_assessments a ON l.id = a.lesson_id
    LEFT JOIN gxp_assessment_submissions assess ON a.id = assess.assessment_id AND assess.user_id = $1
    WHERE c.is_published = true
  `;

  const params = [userId];
  if (courseId) {
    query += ` AND c.id = $2`;
    params.push(parseInt(courseId));
  }
  if (lessonId) {
    query += ` AND l.id = $${params.length + 1}`;
    params.push(parseInt(lessonId));
  }

  query += ` ORDER BY c.title, l.lesson_id`;

  const result = await pool.query(query, params);
  return result.rows;
}

// Generate AI-powered recommendations
async function generateRecommendations(progressData, assessmentData, gaps, availableLessons, limit) {
  try {
    // Build context for AI
    const context = {
      completed_lessons: progressData.filter(p => p.status === 'completed').length,
      in_progress_lessons: progressData.filter(p => p.status === 'in_progress').length,
      average_score: assessmentData.length > 0 
        ? assessmentData.reduce((sum, a) => sum + (a.score || 0), 0) / assessmentData.length 
        : null,
      gaps: {
        incomplete_count: gaps.incomplete_lessons.length,
        low_score_count: gaps.low_scores.length
      },
      available_lessons_count: availableLessons.length
    };

    const prompt = `Analyze this student's learning progress and recommend the next ${limit} lessons they should focus on.

Student Progress Summary:
- Completed lessons: ${context.completed_lessons}
- In progress: ${context.in_progress_lessons}
- Average assessment score: ${context.average_score ? context.average_score.toFixed(1) + '%' : 'N/A'}
- Incomplete lessons: ${context.gaps.incomplete_count}
- Lessons with low scores: ${context.gaps.low_score_count}

Available Lessons:
${availableLessons.slice(0, 20).map(l => `- ${l.lesson_title} (${l.course_title}, ${l.difficulty}, ${l.student_status})`).join('\n')}

Generate recommendations in JSON format:
{
  "recommended_lessons": [
    {
      "lesson_id": number,
      "reason": "why this lesson is recommended",
      "priority": "high|medium|low"
    }
  ],
  "strengths": ["list of topics student is strong in"],
  "weaknesses": ["list of topics student needs to improve"],
  "focus_areas": ["suggested focus areas for improvement"]
}`;

    const completion = await openai.chat.completions.create({
      model: process.env.OPENAI_MODEL || 'gpt-4',
      messages: [
        { role: 'system', content: 'You are an adaptive learning system. Analyze student performance and provide personalized recommendations in valid JSON format only.' },
        { role: 'user', content: prompt }
      ],
      temperature: 0.7,
      max_tokens: 1500,
      response_format: { type: "json_object" }
    });

    const response = JSON.parse(completion.choices[0]?.message?.content || '{}');
    
    // Enrich recommendations with lesson details
    if (response.recommended_lessons) {
      response.recommended_lessons = response.recommended_lessons.map(rec => {
        const lesson = availableLessons.find(l => l.lesson_id === rec.lesson_id);
        return {
          ...rec,
          lesson_title: lesson?.lesson_title,
          course_title: lesson?.course_title,
          module_title: lesson?.module_title,
          difficulty: lesson?.difficulty,
          estimated_minutes: lesson?.estimated_minutes,
          content_type: lesson?.content_type
        };
      }).filter(rec => rec.lesson_title); // Only include lessons that exist
    }

    return response;
  } catch (error) {
    console.error('Error generating AI recommendations:', error);
    // Fallback to rule-based recommendations
    return generateRuleBasedRecommendations(progressData, assessmentData, gaps, availableLessons, limit);
  }
}

// Fallback rule-based recommendations
function generateRuleBasedRecommendations(progressData, assessmentData, gaps, availableLessons, limit) {
  const recommendations = [];
  
  // Prioritize incomplete lessons
  gaps.incomplete_lessons.slice(0, Math.ceil(limit / 2)).forEach(gap => {
    const lesson = availableLessons.find(l => l.lesson_id === gap.lesson_id);
    if (lesson) {
      recommendations.push({
        lesson_id: gap.lesson_id,
        lesson_title: lesson.lesson_title,
        course_title: lesson.course_title,
        reason: `Continue this incomplete lesson (${gap.progress}% complete)`,
        priority: 'high'
      });
    }
  });

  // Add lessons related to low-scoring assessments
  gaps.low_scores.slice(0, Math.ceil(limit / 4)).forEach(gap => {
    const lesson = availableLessons.find(l => l.lesson_id === gap.lesson_id);
    if (lesson && !recommendations.find(r => r.lesson_id === gap.lesson_id)) {
      recommendations.push({
        lesson_id: gap.lesson_id,
        lesson_title: lesson.lesson_title,
        course_title: lesson.course_title,
        reason: `Review this lesson (scored ${gap.score}% on assessment)`,
        priority: 'high'
      });
    }
  });

  // Fill remaining with next available lessons
  const completedLessonIds = new Set(progressData.filter(p => p.status === 'completed').map(p => p.lesson_id));
  const recommendedIds = new Set(recommendations.map(r => r.lesson_id));
  
  for (const lesson of availableLessons) {
    if (recommendations.length >= limit) break;
    if (!completedLessonIds.has(lesson.lesson_id) && !recommendedIds.has(lesson.lesson_id)) {
      recommendations.push({
        lesson_id: lesson.lesson_id,
        lesson_title: lesson.lesson_title,
        course_title: lesson.course_title,
        reason: 'Next recommended lesson in your learning path',
        priority: 'medium'
      });
    }
  }

  return {
    recommended_lessons: recommendations.slice(0, limit),
    strengths: [],
    weaknesses: gaps.low_scores.map(g => g.lesson_title),
    focus_areas: ['Complete in-progress lessons', 'Review low-scoring topics']
  };
}

// Generate performance analysis using AI
async function generatePerformanceAnalysis(performanceData) {
  try {
    const summary = {
      total_lessons: performanceData.length,
      completed: performanceData.filter(p => p.status === 'completed').length,
      in_progress: performanceData.filter(p => p.status === 'in_progress').length,
      average_score: performanceData.filter(p => p.assessment_score).length > 0
        ? performanceData.filter(p => p.assessment_score)
            .reduce((sum, p) => sum + p.assessment_score, 0) / performanceData.filter(p => p.assessment_score).length
        : null
    };

    const prompt = `Analyze this student's performance data and provide insights:

Performance Summary:
- Total lessons: ${summary.total_lessons}
- Completed: ${summary.completed}
- In progress: ${summary.in_progress}
- Average assessment score: ${summary.average_score ? summary.average_score.toFixed(1) + '%' : 'N/A'}

Provide analysis in JSON format:
{
  "insights": ["key insights about student performance"],
  "recommendations": ["specific recommendations for improvement"],
  "next_steps": ["actionable next steps"]
}`;

    const completion = await openai.chat.completions.create({
      model: process.env.OPENAI_MODEL || 'gpt-4',
      messages: [
        { role: 'system', content: 'You are an educational analytics system. Provide performance analysis in valid JSON format only.' },
        { role: 'user', content: prompt }
      ],
      temperature: 0.7,
      max_tokens: 1000,
      response_format: { type: "json_object" }
    });

    return JSON.parse(completion.choices[0]?.message?.content || '{}');
  } catch (error) {
    console.error('Error generating performance analysis:', error);
    return {
      insights: ['Performance data analyzed'],
      recommendations: ['Continue with current learning path'],
      next_steps: ['Complete in-progress lessons']
    };
  }
}

