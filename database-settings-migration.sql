-- System Settings Table
-- This table stores system-wide configuration settings

CREATE TABLE IF NOT EXISTS qms_chat_system_settings (
  id SERIAL PRIMARY KEY,
  setting_key VARCHAR(255) UNIQUE NOT NULL,
  setting_value TEXT NOT NULL,
  setting_type VARCHAR(50) DEFAULT 'boolean', -- 'boolean', 'string', 'number', 'json'
  description TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_qms_chat_system_settings_key 
ON qms_chat_system_settings(setting_key);

-- Insert default settings
INSERT INTO qms_chat_system_settings (setting_key, setting_value, setting_type, description) 
VALUES 
  ('veeva_integration_enabled', 'true', 'boolean', 'Enable or disable Veeva Vault integration')
ON CONFLICT (setting_key) DO NOTHING;

