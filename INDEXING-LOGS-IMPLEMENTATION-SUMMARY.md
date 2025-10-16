# Document Indexing/Regeneration Logging Implementation

## Overview
This implementation adds comprehensive logging for all document indexing and regeneration activities in the Veeva Vault Integration system. The logging system tracks which documents were processed, their status, processing duration, and other relevant metadata.

## Features Implemented

### 1. Database Schema
- **New Table**: `qms_chat_indexing_logs`
- **Purpose**: Stores detailed logs of all indexing and regeneration activities
- **Key Fields**:
  - `operation_type`: Type of operation (index, regenerate, force_regenerate, upload)
  - `source_type`: Source of document (veeva, upload, external)
  - `status`: Processing status (success, error, skipped, timeout)
  - `processing_duration_ms`: Time taken to process the document
  - `chunks_created`: Number of chunks created/updated
  - `summary_generated`: Whether AI summary was generated
  - `batch_id`: Groups documents processed in the same batch
  - `error_message`: Error details if processing failed

### 2. Logging Integration

#### Veeva Document Indexing (`netlify/functions/index-documents.js`)
- Added `logIndexingActivity()` helper function
- Logs all document processing activities:
  - **New documents**: Logged as 'index' operation with 'success' status
  - **Updated documents**: Logged as 'regenerate' or 'force_regenerate' operation
  - **Unchanged documents**: Logged as 'index' operation with 'skipped' status
  - **Failed documents**: Logged as 'index' operation with 'error' status
- Tracks processing duration, chunks created, and summary generation
- Groups related operations by batch ID

#### Uploaded Document Processing (`netlify/functions/blob-upload.js`)
- Added logging for uploaded document processing
- Logs successful uploads, text extraction, and chunking
- Tracks errors during processing
- Uses 'upload' operation type and 'upload' source type

### 3. Admin Interface

#### New API Endpoint (`netlify/functions/get-indexing-logs.js`)
- Fetches indexing logs with filtering and pagination
- Supports filters by:
  - Operation type (index, regenerate, force_regenerate, upload)
  - Source type (veeva, upload, external)
  - Status (success, error, skipped, timeout)
  - Batch ID
  - Date range
- Returns statistics and pagination information

#### New React Component (`src/components/IndexingLogs.jsx`)
- Comprehensive log viewer with filtering capabilities
- Statistics dashboard showing processing metrics
- Real-time log display with status indicators
- Pagination for large log sets
- Color-coded status and operation type indicators

#### Admin Screen Integration (`src/components/AdminScreen.jsx`)
- Added "Indexing Logs" tab to admin interface
- Integrated with existing admin functionality

### 4. Log Management

#### Cleanup Functionality (`netlify/functions/cleanup-indexing-logs.js`)
- Automated log cleanup based on retention policy
- Configurable retention period (default: 30 days)
- Dry-run capability to preview cleanup operations
- Safe deletion with confirmation

#### Log Retention UI
- Admin interface for managing log retention
- Preview cleanup operations before execution
- Configurable retention period
- Real-time cleanup statistics

## Usage

### Viewing Logs
1. Navigate to Admin Screen
2. Click "Indexing Logs" tab
3. Use filters to narrow down results
4. View detailed processing information for each document

### Log Cleanup
1. In the Indexing Logs tab, scroll to "Log Cleanup" section
2. Set retention period (days)
3. Click "Preview Cleanup" to see what would be deleted
4. Click "Cleanup Logs" to perform actual cleanup

### API Usage
```javascript
// Fetch logs with filters
const logs = await getIndexingLogs({
  limit: 50,
  offset: 0,
  operationType: 'index',
  sourceType: 'veeva',
  status: 'success'
});

// Cleanup old logs
const result = await cleanupIndexingLogs({
  retentionDays: 30,
  dryRun: true
});
```

## Database Migration
Run the following SQL to create the logging table:
```sql
-- Execute the contents of database-migration-indexing-logs.sql
```

## Benefits

1. **Audit Trail**: Complete record of all document processing activities
2. **Performance Monitoring**: Track processing times and identify bottlenecks
3. **Error Tracking**: Detailed error logging for troubleshooting
4. **Batch Tracking**: Group related operations for better organization
5. **Compliance**: Maintain logs for regulatory requirements
6. **Analytics**: Statistics for system performance analysis

## Technical Details

- **Logging Function**: Non-blocking - errors in logging don't affect main processing
- **Batch Processing**: Groups related operations for better organization
- **Performance**: Indexed database queries for fast log retrieval
- **Scalability**: Pagination and filtering for large log volumes
- **Retention**: Configurable cleanup to manage storage

## Files Modified/Created

### New Files
- `database-migration-indexing-logs.sql` - Database schema
- `netlify/functions/get-indexing-logs.js` - API endpoint
- `netlify/functions/cleanup-indexing-logs.js` - Cleanup function
- `src/components/IndexingLogs.jsx` - React component
- `INDEXING-LOGS-IMPLEMENTATION-SUMMARY.md` - This summary

### Modified Files
- `netlify/functions/index-documents.js` - Added logging
- `netlify/functions/blob-upload.js` - Added logging
- `src/api.js` - Added API functions
- `src/components/AdminScreen.jsx` - Added logs tab

## Future Enhancements

1. **Real-time Notifications**: Alert on processing errors
2. **Export Functionality**: Export logs to CSV/Excel
3. **Advanced Analytics**: Processing trends and performance metrics
4. **Automated Cleanup**: Scheduled log cleanup jobs
5. **Log Archiving**: Move old logs to cold storage
