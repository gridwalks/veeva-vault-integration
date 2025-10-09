import { getPool, initDatabase } from "./db.js";

// Helper function to handle CORS
function setCorsHeaders() {
  return {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS'
  };
}

// Helper function to create workflow tables if they don't exist
async function createWorkflowTables(pool) {
  try {
    console.log('Creating workflow tables...');
    
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

    // Create indexes
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_qms_chat_workflow_templates_name ON qms_chat_workflow_templates(name);
      CREATE INDEX IF NOT EXISTS idx_qms_chat_workflow_templates_category ON qms_chat_workflow_templates(category);
      CREATE INDEX IF NOT EXISTS idx_qms_chat_workflow_templates_is_active ON qms_chat_workflow_templates(is_active);
      CREATE INDEX IF NOT EXISTS idx_qms_chat_workflow_steps_template_id ON qms_chat_workflow_steps(workflow_template_id);
      CREATE INDEX IF NOT EXISTS idx_qms_chat_workflow_steps_order ON qms_chat_workflow_steps(workflow_template_id, step_order);
      CREATE INDEX IF NOT EXISTS idx_qms_chat_workflow_instances_template_id ON qms_chat_workflow_instances(workflow_template_id);
      CREATE INDEX IF NOT EXISTS idx_qms_chat_workflow_instances_user_id ON qms_chat_workflow_instances(user_id);
      CREATE INDEX IF NOT EXISTS idx_qms_chat_workflow_instances_session_id ON qms_chat_workflow_instances(session_id);
      CREATE INDEX IF NOT EXISTS idx_qms_chat_workflow_instances_status ON qms_chat_workflow_instances(status);
    `);

    console.log('Workflow tables created successfully');
  } catch (error) {
    console.error('Error creating workflow tables:', error);
    throw error;
  }
}

export const handler = async (event) => {
  console.log('=== WORKFLOW MANAGEMENT API ===');
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
    await createWorkflowTables(pool);

    const pathParts = event.path.split('/').filter(part => part);
    const lastPart = pathParts[pathParts.length - 1];
    const secondLastPart = pathParts[pathParts.length - 2];
    
    // Check if last part is a number (ID)
    const isIdInPath = !isNaN(lastPart) && lastPart !== '';
    const templateId = isIdInPath ? lastPart : null;
    const resource = isIdInPath ? secondLastPart : lastPart;

    console.log('Resource path:', { resource, templateId, pathParts, isIdInPath });

    switch (event.httpMethod) {
      case 'GET':
        if (resource === 'workflow-templates') {
          return await getWorkflowTemplates(pool);
        } else if (resource === 'workflow-steps' && templateId) {
          return await getWorkflowSteps(pool, templateId);
        } else if (resource === 'workflow-instances') {
          return await getWorkflowInstances(pool, event.queryStringParameters);
        } else if (resource === 'workflow-management' && templateId) {
          return await getWorkflowTemplate(pool, templateId);
        } else if (resource === 'workflow-management') {
          return await getWorkflowTemplates(pool);
        } else {
          return await getWorkflowTemplates(pool);
        }

      case 'POST':
        if (resource === 'workflow-templates') {
          return await createWorkflowTemplate(pool, event.body);
        } else if (resource === 'workflow-steps') {
          return await createWorkflowStep(pool, event.body);
        } else if (resource === 'workflow-instances') {
          return await createWorkflowInstance(pool, event.body);
        } else if (resource === 'workflow-management') {
          return await createWorkflowTemplate(pool, event.body);
        }

      case 'PUT':
        if (resource === 'workflow-management' && templateId) {
          return await updateWorkflowTemplate(pool, templateId, event.body);
        } else if (resource === 'workflow-steps' && templateId) {
          return await updateWorkflowStep(pool, templateId, event.body);
        }
        break;

      case 'DELETE':
        if (resource === 'workflow-management' && templateId) {
          return await deleteWorkflowTemplate(pool, templateId);
        } else if (resource === 'workflow-steps' && templateId) {
          return await deleteWorkflowStep(pool, templateId);
        }
        break;

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
    console.error('Workflow management API error:', error);
    
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

// Get all workflow templates
async function getWorkflowTemplates(pool) {
  try {
    console.log('Fetching all workflow templates...');
    
    const result = await pool.query(`
      SELECT 
        id,
        name,
        description,
        category,
        is_active,
        trigger_keywords,
        document_template,
        created_at,
        updated_at
      FROM qms_chat_workflow_templates 
      ORDER BY created_at DESC
    `);

    console.log(`Found ${result.rows.length} workflow templates`);

    return {
      statusCode: 200,
      headers: setCorsHeaders(),
      body: JSON.stringify({
        success: true,
        templates: result.rows.map(row => ({
          id: row.id,
          name: row.name,
          description: row.description,
          category: row.category,
          isActive: row.is_active,
          triggerKeywords: row.trigger_keywords || [],
          documentTemplate: row.document_template,
          createdAt: row.created_at,
          updatedAt: row.updated_at
        }))
      })
    };
  } catch (error) {
    console.error('Error fetching workflow templates:', error);
    throw error;
  }
}

// Get single workflow template with steps
async function getWorkflowTemplate(pool, templateId) {
  try {
    console.log(`Fetching workflow template with ID: ${templateId}`);
    
    // Get template
    const templateResult = await pool.query(`
      SELECT 
        id,
        name,
        description,
        category,
        is_active,
        trigger_keywords,
        document_template,
        created_at,
        updated_at
      FROM qms_chat_workflow_templates 
      WHERE id = $1
    `, [templateId]);

    if (templateResult.rows.length === 0) {
      return {
        statusCode: 404,
        headers: setCorsHeaders(),
        body: JSON.stringify({
          success: false,
          error: 'Workflow template not found'
        })
      };
    }

    // Get steps
    const stepsResult = await pool.query(`
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
        group_output_variable,
        created_at,
        updated_at
      FROM qms_chat_workflow_steps 
      WHERE workflow_template_id = $1
      ORDER BY step_order
    `, [templateId]);

    const template = templateResult.rows[0];
    const steps = stepsResult.rows.map(step => ({
      id: step.id,
      stepOrder: step.step_order,
      questionText: step.question_text,
      inputType: step.input_type,
      options: step.options,
      validationRules: step.validation_rules,
      conditionalLogic: step.conditional_logic,
      isRequired: step.is_required,
      placeholderText: step.placeholder_text,
      helpText: step.help_text,
      groupId: step.group_id,
      groupOrder: step.group_order,
      isLastInGroup: step.is_last_in_group,
      groupSynthesisPrompt: step.group_synthesis_prompt,
      groupOutputVariable: step.group_output_variable,
      createdAt: step.created_at,
      updatedAt: step.updated_at
    }));

    return {
      statusCode: 200,
      headers: setCorsHeaders(),
      body: JSON.stringify({
        success: true,
        template: {
          id: template.id,
          name: template.name,
          description: template.description,
          category: template.category,
          isActive: template.is_active,
          triggerKeywords: template.trigger_keywords || [],
          documentTemplate: template.document_template,
          steps: steps,
          createdAt: template.created_at,
          updatedAt: template.updated_at
        }
      })
    };
  } catch (error) {
    console.error(`Error fetching workflow template ${templateId}:`, error);
    throw error;
  }
}

// Get workflow steps for a template
async function getWorkflowSteps(pool, templateId) {
  try {
    console.log(`Fetching workflow steps for template ID: ${templateId}`);
    
    const result = await pool.query(`
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
        group_output_variable,
        created_at,
        updated_at
      FROM qms_chat_workflow_steps 
      WHERE workflow_template_id = $1
      ORDER BY step_order
    `, [templateId]);

    return {
      statusCode: 200,
      headers: setCorsHeaders(),
      body: JSON.stringify({
        success: true,
        steps: result.rows.map(step => ({
          id: step.id,
          stepOrder: step.step_order,
          questionText: step.question_text,
          inputType: step.input_type,
          options: step.options,
          validationRules: step.validation_rules,
          conditionalLogic: step.conditional_logic,
          isRequired: step.is_required,
          placeholderText: step.placeholder_text,
          helpText: step.help_text,
          groupId: step.group_id,
          groupOrder: step.group_order,
          isLastInGroup: step.is_last_in_group,
          groupSynthesisPrompt: step.group_synthesis_prompt,
          groupOutputVariable: step.group_output_variable,
          createdAt: step.created_at,
          updatedAt: step.updated_at
        }))
      })
    };
  } catch (error) {
    console.error(`Error fetching workflow steps for template ${templateId}:`, error);
    throw error;
  }
}

// Create new workflow template
async function createWorkflowTemplate(pool, requestBody) {
  try {
    console.log('Creating new workflow template...');
    
    const data = JSON.parse(requestBody);
    
    // Validate required fields
    if (!data.name || !data.name.trim()) {
      return {
        statusCode: 400,
        headers: setCorsHeaders(),
        body: JSON.stringify({
          success: false,
          error: 'Template name is required'
        })
      };
    }

    // Insert new template
    const result = await pool.query(`
      INSERT INTO qms_chat_workflow_templates 
      (name, description, category, is_active, trigger_keywords, document_template, created_at, updated_at)
      VALUES ($1, $2, $3, $4, $5, $6, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      RETURNING id, name, description, category, is_active, trigger_keywords, document_template, created_at, updated_at
    `, [
      data.name.trim(),
      data.description ? data.description.trim() : null,
      data.category || 'Quality',
      data.isActive !== undefined ? data.isActive : true,
      data.triggerKeywords || [],
      data.documentTemplate || null
    ]);

    const newTemplate = result.rows[0];

    console.log(`Created workflow template with ID: ${newTemplate.id}`);

    return {
      statusCode: 201,
      headers: setCorsHeaders(),
      body: JSON.stringify({
        success: true,
        message: 'Workflow template created successfully',
        template: {
          id: newTemplate.id,
          name: newTemplate.name,
          description: newTemplate.description,
          category: newTemplate.category,
          isActive: newTemplate.is_active,
          triggerKeywords: newTemplate.trigger_keywords || [],
          documentTemplate: newTemplate.document_template,
          createdAt: newTemplate.created_at,
          updatedAt: newTemplate.updated_at
        }
      })
    };
  } catch (error) {
    console.error('Error creating workflow template:', error);
    throw error;
  }
}

// Update workflow template
async function updateWorkflowTemplate(pool, templateId, requestBody) {
  try {
    console.log(`Updating workflow template with ID: ${templateId}`);
    
    const data = JSON.parse(requestBody);
    
    // Check if template exists
    const existingResult = await pool.query(
      'SELECT id FROM qms_chat_workflow_templates WHERE id = $1',
      [templateId]
    );

    if (existingResult.rows.length === 0) {
      return {
        statusCode: 404,
        headers: setCorsHeaders(),
        body: JSON.stringify({
          success: false,
          error: 'Workflow template not found'
        })
      };
    }

    // Update template
    const result = await pool.query(`
      UPDATE qms_chat_workflow_templates 
      SET 
        name = $1,
        description = $2,
        category = $3,
        is_active = $4,
        trigger_keywords = $5,
        document_template = $6,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = $7
      RETURNING id, name, description, category, is_active, trigger_keywords, document_template, created_at, updated_at
    `, [
      data.name ? data.name.trim() : null,
      data.description ? data.description.trim() : null,
      data.category || null,
      data.isActive !== undefined ? data.isActive : null,
      data.triggerKeywords || null,
      data.documentTemplate || null,
      templateId
    ]);

    const updatedTemplate = result.rows[0];

    console.log(`Updated workflow template with ID: ${updatedTemplate.id}`);

    return {
      statusCode: 200,
      headers: setCorsHeaders(),
      body: JSON.stringify({
        success: true,
        message: 'Workflow template updated successfully',
        template: {
          id: updatedTemplate.id,
          name: updatedTemplate.name,
          description: updatedTemplate.description,
          category: updatedTemplate.category,
          isActive: updatedTemplate.is_active,
          triggerKeywords: updatedTemplate.trigger_keywords || [],
          documentTemplate: updatedTemplate.document_template,
          createdAt: updatedTemplate.created_at,
          updatedAt: updatedTemplate.updated_at
        }
      })
    };
  } catch (error) {
    console.error(`Error updating workflow template ${templateId}:`, error);
    throw error;
  }
}

// Delete workflow template
async function deleteWorkflowTemplate(pool, templateId) {
  try {
    console.log(`Deleting workflow template with ID: ${templateId}`);
    
    // Check if template exists
    const existingResult = await pool.query(
      'SELECT id FROM qms_chat_workflow_templates WHERE id = $1',
      [templateId]
    );

    if (existingResult.rows.length === 0) {
      return {
        statusCode: 404,
        headers: setCorsHeaders(),
        body: JSON.stringify({
          success: false,
          error: 'Workflow template not found'
        })
      };
    }

    // Check if there are any workflow instances using this template
    const instancesResult = await pool.query(
      'SELECT COUNT(*) as count FROM qms_chat_workflow_instances WHERE workflow_template_id = $1',
      [templateId]
    );

    const instanceCount = parseInt(instancesResult.rows[0].count);

    if (instanceCount > 0) {
      // Don't delete, but offer to deactivate instead
      return {
        statusCode: 409,
        headers: setCorsHeaders(),
        body: JSON.stringify({
          success: false,
          error: `Cannot delete workflow template because ${instanceCount} workflow instance(s) are using it. You can deactivate the workflow instead to prevent new instances.`,
          instanceCount: instanceCount,
          canDeactivate: true
        })
      };
    }

    // Delete template (steps will be deleted by CASCADE)
    await pool.query('DELETE FROM qms_chat_workflow_templates WHERE id = $1', [templateId]);

    console.log(`Deleted workflow template with ID: ${templateId}`);

    return {
      statusCode: 200,
      headers: setCorsHeaders(),
      body: JSON.stringify({
        success: true,
        message: 'Workflow template deleted successfully'
      })
    };
  } catch (error) {
    console.error(`Error deleting workflow template ${templateId}:`, error);
    throw error;
  }
}

// Create workflow step
async function createWorkflowStep(pool, requestBody) {
  try {
    console.log('Creating new workflow step...');
    
    const data = JSON.parse(requestBody);
    
    // Validate required fields
    if (!data.workflowTemplateId || !data.questionText || !data.inputType) {
      return {
        statusCode: 400,
        headers: setCorsHeaders(),
        body: JSON.stringify({
          success: false,
          error: 'Workflow template ID, question text, and input type are required'
        })
      };
    }

    // Insert new step
    const result = await pool.query(`
      INSERT INTO qms_chat_workflow_steps 
      (workflow_template_id, step_order, question_text, input_type, options, validation_rules, 
       conditional_logic, is_required, placeholder_text, help_text, 
       group_id, group_order, is_last_in_group, group_synthesis_prompt, group_output_variable,
       created_at, updated_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      RETURNING id, step_order, question_text, input_type, options, validation_rules, 
                conditional_logic, is_required, placeholder_text, help_text,
                group_id, group_order, is_last_in_group, group_synthesis_prompt, group_output_variable,
                created_at, updated_at
    `, [
      data.workflowTemplateId,
      data.stepOrder || 1,
      data.questionText.trim(),
      data.inputType,
      data.options ? JSON.stringify(data.options) : null,
      data.validationRules ? JSON.stringify(data.validationRules) : null,
      data.conditionalLogic ? JSON.stringify(data.conditionalLogic) : null,
      data.isRequired || false,
      data.placeholderText || null,
      data.helpText || null,
      data.groupId || null,
      data.groupOrder || null,
      data.isLastInGroup || false,
      data.groupSynthesisPrompt || null,
      data.groupOutputVariable || null
    ]);

    const newStep = result.rows[0];

    console.log(`Created workflow step with ID: ${newStep.id}`);

    return {
      statusCode: 201,
      headers: setCorsHeaders(),
      body: JSON.stringify({
        success: true,
        message: 'Workflow step created successfully',
        step: {
          id: newStep.id,
          stepOrder: newStep.step_order,
          questionText: newStep.question_text,
          inputType: newStep.input_type,
          options: newStep.options,
          validationRules: newStep.validation_rules,
          conditionalLogic: newStep.conditional_logic,
          isRequired: newStep.is_required,
          placeholderText: newStep.placeholder_text,
          helpText: newStep.help_text,
          groupId: newStep.group_id,
          groupOrder: newStep.group_order,
          isLastInGroup: newStep.is_last_in_group,
          groupSynthesisPrompt: newStep.group_synthesis_prompt,
          groupOutputVariable: newStep.group_output_variable,
          createdAt: newStep.created_at,
          updatedAt: newStep.updated_at
        }
      })
    };
  } catch (error) {
    console.error('Error creating workflow step:', error);
    throw error;
  }
}

// Update workflow step
async function updateWorkflowStep(pool, stepId, requestBody) {
  try {
    console.log(`Updating workflow step with ID: ${stepId}`);
    
    const data = JSON.parse(requestBody);
    
    // Check if step exists
    const existingResult = await pool.query(
      'SELECT id FROM qms_chat_workflow_steps WHERE id = $1',
      [stepId]
    );

    if (existingResult.rows.length === 0) {
      return {
        statusCode: 404,
        headers: setCorsHeaders(),
        body: JSON.stringify({
          success: false,
          error: 'Workflow step not found'
        })
      };
    }

    // Update step
    const result = await pool.query(`
      UPDATE qms_chat_workflow_steps 
      SET 
        step_order = $1,
        question_text = $2,
        input_type = $3,
        options = $4,
        validation_rules = $5,
        conditional_logic = $6,
        is_required = $7,
        placeholder_text = $8,
        help_text = $9,
        group_id = $10,
        group_order = $11,
        is_last_in_group = $12,
        group_synthesis_prompt = $13,
        group_output_variable = $14,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = $15
      RETURNING id, step_order, question_text, input_type, options, validation_rules, 
                conditional_logic, is_required, placeholder_text, help_text,
                group_id, group_order, is_last_in_group, group_synthesis_prompt, group_output_variable,
                created_at, updated_at
    `, [
      data.stepOrder || null,
      data.questionText ? data.questionText.trim() : null,
      data.inputType || null,
      data.options ? JSON.stringify(data.options) : null,
      data.validationRules ? JSON.stringify(data.validationRules) : null,
      data.conditionalLogic ? JSON.stringify(data.conditionalLogic) : null,
      data.isRequired !== undefined ? data.isRequired : null,
      data.placeholderText || null,
      data.helpText || null,
      data.groupId !== undefined ? data.groupId : null,
      data.groupOrder !== undefined ? data.groupOrder : null,
      data.isLastInGroup !== undefined ? data.isLastInGroup : null,
      data.groupSynthesisPrompt !== undefined ? data.groupSynthesisPrompt : null,
      data.groupOutputVariable !== undefined ? data.groupOutputVariable : null,
      stepId
    ]);

    const updatedStep = result.rows[0];

    console.log(`Updated workflow step with ID: ${updatedStep.id}`);

    return {
      statusCode: 200,
      headers: setCorsHeaders(),
      body: JSON.stringify({
        success: true,
        message: 'Workflow step updated successfully',
        step: {
          id: updatedStep.id,
          stepOrder: updatedStep.step_order,
          questionText: updatedStep.question_text,
          inputType: updatedStep.input_type,
          options: updatedStep.options,
          validationRules: updatedStep.validation_rules,
          conditionalLogic: updatedStep.conditional_logic,
          isRequired: updatedStep.is_required,
          placeholderText: updatedStep.placeholder_text,
          helpText: updatedStep.help_text,
          groupId: updatedStep.group_id,
          groupOrder: updatedStep.group_order,
          isLastInGroup: updatedStep.is_last_in_group,
          groupSynthesisPrompt: updatedStep.group_synthesis_prompt,
          groupOutputVariable: updatedStep.group_output_variable,
          createdAt: updatedStep.created_at,
          updatedAt: updatedStep.updated_at
        }
      })
    };
  } catch (error) {
    console.error(`Error updating workflow step ${stepId}:`, error);
    throw error;
  }
}

// Delete workflow step
async function deleteWorkflowStep(pool, stepId) {
  try {
    console.log(`Deleting workflow step with ID: ${stepId}`);
    
    // Check if step exists
    const existingResult = await pool.query(
      'SELECT id FROM qms_chat_workflow_steps WHERE id = $1',
      [stepId]
    );

    if (existingResult.rows.length === 0) {
      return {
        statusCode: 404,
        headers: setCorsHeaders(),
        body: JSON.stringify({
          success: false,
          error: 'Workflow step not found'
        })
      };
    }

    // Delete step
    await pool.query('DELETE FROM qms_chat_workflow_steps WHERE id = $1', [stepId]);

    console.log(`Deleted workflow step with ID: ${stepId}`);

    return {
      statusCode: 200,
      headers: setCorsHeaders(),
      body: JSON.stringify({
        success: true,
        message: 'Workflow step deleted successfully'
      })
    };
  } catch (error) {
    console.error(`Error deleting workflow step ${stepId}:`, error);
    throw error;
  }
}

// Get workflow instances
async function getWorkflowInstances(pool, queryParams) {
  try {
    console.log('Fetching workflow instances...');
    
    const limit = parseInt(queryParams?.limit) || 50;
    const offset = parseInt(queryParams?.offset) || 0;
    const status = queryParams?.status;
    const userId = queryParams?.userId;
    
    let query = `
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
        wt.name as workflow_name
      FROM qms_chat_workflow_instances wi
      JOIN qms_chat_workflow_templates wt ON wi.workflow_template_id = wt.id
      WHERE 1=1
    `;
    
    const params = [];
    let paramIndex = 1;
    
    if (status) {
      query += ` AND wi.status = $${paramIndex}`;
      params.push(status);
      paramIndex++;
    }
    
    if (userId) {
      query += ` AND wi.user_id = $${paramIndex}`;
      params.push(userId);
      paramIndex++;
    }
    
    query += ` ORDER BY wi.created_at DESC LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
    params.push(limit, offset);
    
    const result = await pool.query(query, params);

    return {
      statusCode: 200,
      headers: setCorsHeaders(),
      body: JSON.stringify({
        success: true,
        instances: result.rows.map(row => ({
          id: row.id,
          workflowTemplateId: row.workflow_template_id,
          workflowName: row.workflow_name,
          userId: row.user_id,
          sessionId: row.session_id,
          status: row.status,
          currentStep: row.current_step,
          responses: row.responses,
          generatedDocument: row.generated_document,
          documentVersions: row.document_versions || [],
          createdAt: row.created_at,
          updatedAt: row.updated_at,
          completedAt: row.completed_at
        }))
      })
    };
  } catch (error) {
    console.error('Error fetching workflow instances:', error);
    throw error;
  }
}

// Create workflow instance
async function createWorkflowInstance(pool, requestBody) {
  try {
    console.log('Creating new workflow instance...');
    
    const data = JSON.parse(requestBody);
    
    // Validate required fields
    if (!data.workflowTemplateId) {
      return {
        statusCode: 400,
        headers: setCorsHeaders(),
        body: JSON.stringify({
          success: false,
          error: 'Workflow template ID is required'
        })
      };
    }

    // Insert new instance
    const result = await pool.query(`
      INSERT INTO qms_chat_workflow_instances 
      (workflow_template_id, user_id, session_id, status, current_step, responses, created_at, updated_at)
      VALUES ($1, $2, $3, $4, $5, $6, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      RETURNING id, workflow_template_id, user_id, session_id, status, current_step, responses, created_at, updated_at
    `, [
      data.workflowTemplateId,
      data.userId || null,
      data.sessionId || null,
      data.status || 'in_progress',
      data.currentStep || 1,
      data.responses ? JSON.stringify(data.responses) : null
    ]);

    const newInstance = result.rows[0];

    console.log(`Created workflow instance with ID: ${newInstance.id}`);

    return {
      statusCode: 201,
      headers: setCorsHeaders(),
      body: JSON.stringify({
        success: true,
        message: 'Workflow instance created successfully',
        instance: {
          id: newInstance.id,
          workflowTemplateId: newInstance.workflow_template_id,
          userId: newInstance.user_id,
          sessionId: newInstance.session_id,
          status: newInstance.status,
          currentStep: newInstance.current_step,
          responses: newInstance.responses,
          createdAt: newInstance.created_at,
          updatedAt: newInstance.updated_at
        }
      })
    };
  } catch (error) {
    console.error('Error creating workflow instance:', error);
    throw error;
  }
}

