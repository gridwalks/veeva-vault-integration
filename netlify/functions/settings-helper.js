import { getPool } from './db.js';

/**
 * Get a system setting value
 * @param {string} settingKey - The setting key to retrieve
 * @param {any} defaultValue - Default value if setting not found
 * @returns {Promise<any>} - The setting value
 */
export async function getSystemSetting(settingKey, defaultValue = null) {
  try {
    const pool = getPool();
    
    // Ensure settings table exists
    await ensureSettingsTable(pool);
    
    const result = await pool.query(
      'SELECT setting_value, setting_type FROM qms_chat_system_settings WHERE setting_key = $1',
      [settingKey]
    );
    
    if (result.rows.length === 0) {
      return defaultValue;
    }
    
    const row = result.rows[0];
    return parseSettingValue(row.setting_value, row.setting_type);
  } catch (error) {
    console.error(`Error getting system setting ${settingKey}:`, error);
    return defaultValue;
  }
}

/**
 * Check if Veeva integration is enabled
 * @returns {Promise<boolean>} - True if Veeva integration is enabled
 */
export async function isVeevaIntegrationEnabled() {
  return await getSystemSetting('veeva_integration_enabled', true);
}

/**
 * Ensure settings table exists
 */
async function ensureSettingsTable(pool) {
  try {
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

    // Insert default settings if they don't exist
    await pool.query(`
      INSERT INTO qms_chat_system_settings (setting_key, setting_value, setting_type, description) 
      VALUES ('veeva_integration_enabled', 'true', 'boolean', 'Enable or disable Veeva Vault integration')
      ON CONFLICT (setting_key) DO NOTHING
    `);
  } catch (error) {
    console.error('Error ensuring settings table exists:', error);
    // Don't throw - let the query proceed and fail gracefully if table doesn't exist
    // This allows the function to continue even if table creation fails
  }
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

