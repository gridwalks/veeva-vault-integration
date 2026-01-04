import { getPool, initDatabase } from "./db.js";

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

export const handler = async (event) => {
  console.log('=== WEB RESOURCES API ===');
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
    await initDatabase();
    const pool = getPool();

    const pathParts = event.path.split('/').filter(part => part);
    const resourceId = pathParts[pathParts.length - 1];

    switch (event.httpMethod) {
      case 'GET':
        if (resourceId && resourceId !== 'web-resources') {
          // Get single resource
          return await getResource(resourceId, pool);
        } else {
          // Get all resources with optional filtering
          return await getAllResources(event.queryStringParameters, pool);
        }

      case 'POST':
        return await createResource(event.body, pool);

      case 'PUT':
        if (!resourceId || resourceId === 'web-resources') {
          return {
            statusCode: 400,
            headers: setCorsHeaders(),
            body: JSON.stringify({
              success: false,
              error: 'Resource ID is required for PUT requests'
            })
          };
        }
        return await updateResource(resourceId, event.body, pool);

      case 'DELETE':
        if (!resourceId || resourceId === 'web-resources') {
          return {
            statusCode: 400,
            headers: setCorsHeaders(),
            body: JSON.stringify({
              success: false,
              error: 'Resource ID is required for DELETE requests'
            })
          };
        }
        return await deleteResource(resourceId, pool);

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
    console.error('Web resources API error:', error);
    
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

// Get all web resources with optional filtering
async function getAllResources(queryParams, pool) {
  try {
    console.log('Fetching web resources with filters:', queryParams);
    
    let query = `
      SELECT 
        wr.id,
        wr.source_url,
        wr.title,
        wr.source_type,
        wr.domain,
        wr.full_text,
        wr.ai_summary,
        wr.extraction_method,
        wr.scraped_at,
        wr.updated_at,
        wr.last_checked_at,
        wr.status,
        COUNT(DISTINCT wrl.regulation_id) as linked_regulation_count
      FROM cfr_title21_web_resources wr
      LEFT JOIN cfr_title21_web_resource_links wrl ON wr.id = wrl.web_resource_id
      WHERE 1=1
    `;
    
    const params = [];
    let paramIndex = 1;

    // Filter by source_type
    if (queryParams?.source_type) {
      query += ` AND wr.source_type = $${paramIndex}`;
      params.push(queryParams.source_type);
      paramIndex++;
    }

    // Filter by regulation_id (via links)
    if (queryParams?.regulation_id) {
      query += ` AND wrl.regulation_id = $${paramIndex}`;
      params.push(parseInt(queryParams.regulation_id));
      paramIndex++;
    }

    // Filter by status
    if (queryParams?.status) {
      query += ` AND wr.status = $${paramIndex}`;
      params.push(queryParams.status);
      paramIndex++;
    }

    // Filter by domain
    if (queryParams?.domain) {
      query += ` AND wr.domain = $${paramIndex}`;
      params.push(queryParams.domain);
      paramIndex++;
    }

    query += `
      GROUP BY wr.id
      ORDER BY wr.scraped_at DESC
    `;

    // Add limit if specified
    if (queryParams?.limit) {
      query += ` LIMIT $${paramIndex}`;
      params.push(parseInt(queryParams.limit));
    } else {
      query += ` LIMIT 100`; // Default limit
    }

    const result = await pool.query(query, params);

    console.log(`Found ${result.rows.length} web resources`);

    return {
      statusCode: 200,
      headers: setCorsHeaders(),
      body: JSON.stringify({
        success: true,
        resources: result.rows.map(row => ({
          id: row.id,
          sourceUrl: row.source_url,
          title: row.title,
          sourceType: row.source_type,
          domain: row.domain,
          fullText: row.full_text ? row.full_text.substring(0, 500) + '...' : null, // Preview only
          aiSummary: row.ai_summary,
          extractionMethod: row.extraction_method,
          scrapedAt: row.scraped_at,
          updatedAt: row.updated_at,
          lastCheckedAt: row.last_checked_at,
          status: row.status,
          linkedRegulationCount: parseInt(row.linked_regulation_count) || 0
        })),
        count: result.rows.length
      })
    };
  } catch (error) {
    console.error('Error fetching web resources:', error);
    throw error;
  }
}

// Get single web resource
async function getResource(resourceId, pool) {
  try {
    console.log(`Fetching web resource with ID: ${resourceId}`);
    
    const result = await pool.query(`
      SELECT 
        wr.*,
        COALESCE(
          json_agg(
            json_build_object(
              'id', r.id,
              'regulationId', r.regulation_id,
              'title', r.title,
              'linkType', wrl.link_type
            )
          ) FILTER (WHERE r.id IS NOT NULL),
          '[]'::json
        ) as linked_regulations
      FROM cfr_title21_web_resources wr
      LEFT JOIN cfr_title21_web_resource_links wrl ON wr.id = wrl.web_resource_id
      LEFT JOIN cfr_title21_regulations r ON wrl.regulation_id = r.id
      WHERE wr.id = $1
      GROUP BY wr.id
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
          sourceUrl: resource.source_url,
          title: resource.title,
          sourceType: resource.source_type,
          domain: resource.domain,
          fullText: resource.full_text,
          aiSummary: resource.ai_summary,
          extractionMethod: resource.extraction_method,
          scrapedAt: resource.scraped_at,
          updatedAt: resource.updated_at,
          lastCheckedAt: resource.last_checked_at,
          status: resource.status,
          linkedRegulations: resource.linked_regulations || []
        }
      })
    };
  } catch (error) {
    console.error(`Error fetching web resource ${resourceId}:`, error);
    throw error;
  }
}

// Create new web resource (metadata only, actual scraping done via scrape-web-resources)
async function createResource(requestBody, pool) {
  try {
    console.log('Creating new web resource...');
    
    const data = JSON.parse(requestBody);
    
    if (!data.source_url || !isValidUrl(data.source_url)) {
      return {
        statusCode: 400,
        headers: setCorsHeaders(),
        body: JSON.stringify({
          success: false,
          error: 'Valid source_url is required'
        })
      };
    }

    // Check if resource already exists
    const existingResult = await pool.query(
      'SELECT id FROM cfr_title21_web_resources WHERE source_url = $1',
      [data.source_url]
    );

    if (existingResult.rows.length > 0) {
      return {
        statusCode: 409,
        headers: setCorsHeaders(),
        body: JSON.stringify({
          success: false,
          error: 'A resource with this URL already exists',
          resourceId: existingResult.rows[0].id
        })
      };
    }

    // Extract domain
    let domain = null;
    try {
      const urlObj = new URL(data.source_url);
      domain = urlObj.hostname.replace('www.', '');
    } catch (e) {
      // Domain extraction failed, but URL is valid
    }

    // Insert new resource (without content - scraping will populate it)
    const result = await pool.query(`
      INSERT INTO cfr_title21_web_resources 
      (source_url, title, source_type, domain, status)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING id, source_url, title, source_type, domain, status, scraped_at, updated_at
    `, [
      data.source_url.trim(),
      data.title || data.source_url,
      data.source_type || null,
      domain,
      'pending' // Status will be updated when scraping completes
    ]);

    const newResource = result.rows[0];

    console.log(`Created web resource with ID: ${newResource.id}`);

    return {
      statusCode: 201,
      headers: setCorsHeaders(),
      body: JSON.stringify({
        success: true,
        message: 'Resource created successfully. Use scrape-web-resources endpoint to scrape content.',
        resource: {
          id: newResource.id,
          sourceUrl: newResource.source_url,
          title: newResource.title,
          sourceType: newResource.source_type,
          domain: newResource.domain,
          status: newResource.status,
          scrapedAt: newResource.scraped_at,
          updatedAt: newResource.updated_at
        }
      })
    };
  } catch (error) {
    console.error('Error creating web resource:', error);
    throw error;
  }
}

// Update existing web resource
async function updateResource(resourceId, requestBody, pool) {
  try {
    console.log(`Updating web resource with ID: ${resourceId}`);
    
    const data = JSON.parse(requestBody);

    // Check if resource exists
    const existingResult = await pool.query(
      'SELECT id FROM cfr_title21_web_resources WHERE id = $1',
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

    // Build update query dynamically based on provided fields
    const updates = [];
    const params = [];
    let paramIndex = 1;

    if (data.title !== undefined) {
      updates.push(`title = $${paramIndex}`);
      params.push(data.title);
      paramIndex++;
    }

    if (data.source_type !== undefined) {
      updates.push(`source_type = $${paramIndex}`);
      params.push(data.source_type);
      paramIndex++;
    }

    if (data.status !== undefined) {
      updates.push(`status = $${paramIndex}`);
      params.push(data.status);
      paramIndex++;
    }

    if (data.ai_summary !== undefined) {
      updates.push(`ai_summary = $${paramIndex}`);
      params.push(data.ai_summary);
      paramIndex++;
    }

    // Always update updated_at
    updates.push(`updated_at = CURRENT_TIMESTAMP`);

    if (updates.length === 1) { // Only updated_at
      return {
        statusCode: 400,
        headers: setCorsHeaders(),
        body: JSON.stringify({
          success: false,
          error: 'No fields to update'
        })
      };
    }

    params.push(resourceId);
    const updateQuery = `
      UPDATE cfr_title21_web_resources 
      SET ${updates.join(', ')}
      WHERE id = $${paramIndex}
      RETURNING id, source_url, title, source_type, domain, status, scraped_at, updated_at
    `;

    const result = await pool.query(updateQuery, params);
    const updatedResource = result.rows[0];

    console.log(`Updated web resource with ID: ${updatedResource.id}`);

    return {
      statusCode: 200,
      headers: setCorsHeaders(),
      body: JSON.stringify({
        success: true,
        message: 'Resource updated successfully',
        resource: {
          id: updatedResource.id,
          sourceUrl: updatedResource.source_url,
          title: updatedResource.title,
          sourceType: updatedResource.source_type,
          domain: updatedResource.domain,
          status: updatedResource.status,
          scrapedAt: updatedResource.scraped_at,
          updatedAt: updatedResource.updated_at
        }
      })
    };
  } catch (error) {
    console.error(`Error updating web resource ${resourceId}:`, error);
    throw error;
  }
}

// Delete web resource
async function deleteResource(resourceId, pool) {
  try {
    console.log(`Deleting web resource with ID: ${resourceId}`);
    
    // Check if resource exists
    const existingResult = await pool.query(
      'SELECT id FROM cfr_title21_web_resources WHERE id = $1',
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

    // Delete resource (cascade will delete chunks and links)
    await pool.query('DELETE FROM cfr_title21_web_resources WHERE id = $1', [resourceId]);

    console.log(`Deleted web resource with ID: ${resourceId}`);

    return {
      statusCode: 200,
      headers: setCorsHeaders(),
      body: JSON.stringify({
        success: true,
        message: 'Resource deleted successfully'
      })
    };
  } catch (error) {
    console.error(`Error deleting web resource ${resourceId}:`, error);
    throw error;
  }
}

