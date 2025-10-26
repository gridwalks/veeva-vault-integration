#!/usr/bin/env node

/**
 * Database Migration Runner for Feedback System
 * 
 * This script runs the database migration to add feedback columns
 * to the qms_chat_qa_interactions table.
 * 
 * Usage: node run-feedback-migration.js
 */

import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { Pool } from 'pg';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Database connection
const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

async function runMigration() {
  console.log('🚀 Starting feedback system database migration...');
  
  try {
    // Read the migration file
    const migrationSQL = readFileSync(join(__dirname, 'database-migration-feedback-system.sql'), 'utf8');
    
    // Split by semicolon and filter out empty statements
    const statements = migrationSQL
      .split(';')
      .map(stmt => stmt.trim())
      .filter(stmt => stmt.length > 0 && !stmt.startsWith('--'));
    
    console.log(`📝 Found ${statements.length} SQL statements to execute`);
    
    // Execute each statement
    for (let i = 0; i < statements.length; i++) {
      const statement = statements[i];
      console.log(`⚡ Executing statement ${i + 1}/${statements.length}...`);
      
      try {
        await pool.query(statement);
        console.log(`✅ Statement ${i + 1} executed successfully`);
      } catch (error) {
        if (error.message.includes('already exists') || error.message.includes('does not exist')) {
          console.log(`⚠️  Statement ${i + 1} skipped (already applied or not applicable): ${error.message}`);
        } else {
          throw error;
        }
      }
    }
    
    // Verify the migration
    console.log('🔍 Verifying migration...');
    const verification = await pool.query(`
      SELECT 
        column_name, 
        data_type, 
        is_nullable, 
        column_default
      FROM information_schema.columns 
      WHERE table_name = 'qms_chat_qa_interactions' 
        AND column_name IN ('user_rating', 'feedback_notes', 'feedback_submitted_at')
      ORDER BY column_name
    `);
    
    if (verification.rows.length === 3) {
      console.log('✅ Migration verification successful!');
      console.log('📊 New columns added:');
      verification.rows.forEach(row => {
        console.log(`   - ${row.column_name}: ${row.data_type} (nullable: ${row.is_nullable})`);
      });
    } else {
      console.log('❌ Migration verification failed - not all columns were created');
      console.log('Found columns:', verification.rows.map(r => r.column_name));
    }
    
    console.log('🎉 Feedback system database migration completed successfully!');
    console.log('💡 You can now use the thumbs up/down functionality in the chat interface.');
    
  } catch (error) {
    console.error('❌ Migration failed:', error.message);
    console.error('Stack trace:', error.stack);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

// Check if DATABASE_URL is set
if (!process.env.DATABASE_URL) {
  console.error('❌ Error: DATABASE_URL environment variable is not set');
  console.error('Please set your database connection string:');
  console.error('export DATABASE_URL="postgresql://username:password@hostname:5432/database"');
  process.exit(1);
}

// Run the migration
runMigration().catch(error => {
  console.error('❌ Unexpected error:', error);
  process.exit(1);
});
