import { Pool } from 'pg';

const pool = new Pool({
  connectionString: process.env.SUPABASE_DATABASE_URL || process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: true }
});

// Helper function to handle CORS
function setCorsHeaders() {
  return {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'X-Frame-Options': 'DENY',
    'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'self' https://*.auth0.com https://*.auth0.com.au; frame-ancestors 'none'; base-uri 'self'; upgrade-insecure-requests",
    'X-Content-Type-Options': 'nosniff'
  };
}

// Helper function to validate URL
function isValidUrl(string) {
  try {
    new URL(string);
    return true;
  } catch (_) {
    return false;
  }
}

// Helper function to validate resource data
function validateResourceData(data) {
  const errors = [];

  if (!data.title || data.title.trim().length === 0) {
    errors.push('Title is required');
  }

  if (!data.url || data.url.trim().length === 0) {
    errors.push('URL is required');
  } else if (!isValidUrl(data.url)) {
    errors.push('URL must be a valid URL');
  }

  if (data.title && data.title.length > 255) {
    errors.push('Title must be less than 255 characters');
  }

  if (data.description && data.description.length > 1000) {
    errors.push('Description must be less than 1000 characters');
  }

  if (data.category && data.category.length > 100) {
    errors.push('Category must be less than 100 characters');
  }

  return errors;
}

// Helper function to create external_resources table if it doesn't exist
async function createExternalResourcesTable() {
  try {
    console.log('Creating external_resources table...');
    
    await pool.query(`
      CREATE TABLE IF NOT EXISTS qms_chat_external_resources (
        id SERIAL PRIMARY KEY,
        title VARCHAR(255) NOT NULL,
        url TEXT NOT NULL,
        description TEXT,
        category VARCHAR(100),
        tags TEXT[],
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
    
    // Create indexes
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_qms_chat_external_resources_title ON qms_chat_external_resources(title);
      CREATE INDEX IF NOT EXISTS idx_qms_chat_external_resources_category ON qms_chat_external_resources(category);
      CREATE INDEX IF NOT EXISTS idx_qms_chat_external_resources_url ON qms_chat_external_resources(url);
    `);
    
    console.log('external_resources table created successfully');
  } catch (error) {
    console.error('Error creating external_resources table:', error);
    throw error;
  }
}

export const handler = async (event) => {
  console.log('=== EXTERNAL RESOURCES API ===');
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
    const pathParts = event.path.split('/').filter(part => part);
    const resourceId = pathParts[pathParts.length - 1];

    switch (event.httpMethod) {
      case 'GET':
        if (resourceId && resourceId !== 'external-resources') {
          // Get single resource
          return await getResource(resourceId);
        } else {
          // Get all resources
          return await getAllResources();
        }

      case 'POST':
        return await createResource(event.body);

      case 'PUT':
        if (!resourceId || resourceId === 'external-resources') {
          return {
            statusCode: 400,
            headers: setCorsHeaders(),
            body: JSON.stringify({
              success: false,
              error: 'Resource ID is required for PUT requests'
            })
          };
        }
        return await updateResource(resourceId, event.body);

      case 'DELETE':
        if (!resourceId || resourceId === 'external-resources') {
          return {
            statusCode: 400,
            headers: setCorsHeaders(),
            body: JSON.stringify({
              success: false,
              error: 'Resource ID is required for DELETE requests'
            })
          };
        }
        return await deleteResource(resourceId);

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
    console.error('External resources API error:', error);
    
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

// Get all external resources
async function getAllResources() {
  try {
    console.log('Fetching all external resources...');
    
    // First check if table exists
    const tableCheck = await pool.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = 'qms_chat_external_resources'
      );
    `);
    
    const tableExists = tableCheck.rows[0].exists;
    
    if (!tableExists) {
      console.log('external_resources table does not exist, creating it...');
      await createExternalResourcesTable();
    }
    
    const result = await pool.query(`
      SELECT 
        id,
        title,
        url,
        description,
        category,
        tags,
        created_at,
        updated_at
      FROM qms_chat_external_resources 
      ORDER BY created_at DESC
    `);

    console.log(`Found ${result.rows.length} external resources`);

    return {
      statusCode: 200,
      headers: setCorsHeaders(),
      body: JSON.stringify({
        success: true,
        resources: result.rows.map(row => ({
          id: row.id,
          title: row.title,
          url: row.url,
          description: row.description,
          category: row.category,
          tags: row.tags || [],
          createdAt: row.created_at,
          updatedAt: row.updated_at
        }))
      })
    };
  } catch (error) {
    console.error('Error fetching external resources:', error);
    throw error;
  }
}

// Get single external resource
async function getResource(resourceId) {
  try {
    console.log(`Fetching external resource with ID: ${resourceId}`);
    
    const result = await pool.query(`
      SELECT 
        id,
        title,
        url,
        description,
        category,
        tags,
        created_at,
        updated_at
      FROM qms_chat_external_resources 
      WHERE id = $1
    `, [resourceId]);

    if (result.rows.length === 0) {
      return {
        statusCode: 404,
        headers: setCorsHeaders(),
        body: JSON.stringify({
          success: false,
          error: 'Resource not found'
        })
      };
    }

    const resource = result.rows[0];

    return {
      statusCode: 200,
      headers: setCorsHeaders(),
      body: JSON.stringify({
        success: true,
        resource: {
          id: resource.id,
          title: resource.title,
          url: resource.url,
          description: resource.description,
          category: resource.category,
          tags: resource.tags || [],
          createdAt: resource.created_at,
          updatedAt: resource.updated_at
        }
      })
    };
  } catch (error) {
    console.error(`Error fetching external resource ${resourceId}:`, error);
    throw error;
  }
}

// Create new external resource
async function createResource(requestBody) {
  try {
    console.log('Creating new external resource...');
    
    const data = JSON.parse(requestBody);
    
    // Validate input data
    const validationErrors = validateResourceData(data);
    if (validationErrors.length > 0) {
      return {
        statusCode: 400,
        headers: setCorsHeaders(),
        body: JSON.stringify({
          success: false,
          error: 'Validation failed',
          details: validationErrors
        })
      };
    }

    // Ensure table exists
    const tableCheck = await pool.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = 'qms_chat_external_resources'
      );
    `);
    
    if (!tableCheck.rows[0].exists) {
      await createExternalResourcesTable();
    }

    // Check if resource with same URL already exists
    const existingResult = await pool.query(
      'SELECT id FROM qms_chat_external_resources WHERE url = $1',
      [data.url]
    );

    if (existingResult.rows.length > 0) {
      return {
        statusCode: 409,
        headers: setCorsHeaders(),
        body: JSON.stringify({
          success: false,
          error: 'A resource with this URL already exists'
        })
      };
    }

    // Insert new resource
    const result = await pool.query(`
      INSERT INTO qms_chat_external_resources 
      (title, url, description, category, tags, created_at, updated_at)
      VALUES ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      RETURNING id, title, url, description, category, tags, created_at, updated_at
    `, [
      data.title.trim(),
      data.url.trim(),
      data.description ? data.description.trim() : null,
      data.category ? data.category.trim() : null,
      data.tags && Array.isArray(data.tags) ? data.tags : []
    ]);

    const newResource = result.rows[0];

    console.log(`Created external resource with ID: ${newResource.id}`);

    return {
      statusCode: 201,
      headers: setCorsHeaders(),
      body: JSON.stringify({
        success: true,
        message: 'Resource created successfully',
        resource: {
          id: newResource.id,
          title: newResource.title,
          url: newResource.url,
          description: newResource.description,
          category: newResource.category,
          tags: newResource.tags || [],
          createdAt: newResource.created_at,
          updatedAt: newResource.updated_at
        }
      })
    };
  } catch (error) {
    console.error('Error creating external resource:', error);
    throw error;
  }
}

