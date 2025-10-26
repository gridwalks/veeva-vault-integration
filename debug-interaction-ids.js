#!/usr/bin/env node

/**
 * Debug Script for Interaction ID Issue
 * 
 * This script helps debug why interaction IDs are not being stored
 * properly for the thumbs up/down functionality.
 */

import { Pool } from 'pg';

// Database connection
const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

async function debugInteractionIds() {
  console.log('🔍 Debugging interaction ID storage...');
  
  try {
    // Check recent Q&A interactions
    const recentInteractions = await pool.query(`
      SELECT id, question, answer, created_at, user_rating, feedback_notes
      FROM qms_chat_qa_interactions 
      ORDER BY created_at DESC 
      LIMIT 5
    `);
    
    console.log('📊 Recent Q&A interactions:');
    recentInteractions.rows.forEach((row, index) => {
      console.log(`  ${index + 1}. ID: ${row.id}`);
      console.log(`     Question: ${row.question.substring(0, 50)}...`);
      console.log(`     Answer: ${row.answer.substring(0, 50)}...`);
      console.log(`     Created: ${row.created_at}`);
      console.log(`     Rating: ${row.user_rating || 'No rating'}`);
      console.log(`     Feedback: ${row.feedback_notes || 'No feedback'}`);
      console.log('');
    });
    
    // Check if new columns exist
    const columnCheck = await pool.query(`
      SELECT column_name, data_type, is_nullable
      FROM information_schema.columns 
      WHERE table_name = 'qms_chat_qa_interactions' 
      AND column_name IN ('user_rating', 'feedback_notes', 'feedback_submitted_at')
      ORDER BY column_name
    `);
    
    console.log('🗄️ Database schema check:');
    if (columnCheck.rows.length === 0) {
      console.log('  ❌ New feedback columns not found - migration needed');
    } else {
      console.log('  ✅ New feedback columns found:');
      columnCheck.rows.forEach(row => {
        console.log(`     - ${row.column_name}: ${row.data_type} (nullable: ${row.is_nullable})`);
      });
    }
    
    // Test creating a Q&A interaction
    console.log('\n🧪 Testing Q&A interaction creation...');
    const testResult = await pool.query(`
      INSERT INTO qms_chat_qa_interactions 
      (question, answer, document_ids, document_names, user_id, session_id)
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING id, question, answer, created_at
    `, [
      'Debug test question',
      'Debug test answer',
      ['test-doc-1'],
      ['Test Document 1'],
      'debug-user',
      'debug-session'
    ]);
    
    const testId = testResult.rows[0].id;
    console.log(`  ✅ Test interaction created with ID: ${testId}`);
    
    // Test updating feedback if columns exist
    if (columnCheck.rows.length > 0) {
      console.log('\n🧪 Testing feedback update...');
      try {
        const feedbackResult = await pool.query(`
          UPDATE qms_chat_qa_interactions 
          SET user_rating = $1::INTEGER, 
              feedback_notes = $2::TEXT, 
              feedback_submitted_at = CURRENT_TIMESTAMP,
              updated_at = CURRENT_TIMESTAMP
          WHERE id = $3
          RETURNING id, user_rating, feedback_notes, feedback_submitted_at
        `, [1, 'Debug test feedback', testId]);
        
        console.log('  ✅ Feedback update successful:');
        console.log(`     ID: ${feedbackResult.rows[0].id}`);
        console.log(`     Rating: ${feedbackResult.rows[0].user_rating}`);
        console.log(`     Notes: ${feedbackResult.rows[0].feedback_notes}`);
        console.log(`     Submitted: ${feedbackResult.rows[0].feedback_submitted_at}`);
      } catch (feedbackError) {
        console.log('  ❌ Feedback update failed:', feedbackError.message);
      }
    }
    
    // Clean up test data
    await pool.query('DELETE FROM qms_chat_qa_interactions WHERE id = $1', [testId]);
    console.log('  🧹 Test data cleaned up');
    
    console.log('\n💡 Debugging tips:');
    console.log('  1. Check browser console for "Storing interaction ID" messages');
    console.log('  2. Verify the API response includes the ID field');
    console.log('  3. Check if messageIndex is being passed correctly');
    console.log('  4. Ensure the interactionIds Map is being updated');
    
  } catch (error) {
    console.error('❌ Debug failed:', error.message);
    console.error('Stack trace:', error.stack);
  } finally {
    await pool.end();
  }
}

// Check if DATABASE_URL is set
if (!process.env.DATABASE_URL) {
  console.error('❌ Error: DATABASE_URL environment variable is not set');
  process.exit(1);
}

// Run the debug
debugInteractionIds().catch(error => {
  console.error('❌ Unexpected error:', error);
  process.exit(1);
});
