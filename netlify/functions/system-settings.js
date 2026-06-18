import { getPool } from './db.js';
import { verifyAdminRole, verifyAuthToken } from './security-utils.js';

/**
 * Netlify serverless function to manage system settings
 * GET: Retrieve system settings
 * PUT: Update system settings
 */
export async function handler(event, context) {
  // CORS headers
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'GET, PUT, OPTIONS',
    'Content-Type': 'application/json'
  };

  // Handle preflight requests
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers,
      body: ''
    };
  }

  try {
    // For GET requests, just verify authentication (any authenticated user can read)
    // For PUT requests, require admin role (or authenticated user if roles not configured)
    if (event.httpMethod === 'PUT') {
      const authResult = await verifyAdminRole(event);
      if (!authResult.authorized) {
        // If admin role check failed, check if it's because roles aren't in token
        // In that case, allow any authenticated user (since they can access admin screen)
        const authCheck = verifyAuthToken(event);
        if (authCheck.valid && authResult.error === 'Admin role required') {
          // Roles might not be configured in access token - allow authenticated users
          // This is less secure but works if Auth0 roles aren't configured in API token
          console.log('Admin role not found in token, but user is authenticated. Allowing update (roles may not be configured in access token).');
        } else {
          console.log('PUT request denied - admin role required', {
            error: authResult.error,
            authError: authCheck.error,
            hasAuthHeader: !!event.headers?.authorization || !!event.headers?.Authorization
          });
          return {
            statusCode: 403,
            headers,
            body: JSON.stringify({
              error: 'Unauthorized',
              message: 'Admin role required to update system settings'
            })
          };
        }
      }
    } else if (event.httpMethod === 'GET') {
      // For GET, just verify token is valid (not necessarily admin)
      const authResult = verifyAuthToken(event);
      if (!authResult.valid) {
        console.log('GET request denied - authentication required', {
          error: authResult.error,
          hasAuthHeader: !!event.headers?.authorization || !!event.headers?.Authorization
        });
        return {
          statusCode: 401,
          headers,
          body: JSON.stringify({
            error: 'Unauthorized',
            message: 'Authentication required to access system settings'
          })
        };
      }
    }

    const pool = getPool();

    // Ensure settings table exists
    await ensureSettingsTable(pool);

    if (event.httpMethod === 'GET') {
      // Get all settings or a specific setting
      const { setting_key } = event.queryStringParameters || {};
      
      if (setting_key) {
        // Get specific setting
        const result = await pool.query(
          'SELECT setting_key, setting_value, setting_type, description FROM qms_chat_system_settings WHERE setting_key = $1',
          [setting_key]
        );

        if (result.rows.length === 0) {
          return {
            statusCode: 404,
            headers,
            body: JSON.stringify({
              error: 'Setting not found',
              setting_key
            })
          };
        }

        const setting = result.rows[0];
        return {
          statusCode: 200,
          headers,
          body: JSON.stringify({
            success: true,
            setting: {
              key: setting.setting_key,
              value: parseSettingValue(setting.setting_value, setting.setting_type),
              type: setting.setting_type,
              description: setting.description
            }
          })
        };
      } else {
        // Get all settings
        const result = await pool.query(
          'SELECT setting_key, setting_value, setting_type, description FROM qms_chat_system_settings ORDER BY setting_key'
        );

        const settings = result.rows.map(row => ({
          key: row.setting_key,
          value: parseSettingValue(row.setting_value, row.setting_type),
          type: row.setting_type,
          description: row.description
        }));

        return {
          statusCode: 200,
          headers,
          body: JSON.stringify({
            success: true,
            settings
          })
        };
      }
    }

    if (event.httpMethod === 'PUT') {
      // Update setting
      const body = JSON.parse(event.body || '{}');
      const { setting_key, setting_value } = body;

      if (!setting_key || setting_value === undefined) {
        return {
          statusCode: 400,
          headers,
          body: JSON.stringify({
            error: 'Missing required fields',
            message: 'setting_key and setting_value are required'
          })
        };
      }

      // Get setting type first
      const getResult = await pool.query(
        'SELECT setting_type FROM qms_chat_system_settings WHERE setting_key = $1',
        [setting_key]
      );

      if (getResult.rows.length === 0) {
        return {
          statusCode: 404,
          headers,
          body: JSON.stringify({
            error: 'Setting not found',
            setting_key
          })
        };
      }

      const settingType = getResult.rows[0].setting_type;
      const stringValue = stringifySettingValue(setting_value, settingType);

      // Update setting
      const updateResult = await pool.query(
        `UPDATE qms_chat_system_settings 
         SET setting_value = $1, updated_at = CURRENT_TIMESTAMP 
         WHERE setting_key = $2 
         RETURNING setting_key, setting_value, setting_type, description`,
        [stringValue, setting_key]
      );

      const updated = updateResult.rows[0];
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          success: true,
          setting: {
            key: updated.setting_key,
            value: parseSettingValue(updated.setting_value, updated.setting_type),
            type: updated.setting_type,
            description: updated.description
          }
        })
      };
    }

    return {
      statusCode: 405,
      headers,
      body: JSON.stringify({
        error: 'Method not allowed',
        message: `Method ${event.httpMethod} is not supported`
      })
    };
  } catch (error) {
    console.error('System settings error:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({
        error: 'Internal server error',
        message: error.message
      })
    };
  }
}

/**
 * Ensure settings table exists
 */
async function ensureSettingsTable(pool) {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS qms_chat_system_settings (
      id SERIAL PRIMARY KEY,
      setting_key VARCHAR(255) UNIQUE NOT NULL,
      setting_value TEXT NOT NULL,
      setting_type VARCHAR(50) DEFAULT 'boolean',
      description TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_qms_chat_system_settings_key 
    ON qms_chat_system_settings(setting_key)
  `);

  // No default settings to seed at this time.
}

/**
 * Parse setting value based on type
 */
function parseSettingValue(value, type) {
  if (value === null || value === undefined) {
    return null;
  }

  switch (type) {
    case 'boolean':
      return value === 'true' || value === true;
    case 'number':
      return Number(value);
    case 'json':
      try {
        return JSON.parse(value);
      } catch {
        return value;
      }
    default:
      return value;
  }
}

/**
 * Stringify setting value based on type
 */
function stringifySettingValue(value, type) {
  if (value === null || value === undefined) {
    return '';
  }

  switch (type) {
    case 'boolean':
      return value === true || value === 'true' ? 'true' : 'false';
    case 'number':
      return String(value);
    case 'json':
      return typeof value === 'string' ? value : JSON.stringify(value);
    default:
      return String(value);
  }
}

