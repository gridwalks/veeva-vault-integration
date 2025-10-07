import { getPool, initDatabase } from "./db.js";
import OpenAI from "openai";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
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
        
        const completion = await openai.chat.completions.create({
          model: "gpt-4",
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
          help_text
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
    const { templateId, userId, sessionId } = JSON.parse(requestBody);
    
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

    // Create new workflow instance
    const result = await pool.query(`
      INSERT INTO qms_chat_workflow_instances 
      (workflow_template_id, user_id, session_id, status, current_step, responses, created_at, updated_at)
      VALUES ($1, $2, $3, 'in_progress', 1, '{}', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      RETURNING id, workflow_template_id, user_id, session_id, status, current_step, responses, created_at, updated_at
    `, [templateId, userId || null, sessionId || null]);

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
        help_text
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
        help_text
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
          helpText: nextStep.rows[0].help_text
        } : null,
        isComplete: isComplete
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
    const { instanceId } = JSON.parse(requestBody);
    
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

    console.log(`Completing workflow instance ${instanceId}`);

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
      
      // Replace common variables
      Object.keys(responses).forEach(key => {
        const value = responses[key];
        const variableName = key.replace('step_', '');
        generatedDocument = generatedDocument.replace(new RegExp(`{{${variableName}}}`, 'g'), value);
      });

      // Replace specific CAPA variables if this is a CAPA workflow
      if (instance.template_name.toLowerCase().includes('capa')) {
        generatedDocument = generatedDocument
          .replace(/{{title}}/g, responses.step_2 || 'CAPA Title')
          .replace(/{{problem_description}}/g, responses.step_3 || 'Problem Description')
          .replace(/{{root_cause}}/g, responses.step_4 || 'Root Cause')
          .replace(/{{corrective_actions}}/g, responses.step_6 || 'Corrective Actions')
          .replace(/{{preventive_actions}}/g, responses.step_7 || 'Preventive Actions')
          .replace(/{{responsible_person}}/g, responses.step_8 || 'Responsible Person')
          .replace(/{{target_date}}/g, responses.step_9 || 'Target Date')
          .replace(/{{effectiveness_measures}}/g, responses.step_10 || 'Effectiveness Measures');
      }
    }

    // Update instance with generated document
    const updateResult = await pool.query(`
      UPDATE qms_chat_workflow_instances 
      SET 
        generated_document = $1,
        status = 'completed',
        completed_at = CURRENT_TIMESTAMP,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = $2
      RETURNING id, generated_document, status, completed_at
    `, [generatedDocument, instanceId]);

    const updatedInstance = updateResult.rows[0];

    console.log(`Completed workflow instance ${instanceId}`);

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
        generatedDocument: updatedInstance.generated_document
      })
    };

  } catch (error) {
    console.error('Error completing workflow:', error);
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
