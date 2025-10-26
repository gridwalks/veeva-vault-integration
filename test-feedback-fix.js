#!/usr/bin/env node

/**
 * Test Script for Feedback System Fix
 * 
 * This script tests the Q&A interaction creation to ensure
 * it works both with and without the database migration.
 */

import { Pool } from 'pg';

// Database connection
const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

async function testQAInteraction() {
  console.log('🧪 Testing Q&A interaction creation...');
  
  try {
    // Test data
    const testData = {
      question: 'Test question for feedback system',
      answer: 'Test answer to verify the system works',
      document_ids: ['test-doc-1', 'test-doc-2'],
      document_names: ['Test Document 1', 'Test Document 2'],
      user_id: 'test-user-123',
      session_id: 'test-session-456',
      user_rating: null,
      feedback_notes: null
    };
    
    console.log('📝 Test data:', testData);
    
    // Test the query that was failing
    const result = await pool.query(`
      INSERT INTO qms_chat_qa_interactions 
      (question, answer, document_ids, document_names, user_id, session_id)
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING *
    `, [
      testData.question,
      testData.answer,
      testData.document_ids,
      testData.document_names,
      testData.user_id,
      testData.session_id
    ]);
    
    console.log('✅ Q&A interaction created successfully!');
    console.log('📊 Created record:', {
      id: result.rows[0].id,
      question: result.rows[0].question.substring(0, 50) + '...',
      answer: result.rows[0].answer.substring(0, 50) + '...',
      created_at: result.rows[0].created_at
    });
    
    // Test if new columns exist
    const columnCheck = await pool.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'qms_chat_qa_interactions' 
      AND column_name IN ('user_rating', 'feedback_notes', 'feedback_submitted_at')
    `);
    
    console.log('🔍 Column check result:', {
      foundColumns: columnCheck.rows.map(r => r.column_name),
      hasNewColumns: columnCheck.rows.length >= 3
    });
    
    if (columnCheck.rows.length >= 3) {
      console.log('✅ New columns exist - full feedback functionality available');
      
      // Test feedback update
      const feedbackResult = await pool.query(`
        UPDATE qms_chat_qa_interactions 
        SET user_rating = $1::INTEGER, 
            feedback_notes = $2::TEXT, 
            feedback_submitted_at = CURRENT_TIMESTAMP,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = $3
        RETURNING *
      `, [1, 'Test feedback', result.rows[0].id]);
      
      console.log('✅ Feedback update successful!');
      console.log('📊 Updated record:', {
        id: feedbackResult.rows[0].id,
        user_rating: feedbackResult.rows[0].user_rating,
        feedback_notes: feedbackResult.rows[0].feedback_notes,
        feedback_submitted_at: feedbackResult.rows[0].feedback_submitted_at
      });
    } else {
      console.log('⚠️  New columns not found - feedback functionality limited');
      console.log('💡 Run the database migration to enable full functionality');
    }
    
    // Clean up test data
    await pool.query('DELETE FROM qms_chat_qa_interactions WHERE id = $1', [result.rows[0].id]);
    console.log('🧹 Test data cleaned up');
    
    console.log('🎉 Test completed successfully!');
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
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

// Run the test
testQAInteraction().catch(error => {
  console.error('❌ Unexpected error:', error);
  process.exit(1);
});
