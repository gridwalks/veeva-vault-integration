export const handler = async (event) => {
  console.log('=== TEST UPLOAD ===');
  console.log('Test upload request received:', {
    method: event.httpMethod,
    contentType: event.headers['content-type'],
    bodyLength: event.body?.length || 0,
    timestamp: new Date().toISOString()
  });

  try {
    // Simple test response
    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      },
      body: JSON.stringify({
        success: true,
        message: 'Test upload function working',
        timestamp: new Date().toISOString(),
        requestInfo: {
          method: event.httpMethod,
          contentType: event.headers['content-type'],
          bodyLength: event.body?.length || 0
        }
      })
    };

  } catch (error) {
    console.error('Test upload error:', error);
    
    return {
      statusCode: 500,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      },
      body: JSON.stringify({
        success: false,
        error: 'Test upload failed',
        details: error.message
      })
    };
  }
};