// Update existing external resource
async function updateResource(resourceId, requestBody) {
  try {
    console.log(`Updating external resource with ID: ${resourceId}`);
    
    const data = JSON.parse(requestBody);
    
    // Validate input data
    const validationErrors = validateResourceData(data);
    if (validationErrors.length > 0) {
      return {
        statusCode: 400,
        headers: setCorsHeaders(),
        body: JSON.stringify({
          success: false,
          error: 'Validation failed',
          details: validationErrors
        })
      };
    }

    // Check if resource exists
    const existingResult = await pool.query(
      'SELECT id FROM qms_chat_external_resources WHERE id = $1',
      [resourceId]
    );

    if (existingResult.rows.length === 0) {
      return {
        statusCode: 404,
        headers: setCorsHeaders(),
        body: JSON.stringify({
          success: false,
          error: 'Resource not found'
        })
      };
    }

    // Check if another resource with same URL already exists
    const duplicateResult = await pool.query(
      'SELECT id FROM qms_chat_external_resources WHERE url = $1 AND id != $2',
      [data.url, resourceId]
    );

    if (duplicateResult.rows.length > 0) {
      return {
        statusCode: 409,
        headers: setCorsHeaders(),
        body: JSON.stringify({
          success: false,
          error: 'A resource with this URL already exists'
        })
      };
    }

    // Update resource
    const result = await pool.query(`
      UPDATE qms_chat_external_resources 
      SET 
        title = $1,
        url = $2,
        description = $3,
        category = $4,
        tags = $5,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = $6
      RETURNING id, title, url, description, category, tags, created_at, updated_at
    `, [
      data.title.trim(),
      data.url.trim(),
      data.description ? data.description.trim() : null,
      data.category ? data.category.trim() : null,
      data.tags && Array.isArray(data.tags) ? data.tags : [],
      resourceId
    ]);

    const updatedResource = result.rows[0];

    console.log(`Updated external resource with ID: ${updatedResource.id}`);

    return {
      statusCode: 200,
      headers: setCorsHeaders(),
      body: JSON.stringify({
        success: true,
        message: 'Resource updated successfully',
        resource: {
          id: updatedResource.id,
          title: updatedResource.title,
          url: updatedResource.url,
          description: updatedResource.description,
          category: updatedResource.category,
          tags: updatedResource.tags || [],
          createdAt: updatedResource.created_at,
          updatedAt: updatedResource.updated_at
        }
      })
    };
  } catch (error) {
    console.error(`Error updating external resource ${resourceId}:`, error);
    throw error;
  }
}

// Delete external resource
async function deleteResource(resourceId) {
  try {
    console.log(`Deleting external resource with ID: ${resourceId}`);
    
    // Check if resource exists
    const existingResult = await pool.query(
      'SELECT id FROM qms_chat_external_resources WHERE id = $1',
      [resourceId]
    );

    if (existingResult.rows.length === 0) {
      return {
        statusCode: 404,
        headers: setCorsHeaders(),
        body: JSON.stringify({
          success: false,
          error: 'Resource not found'
        })
      };
    }

    // Delete resource
    await pool.query('DELETE FROM qms_chat_external_resources WHERE id = $1', [resourceId]);

    console.log(`Deleted external resource with ID: ${resourceId}`);

    return {
      statusCode: 200,
      headers: setCorsHeaders(),
      body: JSON.stringify({
        success: true,
        message: 'Resource deleted successfully'
      })
    };
  } catch (error) {
    console.error(`Error deleting external resource ${resourceId}:`, error);
    throw error;
  }
}
