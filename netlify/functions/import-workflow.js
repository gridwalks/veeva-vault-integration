import { getPool, initDatabase } from "./db.js";

// Helper function to handle CORS
function setCorsHeaders() {
  return {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS'
  };
}

// Parse CSV data
function parseCSV(csvText) {
  const lines = csvText.split('\n').filter(line => line.trim());
  if (lines.length === 0) return [];

  const headers = lines[0].split(',').map(h => h.trim().replace(/^"|"$/g, ''));
  const rows = [];

  for (let i = 1; i < lines.length; i++) {
    const values = parseCSVLine(lines[i]);
    if (values.length === headers.length) {
      const row = {};
      headers.forEach((header, index) => {
        row[header] = values[index];
      });
      rows.push(row);
    }
  }

  return rows;
}

// Parse a single CSV line (handles quoted values with commas)
function parseCSVLine(line) {
  const values = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    
    if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === ',' && !inQuotes) {
      values.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }
  
  values.push(current.trim());
  return values.map(v => v.replace(/^"|"$/g, ''));
}

// Validate workflow template data
function validateTemplateData(data) {
  const errors = [];

  if (!data.name || data.name.trim() === '') {
    errors.push('Template name is required');
  }

  return errors;
}

// Validate workflow step data
function validateStepData(data, stepNumber) {
  const errors = [];

  if (!data.question_text || data.question_text.trim() === '') {
    errors.push(`Step ${stepNumber}: Question text is required`);
  }

  if (!data.input_type || data.input_type.trim() === '') {
    errors.push(`Step ${stepNumber}: Input type is required`);
  }

  const validInputTypes = ['text', 'textarea', 'select', 'radio', 'checkbox', 'date', 'file'];
  if (data.input_type && !validInputTypes.includes(data.input_type.toLowerCase())) {
    errors.push(`Step ${stepNumber}: Invalid input type '${data.input_type}'. Must be one of: ${validInputTypes.join(', ')}`);
  }

  return errors;
}

