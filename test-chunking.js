import { chunkText, validateChunks } from './netlify/functions/chunking-utils.js';

console.log('Testing chunking with larger text...');

const testText = `This is paragraph one. It contains some text that should be processed.

This is paragraph two. It has different content and should be in a separate chunk if the token limit is small enough.

This is paragraph three. It is much longer and contains more detailed information that might need to be split across multiple chunks depending on the configuration.

This is paragraph four. It has different content again.

This is paragraph five. It is also quite long and contains detailed information that should be processed correctly by the chunking algorithm.

This is paragraph six. It has more content.

This is paragraph seven. It is the final paragraph in this test document.`;

console.log('Original text length:', testText.length);

// Test with small chunk size to force multiple chunks
const chunks = chunkText(testText, 50, 10);
console.log('Chunks created:', chunks.length);

chunks.forEach((c, i) => {
  console.log(`Chunk ${i}: length=${c.text.length}, tokens=${c.tokenCount}`);
  console.log(`Preview: "${c.text.substring(0, 80)}..."`);
  console.log('---');
});

const validated = validateChunks(chunks);
console.log('Validated chunks:', validated.length);

// Test with different parameters
console.log('\n=== Testing with different parameters ===');
const chunks2 = chunkText(testText, 100, 20);
console.log('Chunks with 100 tokens, 20 overlap:', chunks2.length);

const chunks3 = chunkText(testText, 200, 50);
console.log('Chunks with 200 tokens, 50 overlap:', chunks3.length);
