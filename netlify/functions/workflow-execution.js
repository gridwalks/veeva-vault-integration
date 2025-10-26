import { getPool, initDatabase } from "./db.js";
import OpenAI from "openai";
import Groq from "groq-sdk";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const groq = new Groq({
  apiKey: process.env.GROQ_API_KEY,
});

// Helper function to handle CORS
function setCorsHeaders() {
  return {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS'
  };
}

// Ensure workflow tables exist
async function ensureWorkflowTables(pool) {
  try {
    // Check if workflow templates table exists
    const tableCheck = await pool.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = 'qms_chat_workflow_templates'
      );
    `);
    
    if (!tableCheck.rows[0].exists) {
      console.log('Workflow tables do not exist, creating them...');
      
      // Create workflow templates table
      await pool.query(`
        CREATE TABLE IF NOT EXISTS qms_chat_workflow_templates (
          id SERIAL PRIMARY KEY,
          name VARCHAR(255) NOT NULL,
          description TEXT,
          category VARCHAR(100) DEFAULT 'Quality',
          is_active BOOLEAN DEFAULT true,
          trigger_keywords TEXT[],
          document_template TEXT,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
      `);

      // Create workflow steps table
      await pool.query(`
        CREATE TABLE IF NOT EXISTS qms_chat_workflow_steps (
          id SERIAL PRIMARY KEY,
          workflow_template_id INTEGER NOT NULL REFERENCES qms_chat_workflow_templates(id) ON DELETE CASCADE,
          step_order INTEGER NOT NULL,
          question_text TEXT NOT NULL,
          input_type VARCHAR(50) NOT NULL,
          options JSONB,
          validation_rules JSONB,
          conditional_logic JSONB,
          is_required BOOLEAN DEFAULT false,
          placeholder_text TEXT,
          help_text TEXT,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
      `);

      // Create workflow instances table
      await pool.query(`
        CREATE TABLE IF NOT EXISTS qms_chat_workflow_instances (
          id SERIAL PRIMARY KEY,
          workflow_template_id INTEGER NOT NULL REFERENCES qms_chat_workflow_templates(id),
          user_id VARCHAR(255),
          session_id VARCHAR(255),
          status VARCHAR(50) DEFAULT 'in_progress',
          current_step INTEGER DEFAULT 1,
          responses JSONB,
          generated_document TEXT,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          completed_at TIMESTAMP
        );
      `);

      console.log('Workflow tables created successfully');
    }
  } catch (error) {
    console.error('Error ensuring workflow tables:', error);
    // Don't throw - allow the API to continue even if table check fails
  }
}

export const handler = async (event) => {
  console.log('=== WORKFLOW EXECUTION API ===');
  console.log('Request:', {
    method: event.httpMethod,
    path: event.path,
    timestamp: new Date().toISOString()
  });

  // Handle CORS preflight
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers: setCorsHeaders(),
      body: ''
    };
  }

  try {
    // Initialize database
    await initDatabase();
    const pool = getPool();
    
    // Ensure workflow tables exist
    await ensureWorkflowTables(pool);

    const pathParts = event.path.split('/').filter(part => part);
    const action = pathParts[pathParts.length - 1];

    switch (event.httpMethod) {
      case 'POST':
        if (action === 'detect-workflow') {
          return await detectWorkflow(pool, event.body);
        } else if (action === 'start-workflow') {
          return await startWorkflow(pool, event.body);
        } else if (action === 'submit-step') {
          return await submitWorkflowStep(pool, event.body);
        } else if (action === 'complete-workflow') {
          return await completeWorkflow(pool, event.body);
        } else if (action === 'repolish-document') {
          return await repolishWorkflowDocument(pool, event.body);
        } else if (action === 'refine-document') {
          return await refineWorkflowDocument(pool, event.body);
        } else if (action === 'pause-workflow') {
          return await pauseWorkflow(pool, event.body);
        } else if (action === 'resume-workflow') {
          return await resumeWorkflow(pool, event.body);
        }

      case 'GET':
        if (action === 'workflow-instance' && pathParts[pathParts.length - 2]) {
          return await getWorkflowInstance(pool, pathParts[pathParts.length - 2]);
        }

      default:
        return {
          statusCode: 405,
          headers: setCorsHeaders(),
          body: JSON.stringify({
            success: false,
            error: 'Method not allowed'
          })
        };
    }
  } catch (error) {
    console.error('Workflow execution API error:', error);
    
    return {
      statusCode: 500,
      headers: setCorsHeaders(),
      body: JSON.stringify({
        success: false,
        error: error.message
      })
    };
  }
};

// Detect if user message should trigger a workflow
async function detectWorkflow(pool, requestBody) {
  try {
    const { message, sessionId } = JSON.parse(requestBody);
    
    if (!message || !message.trim()) {
      return {
        statusCode: 400,
        headers: setCorsHeaders(),
        body: JSON.stringify({
          success: false,
          error: 'Message is required'
        })
      };
    }

    console.log('Detecting workflow for message:', message.substring(0, 100) + '...');

    // Get all active workflow templates
    const templatesResult = await pool.query(`
      SELECT 
        id,
        name,
        description,
        category,
        trigger_keywords,
        document_template
      FROM qms_chat_workflow_templates 
      WHERE is_active = true
      ORDER BY created_at ASC
    `);

    const templates = templatesResult.rows;
    console.log(`Found ${templates.length} active workflow templates`);

    // Check if message matches any trigger keywords
    const messageLower = message.toLowerCase();
    let matchedTemplate = null;

    for (const template of templates) {
      if (template.trigger_keywords && template.trigger_keywords.length > 0) {
        for (const keyword of template.trigger_keywords) {
          if (messageLower.includes(keyword.toLowerCase())) {
            matchedTemplate = template;
            console.log(`Matched template "${template.name}" with keyword "${keyword}"`);
            break;
          }
        }
        if (matchedTemplate) break;
      }
    }

    // If no direct keyword match, use AI to detect workflow intent
    if (!matchedTemplate) {
      console.log('No keyword match found, using AI to detect workflow intent...');
      
      try {
        const workflowNames = templates.map(t => t.name).join(', ');
        const workflowDescriptions = templates.map(t => `${t.name}: ${t.description}`).join('\n');
        
        const completion = await groq.chat.completions.create({
          model: "openai/gpt-oss-20b",
          messages: [
            {
              role: "system",
              content: `You are a workflow detection assistant. Analyze the user's message to determine if they want to start a specific workflow.

Available workflows:
${workflowDescriptions}

Respond with ONLY the workflow name if the user wants to start a workflow, or "none" if they don't want to start any workflow.

Examples:
- "I need to create a CAPA" -> "CAPA Workflow"
- "How do I write a deviation report?" -> "none" (asking how, not starting)
- "Let's start a corrective action" -> "CAPA Workflow"
- "I have a nonconformity to report" -> "CAPA Workflow"`

            },
            {
              role: "user",
              content: message
            }
          ],
          max_tokens: 50,
          temperature: 0.1
        });

        const aiResponse = completion.choices[0]?.message?.content?.trim();
        console.log('AI workflow detection response:', aiResponse);

        if (aiResponse && aiResponse !== 'none') {
          matchedTemplate = templates.find(t => t.name === aiResponse);
          if (matchedTemplate) {
            console.log(`AI detected workflow intent: "${matchedTemplate.name}"`);
          }
        }
      } catch (aiError) {
        console.error('AI workflow detection failed:', aiError);
        // Continue without AI detection
      }
    }

    if (matchedTemplate) {
      // Check if user already has an active workflow instance
      const existingInstance = await pool.query(`
        SELECT id, status, current_step, responses
        FROM qms_chat_workflow_instances 
        WHERE session_id = $1 AND status = 'in_progress'
        ORDER BY created_at DESC
        LIMIT 1
      `, [sessionId]);

      if (existingInstance.rows.length > 0) {
        console.log('User already has an active workflow instance');
        return {
          statusCode: 200,
          headers: setCorsHeaders(),
          body: JSON.stringify({
            success: true,
            shouldStartWorkflow: false,
            hasActiveWorkflow: true,
            activeInstance: existingInstance.rows[0]
          })
        };
      }

      // Get the first step of the workflow
      const firstStep = await pool.query(`
        SELECT 
          id,
          step_order,
          question_text,
          input_type,
          options,
          validation_rules,
          conditional_logic,
          is_required,
          placeholder_text,
          help_text,
          group_id,
          group_order,
          is_last_in_group,
          group_synthesis_prompt,
          group_output_variable
        FROM qms_chat_workflow_steps 
        WHERE workflow_template_id = $1
        ORDER BY step_order
        LIMIT 1
      `, [matchedTemplate.id]);

      return {
        statusCode: 200,
        headers: setCorsHeaders(),
        body: JSON.stringify({
          success: true,
          shouldStartWorkflow: true,
          hasActiveWorkflow: false,
          template: {
            id: matchedTemplate.id,
            name: matchedTemplate.name,
            description: matchedTemplate.description,
            category: matchedTemplate.category,
            documentTemplate: matchedTemplate.document_template
          },
          firstStep: firstStep.rows.length > 0 ? {
            id: firstStep.rows[0].id,
            stepOrder: firstStep.rows[0].step_order,
            questionText: firstStep.rows[0].question_text,
            inputType: firstStep.rows[0].input_type,
            options: firstStep.rows[0].options,
            validationRules: firstStep.rows[0].validation_rules,
            conditionalLogic: firstStep.rows[0].conditional_logic,
            isRequired: firstStep.rows[0].is_required,
            placeholderText: firstStep.rows[0].placeholder_text,
            helpText: firstStep.rows[0].help_text
          } : null
        })
      };
    }

    return {
      statusCode: 200,
      headers: setCorsHeaders(),
      body: JSON.stringify({
        success: true,
        shouldStartWorkflow: false,
        hasActiveWorkflow: false
      })
    };

  } catch (error) {
    console.error('Error detecting workflow:', error);
    throw error;
  }
}

// Start a new workflow instance
async function startWorkflow(pool, requestBody) {
  try {
    const { templateId, userId, sessionId, createdByUserName, isPublic } = JSON.parse(requestBody);
    
    if (!templateId) {
      return {
        statusCode: 400,
        headers: setCorsHeaders(),
        body: JSON.stringify({
          success: false,
          error: 'Template ID is required'
        })
      };
    }

    console.log(`Starting workflow for template ID: ${templateId}`);

    // Create new workflow instance with user information
    const result = await pool.query(`
      INSERT INTO qms_chat_workflow_instances 
      (workflow_template_id, user_id, session_id, status, current_step, responses, is_public, created_by_user_name, created_at, updated_at)
      VALUES ($1, $2, $3, 'in_progress', 1, '{}', $4, $5, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      RETURNING id, workflow_template_id, user_id, session_id, status, current_step, responses, is_public, created_by_user_name, created_at, updated_at
    `, [templateId, userId || null, sessionId || null, isPublic || false, createdByUserName || 'Unknown User']);

    const instance = result.rows[0];

    // Get the first step
    const firstStep = await pool.query(`
      SELECT 
        id,
        step_order,
        question_text,
        input_type,
        options,
        validation_rules,
        conditional_logic,
        is_required,
        placeholder_text,
        help_text,
        group_id,
        group_order,
        is_last_in_group,
        group_synthesis_prompt,
        group_output_variable
      FROM qms_chat_workflow_steps 
      WHERE workflow_template_id = $1
      ORDER BY step_order
      LIMIT 1
    `, [templateId]);

    console.log(`Created workflow instance with ID: ${instance.id}`);

    return {
      statusCode: 201,
      headers: setCorsHeaders(),
      body: JSON.stringify({
        success: true,
        message: 'Workflow started successfully',
        instance: {
          id: instance.id,
          workflowTemplateId: instance.workflow_template_id,
          userId: instance.user_id,
          sessionId: instance.session_id,
          status: instance.status,
          currentStep: instance.current_step,
          responses: instance.responses,
          createdAt: instance.created_at,
          updatedAt: instance.updated_at
        },
        currentStep: firstStep.rows.length > 0 ? {
          id: firstStep.rows[0].id,
          stepOrder: firstStep.rows[0].step_order,
          questionText: firstStep.rows[0].question_text,
          inputType: firstStep.rows[0].input_type,
          options: firstStep.rows[0].options,
          validationRules: firstStep.rows[0].validation_rules,
          conditionalLogic: firstStep.rows[0].conditional_logic,
          isRequired: firstStep.rows[0].is_required,
          placeholderText: firstStep.rows[0].placeholder_text,
          helpText: firstStep.rows[0].help_text
        } : null
      })
    };

  } catch (error) {
    console.error('Error starting workflow:', error);
    throw error;
  }
}

// Pause a workflow instance
async function pauseWorkflow(pool, requestBody) {
  try {
    const { instanceId, userId } = JSON.parse(requestBody);
    
    if (!instanceId || !userId) {
      return {
        statusCode: 400,
        headers: setCorsHeaders(),
        body: JSON.stringify({
          success: false,
          error: 'Instance ID and user ID are required'
        })
      };
    }
    
    // Verify user owns this workflow
    const instance = await pool.query(
      'SELECT user_id FROM qms_chat_workflow_instances WHERE id = $1',
      [instanceId]
    );
    
    if (instance.rows.length === 0) {
      return {
        statusCode: 404,
        headers: setCorsHeaders(),
        body: JSON.stringify({
          success: false,
          error: 'Workflow instance not found'
        })
      };
    }
    
    if (instance.rows[0].user_id !== userId) {
      return {
        statusCode: 403,
        headers: setCorsHeaders(),
        body: JSON.stringify({
          success: false,
          error: 'Unauthorized'
        })
      };
    }
    
    // Update status to paused
    await pool.query(
      `UPDATE qms_chat_workflow_instances 
       SET status = 'paused', paused_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
       WHERE id = $1`,
      [instanceId]
    );
    
    console.log(`Workflow instance ${instanceId} paused by user ${userId}`);
    
    return {
      statusCode: 200,
      headers: setCorsHeaders(),
      body: JSON.stringify({
        success: true,
        message: 'Workflow paused successfully'
      })
    };
    
  } catch (error) {
    console.error('Error pausing workflow:', error);
    throw error;
  }
}

// Resume a paused workflow instance
async function resumeWorkflow(pool, requestBody) {
  try {
    const { instanceId, userId } = JSON.parse(requestBody);
    
    if (!instanceId || !userId) {
      return {
        statusCode: 400,
        headers: setCorsHeaders(),
        body: JSON.stringify({
          success: false,
          error: 'Instance ID and user ID are required'
        })
      };
    }
    
    // Get workflow instance with all details
    const result = await pool.query(`
      SELECT wi.*, wt.name as workflow_name
      FROM qms_chat_workflow_instances wi
      JOIN qms_chat_workflow_templates wt ON wi.workflow_template_id = wt.id
      WHERE wi.id = $1 AND wi.user_id = $2 AND wi.status = 'paused'
    `, [instanceId, userId]);
    
    if (result.rows.length === 0) {
      return {
        statusCode: 404,
        headers: setCorsHeaders(),
        body: JSON.stringify({
          success: false,
          error: 'Workflow not found or not paused'
        })
      };
    }
    
    const instance = result.rows[0];
    
    // Check if workflow is expired (30 days)
    const pausedDate = new Date(instance.paused_at);
    const daysSincePaused = (Date.now() - pausedDate.getTime()) / (1000 * 60 * 60 * 24);
    
    if (daysSincePaused > 30) {
      return {
        statusCode: 410,
        headers: setCorsHeaders(),
        body: JSON.stringify({
          success: false,
          error: 'Workflow has expired (paused for more than 30 days)'
        })
      };
    }
    
    // Get current step details
    const stepResult = await pool.query(`
      SELECT * FROM qms_chat_workflow_steps 
      WHERE workflow_template_id = $1 AND step_order = $2
    `, [instance.workflow_template_id, instance.current_step]);
    
    if (stepResult.rows.length === 0) {
      return {
        statusCode: 500,
        headers: setCorsHeaders(),
        body: JSON.stringify({
          success: false,
          error: 'Current step not found'
        })
      };
    }
    
    // Get all steps for summary
    const allSteps = await pool.query(`
      SELECT step_order, question_text 
      FROM qms_chat_workflow_steps 
      WHERE workflow_template_id = $1 AND step_order < $2
      ORDER BY step_order
    `, [instance.workflow_template_id, instance.current_step]);
    
    // Update status back to in_progress
    await pool.query(
      `UPDATE qms_chat_workflow_instances 
       SET status = 'in_progress', updated_at = CURRENT_TIMESTAMP
       WHERE id = $1`,
      [instanceId]
    );
    
    console.log(`Workflow instance ${instanceId} resumed by user ${userId}`);
    
    return {
      statusCode: 200,
      headers: setCorsHeaders(),
      body: JSON.stringify({
        success: true,
        message: 'Workflow resumed successfully',
        instance: {
          id: instance.id,
          workflowTemplateId: instance.workflow_template_id,
          workflowName: instance.workflow_name,
          userId: instance.user_id,
          sessionId: instance.session_id,
          status: 'in_progress',
          currentStep: instance.current_step,
          responses: instance.responses,
          createdAt: instance.created_at,
          updatedAt: instance.updated_at
        },
        currentStep: {
          id: stepResult.rows[0].id,
          stepOrder: stepResult.rows[0].step_order,
          questionText: stepResult.rows[0].question_text,
          inputType: stepResult.rows[0].input_type,
          options: stepResult.rows[0].options,
          validationRules: stepResult.rows[0].validation_rules,
          conditionalLogic: stepResult.rows[0].conditional_logic,
          isRequired: stepResult.rows[0].is_required,
          placeholderText: stepResult.rows[0].placeholder_text,
          helpText: stepResult.rows[0].help_text
        },
        completedSteps: allSteps.rows.map(step => ({
          stepOrder: step.step_order,
          questionText: step.question_text
        })),
        responses: instance.responses
      })
    };
    
  } catch (error) {
    console.error('Error resuming workflow:', error);
    throw error;
  }
}

// Synthesize grouped responses using AI
async function synthesizeGroupedResponses(groupResponses, synthesisPrompt, outputVariableName) {
  try {
    console.log(`Synthesizing ${groupResponses.length} grouped responses...`);
    
    // Build context with all Q&A pairs
    let qaContext = '';
    groupResponses.forEach((qa, index) => {
      qaContext += `Question ${index + 1}: ${qa.question}\n`;
      qaContext += `Answer ${index + 1}: ${qa.answer}\n\n`;
    });
    
    // Prepare the AI prompt with the admin's synthesis instructions
    const systemPrompt = `You are an expert document writer for pharmaceutical quality management. Your task is to synthesize multiple question-and-answer pairs into a cohesive, professional response.

${synthesisPrompt || 'Generate a cohesive, professional response that integrates all the provided information.'}

Guidelines:
- Write in a clear, professional tone appropriate for regulatory documentation
- Integrate all relevant information from the answers
- Create smooth transitions between ideas
- Remove redundancy while preserving all important details
- Maintain technical accuracy
- Use proper paragraph structure
- Do not add information that wasn't provided in the answers

Output ONLY the synthesized text, without any preamble or meta-commentary.`;

    const userPrompt = `Please synthesize the following question-and-answer pairs:\n\n${qaContext}`;

    console.log('Sending to Groq for synthesis...');
    console.log('System prompt length:', systemPrompt.length);
    console.log('User prompt length:', userPrompt.length);

    // Call Groq API
    const completion = await groq.chat.completions.create({
      model: "openai/gpt-oss-20b",
      messages: [
        {
          role: "system",
          content: systemPrompt
        },
        {
          role: "user",
          content: userPrompt
        }
      ],
      max_tokens: 1500,
      temperature: 0.3 // Lower temperature for more consistent, factual output
    });

    const synthesizedText = completion.choices[0]?.message?.content?.trim();
    
    if (!synthesizedText) {
      console.error('AI synthesis returned empty response');
      return null;
    }

    console.log(`AI synthesis completed. Output length: ${synthesizedText.length} characters`);
    console.log(`Output preview: ${synthesizedText.substring(0, 200)}...`);
    
    return synthesizedText;

  } catch (error) {
    console.error('Error synthesizing grouped responses:', error);
    console.error('Error details:', {
      message: error.message,
      type: error.type,
      code: error.code
    });
    
    // Return null on error - workflow can continue with individual responses
    return null;
  }
}

// Submit a workflow step response
async function submitWorkflowStep(pool, requestBody) {
  try {
    const { instanceId, stepId, response, userId, sessionId } = JSON.parse(requestBody);
    
    if (!instanceId || !stepId || response === undefined) {
      return {
        statusCode: 400,
        headers: setCorsHeaders(),
        body: JSON.stringify({
          success: false,
          error: 'Instance ID, step ID, and response are required'
        })
      };
    }

    console.log(`Submitting workflow step for instance ${instanceId}, step ${stepId}`);

    // Get current instance
    const instanceResult = await pool.query(`
      SELECT 
        id,
        workflow_template_id,
        current_step,
        responses,
        status
      FROM qms_chat_workflow_instances 
      WHERE id = $1
    `, [instanceId]);

    if (instanceResult.rows.length === 0) {
      return {
        statusCode: 404,
        headers: setCorsHeaders(),
        body: JSON.stringify({
          success: false,
          error: 'Workflow instance not found'
        })
      };
    }

    const instance = instanceResult.rows[0];
    const currentResponses = instance.responses || {};
    
    // Add the new response
    currentResponses[`step_${stepId}`] = response;

    // Get current step details to check if it's part of a group
    const currentStepResult = await pool.query(`
      SELECT 
        id,
        step_order,
        question_text,
        group_id,
        group_order,
        is_last_in_group,
        group_synthesis_prompt,
        group_output_variable
      FROM qms_chat_workflow_steps 
      WHERE id = $1
    `, [stepId]);

    const currentStep = currentStepResult.rows[0];
    
    // Check if we need to synthesize grouped responses
    let synthesizedOutput = null;
    if (currentStep && currentStep.is_last_in_group && currentStep.group_id) {
      console.log(`Step ${stepId} is the last in group "${currentStep.group_id}". Triggering AI synthesis...`);
      
      // Get all steps in this group
      const groupStepsResult = await pool.query(`
        SELECT 
          id,
          step_order,
          question_text,
          group_order
        FROM qms_chat_workflow_steps 
        WHERE workflow_template_id = $1 AND group_id = $2
        ORDER BY group_order, step_order
      `, [instance.workflow_template_id, currentStep.group_id]);
      
      const groupSteps = groupStepsResult.rows;
      
      // Collect responses for all steps in the group
      const groupResponses = [];
      for (const groupStep of groupSteps) {
        const responseKey = `step_${groupStep.id}`;
        if (currentResponses[responseKey]) {
          groupResponses.push({
            question: groupStep.question_text,
            answer: currentResponses[responseKey]
          });
        }
      }
      
      // Synthesize grouped responses using AI
      synthesizedOutput = await synthesizeGroupedResponses(
        groupResponses,
        currentStep.group_synthesis_prompt,
        currentStep.group_output_variable
      );
      
      // Store the synthesized output with the group output variable
      if (synthesizedOutput) {
        currentResponses[currentStep.group_output_variable] = synthesizedOutput;
        console.log(`Synthesized group output stored as "${currentStep.group_output_variable}"`);
      }
    }

    // Get next step
    const nextStep = await pool.query(`
      SELECT 
        id,
        step_order,
        question_text,
        input_type,
        options,
        validation_rules,
        conditional_logic,
        is_required,
        placeholder_text,
        help_text,
        group_id,
        group_order,
        is_last_in_group,
        group_synthesis_prompt,
        group_output_variable
      FROM qms_chat_workflow_steps 
      WHERE workflow_template_id = $1 AND step_order > $2
      ORDER BY step_order
      LIMIT 1
    `, [instance.workflow_template_id, instance.current_step]);

    // Update instance
    const newCurrentStep = nextStep.rows.length > 0 ? nextStep.rows[0].step_order : instance.current_step + 1;
    const isComplete = nextStep.rows.length === 0;

    const updateResult = await pool.query(`
      UPDATE qms_chat_workflow_instances 
      SET 
        current_step = $1,
        responses = $2,
        status = $3,
        updated_at = CURRENT_TIMESTAMP,
        completed_at = $4
      WHERE id = $5
      RETURNING id, current_step, responses, status, completed_at
    `, [
      newCurrentStep,
      JSON.stringify(currentResponses),
      isComplete ? 'completed' : 'in_progress',
      isComplete ? new Date() : null,
      instanceId
    ]);

    const updatedInstance = updateResult.rows[0];

    console.log(`Updated workflow instance ${instanceId}, current step: ${newCurrentStep}, complete: ${isComplete}`);

    return {
      statusCode: 200,
      headers: setCorsHeaders(),
      body: JSON.stringify({
        success: true,
        message: 'Step submitted successfully',
        instance: {
          id: updatedInstance.id,
          currentStep: updatedInstance.current_step,
          responses: updatedInstance.responses,
          status: updatedInstance.status,
          completedAt: updatedInstance.completed_at
        },
        nextStep: nextStep.rows.length > 0 ? {
          id: nextStep.rows[0].id,
          stepOrder: nextStep.rows[0].step_order,
          questionText: nextStep.rows[0].question_text,
          inputType: nextStep.rows[0].input_type,
          options: nextStep.rows[0].options,
          validationRules: nextStep.rows[0].validation_rules,
          conditionalLogic: nextStep.rows[0].conditional_logic,
          isRequired: nextStep.rows[0].is_required,
          placeholderText: nextStep.rows[0].placeholder_text,
          helpText: nextStep.rows[0].help_text,
          groupId: nextStep.rows[0].group_id,
          groupOrder: nextStep.rows[0].group_order,
          isLastInGroup: nextStep.rows[0].is_last_in_group,
          groupSynthesisPrompt: nextStep.rows[0].group_synthesis_prompt,
          groupOutputVariable: nextStep.rows[0].group_output_variable
        } : null,
        isComplete: isComplete,
        synthesizedOutput: synthesizedOutput, // Include synthesized output if generated
        groupCompleted: synthesizedOutput !== null // Flag to indicate a group was completed
      })
    };

  } catch (error) {
    console.error('Error submitting workflow step:', error);
    throw error;
  }
}

// Complete workflow and generate final document
async function completeWorkflow(pool, requestBody) {
  try {
    const { instanceId, skipAI = false } = JSON.parse(requestBody);
    
    if (!instanceId) {
      return {
        statusCode: 400,
        headers: setCorsHeaders(),
        body: JSON.stringify({
          success: false,
          error: 'Instance ID is required'
        })
      };
    }

    console.log(`Completing workflow instance ${instanceId}${skipAI ? ' (skipping AI)' : ''}`);

    // Get instance with template
    const instanceResult = await pool.query(`
      SELECT 
        wi.id,
        wi.workflow_template_id,
        wi.responses,
        wi.status,
        wt.name as template_name,
        wt.document_template
      FROM qms_chat_workflow_instances wi
      JOIN qms_chat_workflow_templates wt ON wi.workflow_template_id = wt.id
      WHERE wi.id = $1
    `, [instanceId]);

    if (instanceResult.rows.length === 0) {
      return {
        statusCode: 404,
        headers: setCorsHeaders(),
        body: JSON.stringify({
          success: false,
          error: 'Workflow instance not found'
        })
      };
    }

    const instance = instanceResult.rows[0];

    // Generate final document using template
    let generatedDocument = '';
    if (instance.document_template) {
      // Replace template variables with actual responses
      generatedDocument = instance.document_template;
      const responses = instance.responses || {};
      
      // First, replace group output variables (these take priority)
      // Group output variables don't have the 'step_' prefix
      Object.keys(responses).forEach(key => {
        const value = responses[key];
        // If key doesn't start with 'step_', it's likely a group output variable
        if (!key.startsWith('step_')) {
          generatedDocument = generatedDocument.replace(new RegExp(`{{${key}}}`, 'g'), value);
          console.log(`Replaced group variable {{${key}}} in template`);
        }
      });
      
      // Then replace individual step variables
      Object.keys(responses).forEach(key => {
        const value = responses[key];
        if (key.startsWith('step_')) {
          const variableName = key.replace('step_', '');
          generatedDocument = generatedDocument.replace(new RegExp(`{{${variableName}}}`, 'g'), value);
        }
      });

      // Replace specific CAPA variables if this is a CAPA workflow (for backward compatibility)
      if (instance.template_name.toLowerCase().includes('capa')) {
        generatedDocument = generatedDocument
          .replace(/{{title}}/g, responses.step_2 || 'CAPA Title')
          .replace(/{{problem_description}}/g, responses.step_3 || 'Problem Description')
          .replace(/{{root_cause}}/g, responses.step_4 || responses.root_cause_analysis || 'Root Cause')
          .replace(/{{corrective_actions}}/g, responses.step_6 || 'Corrective Actions')
          .replace(/{{preventive_actions}}/g, responses.step_7 || 'Preventive Actions')
          .replace(/{{responsible_person}}/g, responses.step_8 || 'Responsible Person')
          .replace(/{{target_date}}/g, responses.step_9 || 'Target Date')
          .replace(/{{effectiveness_measures}}/g, responses.step_10 || 'Effectiveness Measures');
      }
      
      console.log('Document template variables replaced. Generated document length:', generatedDocument.length);
    }

    // Create initial version history
    const initialVersions = [
      {
        version: 1,
        content: generatedDocument,
        polished: false,
        type: 'original',
        created_at: new Date().toISOString()
      }
    ];

    // Update instance with generated document and initial version history
    const updateResult = await pool.query(`
      UPDATE qms_chat_workflow_instances 
      SET 
        generated_document = $1,
        document_versions = $2,
        status = 'completed',
        completed_at = CURRENT_TIMESTAMP,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = $3
      RETURNING id, generated_document, document_versions, status, completed_at
    `, [generatedDocument, JSON.stringify(initialVersions), instanceId]);

    const updatedInstance = updateResult.rows[0];

    console.log(`Completed workflow instance ${instanceId}`);

    // Use AI to polish the document for grammar, spelling, and clarity
    let polishedDocument = generatedDocument;
    let aiSuggestions = null;
    
    // Only run AI enhancement if not explicitly skipped
    if (!skipAI) {
      try {
        console.log('Sending document to AI for grammar and clarity improvements...');
        
        // Run both AI calls in parallel to reduce execution time
        const [aiResponse, summaryResponse] = await Promise.all([
        // First call: Polish the document
        groq.chat.completions.create({
          model: "openai/gpt-oss-20b",
          messages: [
            {
              role: "system",
              content: `You are a professional document editor specializing in pharmaceutical quality documents. Review the following document and improve it for:
- Grammar and spelling
- Clarity and professionalism
- Completeness and detail
- Consistency in terminology
- Professional tone appropriate for regulatory environments

Maintain the original structure and all key information. Only improve the writing quality. Do not add new information that wasn't provided by the user.

Return ONLY the improved document text, without any explanations or comments.`
            },
            {
              role: "user",
              content: generatedDocument
            }
          ],
          max_tokens: 2000,
          temperature: 0.3
        }),
        
        // Second call: Generate improvement suggestions (based on original document structure)
        groq.chat.completions.create({
          model: "openai/gpt-oss-20b",
          messages: [
            {
              role: "system",
              content: "Review this pharmaceutical quality document and suggest 3-5 specific improvements for grammar, clarity, and professionalism. Be brief and specific."
            },
            {
              role: "user",
              content: generatedDocument
            }
          ],
          max_tokens: 300,
          temperature: 0.3
        })
      ]);

        polishedDocument = aiResponse.choices[0]?.message?.content || generatedDocument;
        aiSuggestions = summaryResponse.choices[0]?.message?.content || 'Document improved for grammar, spelling, and clarity.';
        
        console.log('AI document polish completed successfully');
        
        // Add polished version to version history
        if (polishedDocument !== generatedDocument) {
          const currentVersions = updatedInstance.document_versions || [];
          const newVersion = {
            version: currentVersions.length + 1,
            content: polishedDocument,
            polished: true,
            type: 'ai_polished',
            created_at: new Date().toISOString()
          };
          
          currentVersions.push(newVersion);
          
          // Update instance with new version and set polished document as current
          await pool.query(`
            UPDATE qms_chat_workflow_instances 
            SET 
              generated_document = $1,
              document_versions = $2,
              updated_at = CURRENT_TIMESTAMP
            WHERE id = $3
          `, [polishedDocument, JSON.stringify(currentVersions), instanceId]);
          
          console.log(`Added AI polished version (v${newVersion.version}) to workflow instance ${instanceId}`);
        }
      } catch (aiError) {
        console.error('AI document polish failed:', aiError);
        // Continue with original document if AI fails
        polishedDocument = generatedDocument;
      }
    } else {
      console.log('Skipping AI enhancement as requested');
    }

    // Fetch the updated versions array for the response
    const finalInstanceResult = await pool.query(`
      SELECT document_versions FROM qms_chat_workflow_instances WHERE id = $1
    `, [instanceId]);
    
    const finalVersions = finalInstanceResult.rows[0]?.document_versions || [];

    return {
      statusCode: 200,
      headers: setCorsHeaders(),
      body: JSON.stringify({
        success: true,
        message: 'Workflow completed successfully',
        instance: {
          id: updatedInstance.id,
          status: updatedInstance.status,
          completedAt: updatedInstance.completed_at
        },
        generatedDocument: updatedInstance.generated_document,
        polishedDocument: polishedDocument,
        aiSuggestions: aiSuggestions,
        hasAiImprovements: polishedDocument !== generatedDocument,
        documentVersions: finalVersions
      })
    };

  } catch (error) {
    console.error('Error completing workflow:', error);
    throw error;
  }
}

// Re-polish an edited workflow document
async function repolishWorkflowDocument(pool, requestBody) {
  try {
    const { instanceId, editedDocument } = JSON.parse(requestBody);
    
    if (!instanceId || !editedDocument) {
      return {
        statusCode: 400,
        headers: setCorsHeaders(),
        body: JSON.stringify({
          success: false,
          error: 'Instance ID and edited document are required'
        })
      };
    }

    console.log(`Re-polishing workflow document for instance ${instanceId}`);

    // Get current instance
    const instanceResult = await pool.query(`
      SELECT 
        id,
        workflow_template_id,
        generated_document,
        document_versions,
        status
      FROM qms_chat_workflow_instances 
      WHERE id = $1
    `, [instanceId]);

    if (instanceResult.rows.length === 0) {
      return {
        statusCode: 404,
        headers: setCorsHeaders(),
        body: JSON.stringify({
          success: false,
          error: 'Workflow instance not found'
        })
      };
    }

    const instance = instanceResult.rows[0];
    
    // Get current versions array or initialize if empty
    let versions = instance.document_versions || [];
    
    // Add user's edited version to history
    const userEditedVersion = {
      version: versions.length + 1,
      content: editedDocument,
      polished: false,
      type: 'user_edited',
      created_at: new Date().toISOString()
    };
    
    versions.push(userEditedVersion);
    console.log(`Added user edited version (v${userEditedVersion.version})`);

    // Run AI polish on the edited document
    let polishedDocument = editedDocument;
    let aiSuggestions = null;
    
    try {
      console.log('Sending edited document to AI for polish...');
      
      const [aiResponse, summaryResponse] = await Promise.all([
        // Polish the edited document
        groq.chat.completions.create({
          model: "openai/gpt-oss-20b",
          messages: [
            {
              role: "system",
              content: `You are a professional document editor specializing in pharmaceutical quality documents. Review the following document and improve it for:
- Grammar and spelling
- Clarity and professionalism
- Completeness and detail
- Consistency in terminology
- Professional tone appropriate for regulatory environments

Maintain the original structure and all key information. Only improve the writing quality. Do not add new information that wasn't provided by the user.

Return ONLY the improved document text, without any explanations or comments.`
            },
            {
              role: "user",
              content: editedDocument
            }
          ],
          max_tokens: 2000,
          temperature: 0.3
        }),
        
        // Generate improvement suggestions
        groq.chat.completions.create({
          model: "openai/gpt-oss-20b",
          messages: [
            {
              role: "system",
              content: "Review this pharmaceutical quality document and suggest 3-5 specific improvements for grammar, clarity, and professionalism. Be brief and specific."
            },
            {
              role: "user",
              content: editedDocument
            }
          ],
          max_tokens: 300,
          temperature: 0.3
        })
      ]);

      polishedDocument = aiResponse.choices[0]?.message?.content || editedDocument;
      aiSuggestions = summaryResponse.choices[0]?.message?.content || 'Document improved for grammar, spelling, and clarity.';
      
      console.log('AI re-polish completed successfully');
      
      // Add AI re-polished version to history
      if (polishedDocument !== editedDocument) {
        const aiRepolishedVersion = {
          version: versions.length + 1,
          content: polishedDocument,
          polished: true,
          type: 'ai_repolished',
          created_at: new Date().toISOString()
        };
        
        versions.push(aiRepolishedVersion);
        console.log(`Added AI re-polished version (v${aiRepolishedVersion.version})`);
      }
    } catch (aiError) {
      console.error('AI re-polish failed:', aiError);
      // Return the user's edited version if AI fails
      polishedDocument = editedDocument;
      aiSuggestions = 'AI polish failed. Returning your edited version.';
    }

    // Update instance with new versions and latest polished document
    const updateResult = await pool.query(`
      UPDATE qms_chat_workflow_instances 
      SET 
        generated_document = $1,
        document_versions = $2,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = $3
      RETURNING id, generated_document, document_versions, updated_at
    `, [polishedDocument, JSON.stringify(versions), instanceId]);

    const updatedInstance = updateResult.rows[0];

    console.log(`Re-polished workflow document for instance ${instanceId}. Total versions: ${versions.length}`);

    return {
      statusCode: 200,
      headers: setCorsHeaders(),
      body: JSON.stringify({
        success: true,
        message: 'Document re-polished successfully',
        versions: versions,
        currentVersion: versions.length,
        originalDocument: editedDocument,
        polishedDocument: polishedDocument,
        aiSuggestions: aiSuggestions,
        hasAiImprovements: polishedDocument !== editedDocument
      })
    };

  } catch (error) {
    console.error('Error re-polishing workflow document:', error);
    throw error;
  }
}

async function refineWorkflowDocument(pool, requestBody) {
  try {
    const { instanceId, currentDocument, instructions } = JSON.parse(requestBody);
    
    if (!instanceId || !currentDocument || !instructions) {
      return {
        statusCode: 400,
        headers: setCorsHeaders(),
        body: JSON.stringify({
          success: false,
          error: 'Instance ID, current document, and instructions are required'
        })
      };
    }

    console.log(`Refining workflow document for instance ${instanceId} with instructions: ${instructions.substring(0, 100)}...`);

    // Get current instance
    const instanceResult = await pool.query(`
      SELECT 
        id,
        workflow_template_id,
        generated_document,
        document_versions,
        status
      FROM qms_chat_workflow_instances 
      WHERE id = $1
    `, [instanceId]);

    if (instanceResult.rows.length === 0) {
      return {
        statusCode: 404,
        headers: setCorsHeaders(),
        body: JSON.stringify({
          success: false,
          error: 'Workflow instance not found'
        })
      };
    }

    const instance = instanceResult.rows[0];
    
    // Get current versions array or initialize if empty
    let versions = instance.document_versions || [];
    
    // Run AI refinement based on user instructions
    let refinedDocument = currentDocument;
    let aiSuggestions = null;
    
    try {
      console.log('Sending document to AI for refinement based on user instructions...');
      
      const [aiResponse, summaryResponse] = await Promise.all([
        // Refine the document based on user instructions
        groq.chat.completions.create({
          model: "openai/gpt-oss-20b",
          messages: [
            {
              role: "system",
              content: `You are a professional document editor specializing in pharmaceutical quality documents. 
              
Your task is to refine the following document according to the user's specific instructions while maintaining:
- Professional tone appropriate for regulatory environments
- All original information and structure
- Compliance with quality management standards
- Clarity and completeness

User Instructions: ${instructions}

Please refine the document according to these instructions and return ONLY the improved document text, without any explanations or comments.`
            },
            {
              role: "user",
              content: currentDocument
            }
          ],
          max_tokens: 2000,
          temperature: 0.3
        }),
        
        // Generate improvement summary
        groq.chat.completions.create({
          model: "openai/gpt-oss-20b",
          messages: [
            {
              role: "system",
              content: "Summarize the key improvements made to this pharmaceutical quality document based on the user's instructions. Be brief and specific about what was changed."
            },
            {
              role: "user",
              content: `Original document: ${currentDocument}\n\nUser instructions: ${instructions}`
            }
          ],
          max_tokens: 300,
          temperature: 0.3
        })
      ]);

      refinedDocument = aiResponse.choices[0]?.message?.content || currentDocument;
      aiSuggestions = summaryResponse.choices[0]?.message?.content || 'Document refined according to your instructions.';
      
      console.log('AI refinement completed successfully');
      
      // Add AI refined version to history
      if (refinedDocument !== currentDocument) {
        const aiRefinedVersion = {
          version: versions.length + 1,
          document: refinedDocument,
          timestamp: new Date().toISOString(),
          type: 'ai_refine',
          instructions: instructions,
          userId: null // Could be enhanced to capture user info
        };
        
        versions.push(aiRefinedVersion);
        console.log(`Added AI refined version (v${aiRefinedVersion.version})`);
      }
    } catch (aiError) {
      console.error('AI refinement failed:', aiError);
      // Return the original document if AI fails
      refinedDocument = currentDocument;
      aiSuggestions = 'AI refinement failed. Returning original document.';
    }

    // Update instance with new versions and latest refined document
    const updateResult = await pool.query(`
      UPDATE qms_chat_workflow_instances 
      SET 
        generated_document = $1,
        document_versions = $2,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = $3
      RETURNING id, generated_document, document_versions, updated_at
    `, [refinedDocument, JSON.stringify(versions), instanceId]);

    const updatedInstance = updateResult.rows[0];

    console.log(`Refined workflow document for instance ${instanceId}. Total versions: ${versions.length}`);

    return {
      statusCode: 200,
      headers: setCorsHeaders(),
      body: JSON.stringify({
        success: true,
        message: 'Document refined successfully',
        versions: versions,
        currentVersion: versions[versions.length - 1],
        refinedDocument: refinedDocument,
        aiSuggestions: aiSuggestions,
        hasAiImprovements: refinedDocument !== currentDocument
      })
    };

  } catch (error) {
    console.error('Error refining workflow document:', error);
    throw error;
  }
}

// Get workflow instance details
async function getWorkflowInstance(pool, instanceId) {
  try {
    console.log(`Getting workflow instance ${instanceId}`);

    const result = await pool.query(`
      SELECT 
        wi.id,
        wi.workflow_template_id,
        wi.user_id,
        wi.session_id,
        wi.status,
        wi.current_step,
        wi.responses,
        wi.generated_document,
        wi.document_versions,
        wi.created_at,
        wi.updated_at,
        wi.completed_at,
        wt.name as template_name,
        wt.description as template_description
      FROM qms_chat_workflow_instances wi
      JOIN qms_chat_workflow_templates wt ON wi.workflow_template_id = wt.id
      WHERE wi.id = $1
    `, [instanceId]);

    if (result.rows.length === 0) {
      return {
        statusCode: 404,
        headers: setCorsHeaders(),
        body: JSON.stringify({
          success: false,
          error: 'Workflow instance not found'
        })
      };
    }

    const instance = result.rows[0];

    return {
      statusCode: 200,
      headers: setCorsHeaders(),
      body: JSON.stringify({
        success: true,
        instance: {
          id: instance.id,
          workflowTemplateId: instance.workflow_template_id,
          templateName: instance.template_name,
          templateDescription: instance.template_description,
          userId: instance.user_id,
          sessionId: instance.session_id,
          status: instance.status,
          currentStep: instance.current_step,
          responses: instance.responses,
          generatedDocument: instance.generated_document,
          documentVersions: instance.document_versions || [],
          createdAt: instance.created_at,
          updatedAt: instance.updated_at,
          completedAt: instance.completed_at
        }
      })
    };

  } catch (error) {
    console.error(`Error getting workflow instance ${instanceId}:`, error);
    throw error;
  }
}