export const handler = async (event) => {
  console.log('=== IMPORT WORKFLOW API ===');
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

    if (event.httpMethod !== 'POST') {
      return {
        statusCode: 405,
        headers: setCorsHeaders(),
        body: JSON.stringify({
          success: false,
          error: 'Method not allowed'
        })
      };
    }

    const body = JSON.parse(event.body || '{}');
    const { fileContent, fileType } = body;

    if (!fileContent) {
      return {
        statusCode: 400,
        headers: setCorsHeaders(),
        body: JSON.stringify({
          success: false,
          error: 'File content is required'
        })
      };
    }

    console.log('Processing workflow import...', { fileType });

    // Parse the file content (currently supports CSV)
    let rows;
    try {
      if (fileType === 'csv' || fileType === 'text/csv') {
        rows = parseCSV(fileContent);
      } else {
        return {
          statusCode: 400,
          headers: setCorsHeaders(),
          body: JSON.stringify({
            success: false,
            error: 'Unsupported file type. Please use CSV format.'
          })
        };
      }
    } catch (parseError) {
      console.error('Error parsing file:', parseError);
      return {
        statusCode: 400,
        headers: setCorsHeaders(),
        body: JSON.stringify({
          success: false,
          error: 'Failed to parse file. Please check the format.'
        })
      };
    }

    if (rows.length === 0) {
      return {
        statusCode: 400,
        headers: setCorsHeaders(),
        body: JSON.stringify({
          success: false,
          error: 'No data found in file'
        })
      };
    }

    console.log(`Parsed ${rows.length} rows from file`);

    // Extract template information from first row
    const templateData = {
      name: rows[0].workflow_name || rows[0].name || 'Imported Workflow',
      description: rows[0].workflow_description || rows[0].description || '',
      category: rows[0].workflow_category || rows[0].category || 'Quality',
      trigger_keywords: rows[0].trigger_keywords ? rows[0].trigger_keywords.split(';').map(k => k.trim()) : [],
      document_template: rows[0].document_template || ''
    };

    // Validate template data
    const templateErrors = validateTemplateData(templateData);
    if (templateErrors.length > 0) {
      return {
        statusCode: 400,
        headers: setCorsHeaders(),
        body: JSON.stringify({
          success: false,
          error: 'Validation failed',
          details: templateErrors
        })
      };
    }

    // Create workflow template
    console.log('Creating workflow template:', templateData.name);
    const templateResult = await pool.query(`
      INSERT INTO qms_chat_workflow_templates 
      (name, description, category, is_active, trigger_keywords, document_template, created_at, updated_at)
      VALUES ($1, $2, $3, $4, $5, $6, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      RETURNING id, name
    `, [
      templateData.name,
      templateData.description,
      templateData.category,
      false, // Set inactive by default until reviewed
      templateData.trigger_keywords,
      templateData.document_template
    ]);

    const templateId = templateResult.rows[0].id;
    console.log(`Created template with ID: ${templateId}`);

    // Process steps
    const steps = [];
    const stepErrors = [];
    let stepsCreated = 0;

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      
      // Skip rows without step information
      if (!row.question_text && !row.step_question) {
        continue;
      }

      const stepData = {
        step_order: parseInt(row.step_order || row.order || (i + 1)),
        question_text: row.question_text || row.step_question || '',
        input_type: (row.input_type || row.type || 'text').toLowerCase(),
        is_required: (row.required || row.is_required || 'false').toLowerCase() === 'true',
        placeholder_text: row.placeholder || row.placeholder_text || '',
        help_text: row.help_text || row.help || '',
        options: row.options ? { choices: row.options.split(';').map(o => o.trim()) } : null,
        validation_rules: null,
        // Group configuration fields
        group_id: row.group_id || null,
        group_order: row.group_order ? parseInt(row.group_order) : null,
        is_last_in_group: (row.is_last_in_group || 'false').toLowerCase() === 'true',
        group_synthesis_prompt: row.group_synthesis_prompt || null,
        group_output_variable: row.group_output_variable || null
      };

      // Parse validation rules if provided
      if (row.validation_rules || row.validation) {
        try {
          stepData.validation_rules = JSON.parse(row.validation_rules || row.validation);
        } catch (e) {
          console.warn(`Failed to parse validation rules for step ${i + 1}:`, e);
        }
      }

      // Validate step data
      const errors = validateStepData(stepData, i + 1);
      if (errors.length > 0) {
        stepErrors.push(...errors);
        continue;
      }

      // Validate group configuration
      if (stepData.group_id) {
        if (!stepData.group_order) {
          stepErrors.push(`Step ${i + 1}: group_order is required when group_id is specified`);
        }
        if (stepData.is_last_in_group) {
          if (!stepData.group_synthesis_prompt || stepData.group_synthesis_prompt.trim() === '') {
            stepErrors.push(`Step ${i + 1}: group_synthesis_prompt is required for the last step in a group`);
          }
          if (!stepData.group_output_variable || stepData.group_output_variable.trim() === '') {
            stepErrors.push(`Step ${i + 1}: group_output_variable is required for the last step in a group`);
          }
        }
      } else {
        // Warn if grouping fields are used without group_id
        if (stepData.group_order || stepData.is_last_in_group || stepData.group_synthesis_prompt || stepData.group_output_variable) {
          stepErrors.push(`Step ${i + 1}: Warning - group configuration fields present but group_id is missing`);
        }
      }

      try {
        await pool.query(`
          INSERT INTO qms_chat_workflow_steps 
          (workflow_template_id, step_order, question_text, input_type, options, validation_rules, 
           conditional_logic, is_required, placeholder_text, help_text,
           group_id, group_order, is_last_in_group, group_synthesis_prompt, group_output_variable,
           created_at, updated_at)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
        `, [
          templateId,
          stepData.step_order,
          stepData.question_text,
          stepData.input_type,
          stepData.options ? JSON.stringify(stepData.options) : null,
          stepData.validation_rules ? JSON.stringify(stepData.validation_rules) : null,
          null, // conditional_logic
          stepData.is_required,
          stepData.placeholder_text,
          stepData.help_text,
          stepData.group_id,
          stepData.group_order,
          stepData.is_last_in_group,
          stepData.group_synthesis_prompt,
          stepData.group_output_variable
        ]);

        steps.push(stepData);
        stepsCreated++;
      } catch (stepError) {
        console.error(`Error creating step ${i + 1}:`, stepError);
        stepErrors.push(`Step ${i + 1}: ${stepError.message}`);
      }
    }

    console.log(`Created ${stepsCreated} steps for workflow ${templateId}`);

    return {
      statusCode: 201,
      headers: setCorsHeaders(),
      body: JSON.stringify({
        success: true,
        message: 'Workflow imported successfully',
        template: {
          id: templateId,
          name: templateData.name,
          stepsCreated: stepsCreated
        },
        warnings: stepErrors.length > 0 ? stepErrors : null
      })
    };

  } catch (error) {
    console.error('Import workflow API error:', error);
    
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

