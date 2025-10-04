export const handler = async (event) => {
  console.log('=== SIMPLE INDEX TEST ===');
  console.log('Simple index test...', {
    timestamp: new Date().toISOString(),
    queryParams: Object.fromEntries(new URL(event.rawUrl).searchParams)
  });

  try {
    // Simulate the response structure
    const mockResponse = {
      total: 5,
      processed: 5,
      duration: 1234,
      stats: {
        created: 3,
        updated: 1,
        unchanged: 1,
        errors: 0
      },
      results: [
        {
          action: 'created',
          document: {
            veeva_document_id: 'test-123',
            document_number: 'DOC-001',
            document_name: 'Test Document 1',
            major_version: 1,
            minor_version: 0,
            document_type: 'SOP',
            status: 'STEADYSTATE'
          },
          summary: 'This is a test summary'
        }
      ]
    };

    console.log('Mock response:', mockResponse);

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(mockResponse),
    };

  } catch (error) {
    console.error('=== SIMPLE INDEX TEST ERROR ===');
    console.error('Simple index test error:', {
      message: error.message,
      stack: error.stack,
      timestamp: new Date().toISOString()
    });

    return {
      statusCode: 500,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        success: false,
        error: error.message,
        stack: error.stack,
        timestamp: new Date().toISOString()
      }),
    };
  }
};
