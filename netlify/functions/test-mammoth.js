import mammoth from 'mammoth';

export const handler = async (event) => {
  console.log('=== TESTING MAMMOTH ===');
  
  try {
    // Create a simple test DOCX buffer (this is just a test)
    const testBuffer = Buffer.from('PK\x03\x04\x14\x00\x00\x00\x08\x00\x00\x00', 'binary');
    
    console.log('Testing mammoth with test buffer...');
    console.log('Buffer length:', testBuffer.length);
    console.log('Buffer first 10 bytes:', Array.from(testBuffer.slice(0, 10)).map(b => b.toString(16).padStart(2, '0')).join(' '));
    
    const result = await mammoth.extractRawText({ buffer: testBuffer });
    
    console.log('Mammoth result:', {
      textLength: result.value.length,
      text: result.value.substring(0, 200),
      messages: result.messages
    });
    
    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        success: true,
        result: {
          textLength: result.value.length,
          text: result.value.substring(0, 200),
          messages: result.messages
        },
        timestamp: new Date().toISOString()
      }),
    };
  } catch (error) {
    console.error('Mammoth test failed:', error);
    
    return {
      statusCode: 500,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        error: error.message,
        timestamp: new Date().toISOString()
      }),
    };
  }
};
