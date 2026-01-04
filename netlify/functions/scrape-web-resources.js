import { getPool, initDatabase } from "./db.js";
import { OpenAI } from "openai";
import { chunkText, validateChunks } from './chunking-utils.js';
import { extractTextFromHTMLStructured } from './html-extraction-utils.js';

// Validate OpenAI API key
if (!process.env.OPENAI_API_KEY) {
  console.warn('⚠️ OPENAI_API_KEY environment variable is not set. Embeddings will fail.');
}

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Function to download HTML content from URL
async function downloadHTMLContent(url) {
  try {
    console.log(`Downloading content from: ${url}`);
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000); // 30 second timeout
    
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
        'Connection': 'keep-alive',
        'Upgrade-Insecure-Requests': '1'
      },
      signal: controller.signal
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      const errorText = await response.text().catch(() => '');
      let errorMessage = `HTTP ${response.status}: ${response.statusText}`;
      
      // Provide more helpful error messages for common HTTP errors
      if (response.status === 404) {
        errorMessage = `Page not found (404). The URL may be incorrect, the page may have been moved, or it may require authentication. Please verify the URL is correct and accessible.`;
      } else if (response.status === 403) {
        errorMessage = `Access forbidden (403). The website may require authentication or may be blocking automated access.`;
      } else if (response.status === 401) {
        errorMessage = `Unauthorized (401). The website requires authentication to access this content.`;
      } else if (response.status >= 500) {
        errorMessage = `Server error (${response.status}). The website's server encountered an error. Please try again later.`;
      }
      
      throw new Error(errorMessage);
    }

    const htmlContent = await response.text();
    console.log(`Downloaded ${htmlContent.length} characters from ${url}`);
    
    if (htmlContent.length < 100) {
      throw new Error(`Downloaded content too short (${htmlContent.length} chars). May be an error page.`);
    }
    
    return htmlContent;
  } catch (error) {
    if (error.name === 'AbortError') {
      throw new Error(`Download timeout after 30 seconds`);
    }
    console.error(`Error downloading from ${url}:`, error.message);
    throw error;
  }
}

// Extract title from HTML
function extractTitleFromHTML(htmlContent) {
  try {
    // Try to find title in <title> tag
    const titleMatch = htmlContent.match(/<title[^>]*>([^<]+)<\/title>/i);
    if (titleMatch && titleMatch[1]) {
      return titleMatch[1].trim();
    }
    
    // Try to find title in <h1> tag
    const h1Match = htmlContent.match(/<h1[^>]*>([^<]+)<\/h1>/i);
    if (h1Match && h1Match[1]) {
      return h1Match[1].trim();
    }
    
    // Fallback: use URL
    return null;
  } catch (error) {
    console.error('Error extracting title:', error);
    return null;
  }
}

// Extract domain from URL
function extractDomain(url) {
  try {
    const urlObj = new URL(url);
    return urlObj.hostname.replace('www.', '');
  } catch (error) {
    console.error('Error extracting domain:', error);
    return null;
  }
}

// Function to chunk and embed web resource text
async function chunkAndEmbedWebResource(resourceText, webResourceId, pool, startTime = Date.now()) {
  const MAX_CHUNK_PROCESSING_TIME = 50000;
  try {
    // Validate input text
    if (!resourceText || typeof resourceText !== 'string') {
      const errorMsg = `Invalid resource text: ${resourceText === null ? 'null' : resourceText === undefined ? 'undefined' : typeof resourceText}`;
      console.error(`❌ ${errorMsg} for web resource ${webResourceId}`);
      return { 
        success: false, 
        chunksCreated: 0,
        error: errorMsg
      };
    }

    const trimmedText = resourceText.trim();
    if (trimmedText.length < 20) {
      const errorMsg = `Resource text too short (${trimmedText.length} chars after trimming). Minimum 20 characters required.`;
      console.error(`❌ ${errorMsg} for web resource ${webResourceId}`);
      return { 
        success: false, 
        chunksCreated: 0,
        error: errorMsg
      };
    }

    console.log(`Starting chunking process for web resource ${webResourceId}...`, {
      textLength: resourceText.length,
      trimmedLength: trimmedText.length,
      textPreview: trimmedText.substring(0, 100)
    });
    
    // Check if API key is configured early
    if (!process.env.OPENAI_API_KEY) {
      const errorMsg = 'OPENAI_API_KEY environment variable is not set. Please configure it in Netlify environment variables to enable chunking with embeddings.';
      console.error(`❌ ${errorMsg} for web resource ${webResourceId}`);
      return { 
        success: false, 
        chunksCreated: 0,
        error: errorMsg
      };
    }
    
    // Chunk the resource text
    const chunks = chunkText(trimmedText, 512, 50); // 512 tokens per chunk with 50 token overlap
    console.log(`Initial chunking created ${chunks.length} chunks`);
    
    const validChunks = validateChunks(chunks);
    console.log(`After validation: ${validChunks.length} valid chunks (filtered out ${chunks.length - validChunks.length})`);

    if (validChunks.length === 0) {
      console.error(`❌ No valid chunks generated for web resource ${webResourceId}`);
      return { 
        success: false, 
        chunksCreated: 0,
        error: 'No valid chunks created'
      };
    }

    // Delete existing chunks for this resource (in case of re-scraping)
    await pool.query('DELETE FROM cfr_title21_web_resource_chunks WHERE web_resource_id = $1', [webResourceId]);
    console.log(`Deleted existing chunks for web resource ${webResourceId}`);

    // Generate embeddings for each chunk in batches
    const batchSize = 5;
    let chunksCreated = 0;

    for (let i = 0; i < validChunks.length; i += batchSize) {
      // Check if we're approaching timeout
      const elapsedTime = Date.now() - startTime;
      if (elapsedTime > MAX_CHUNK_PROCESSING_TIME) {
        console.warn(`⏰ Chunk processing timeout warning: ${elapsedTime}ms elapsed`);
        break;
      }
      
      const batchChunks = validChunks.slice(i, Math.min(i + batchSize, validChunks.length));
      
      try {
        // Generate embeddings for the batch
        const embeddingResponse = await openai.embeddings.create({
          model: "text-embedding-ada-002",
          input: batchChunks.map(chunk => chunk.text),
        });

        // Store chunks with embeddings in database
        for (let j = 0; j < batchChunks.length; j++) {
          const chunk = batchChunks[j];
          const embedding = embeddingResponse.data[j].embedding;
          const embeddingStr = '[' + embedding.join(',') + ']';

          try {
            const insertResult = await pool.query(`
              INSERT INTO cfr_title21_web_resource_chunks 
              (web_resource_id, chunk_index, chunk_text, embedding, token_count)
              VALUES ($1, $2, $3, $4::vector, $5)
              ON CONFLICT (web_resource_id, chunk_index) 
              DO UPDATE SET chunk_text = $3, embedding = $4::vector, token_count = $5, created_at = CURRENT_TIMESTAMP
            `, [
              webResourceId,
              chunk.index,
              chunk.text,
              embeddingStr,
              chunk.tokenCount
            ]);

            if (insertResult.rowCount === 0) {
              console.warn(`⚠️ No rows affected when inserting chunk ${chunk.index} for web resource ${webResourceId}`);
            }

            chunksCreated++;
            console.log(`✓ Created chunk ${chunk.index} for web resource ${webResourceId} (${chunk.text.length} chars, ${chunk.tokenCount} tokens)`);
          } catch (dbError) {
            console.error(`❌ Database error inserting chunk ${chunk.index} for web resource ${webResourceId}:`, dbError);
            console.error(`   Chunk text preview: ${chunk.text.substring(0, 100)}`);
            // Continue with next chunk instead of failing entire batch
          }
        }
      } catch (batchError) {
        console.error(`Error processing embedding batch ${Math.floor(i / batchSize) + 1} for web resource ${webResourceId}:`, batchError);
        
        // Check if it's an API key error
        if (batchError.code === 'invalid_api_key' || 
            batchError.message?.includes('API key') || 
            batchError.message?.includes('authentication') ||
            batchError.status === 401) {
          const errorMsg = 'Invalid or missing OpenAI API key. Please check your OPENAI_API_KEY environment variable in Netlify settings.';
          console.error(`❌ ${errorMsg}`);
          return { 
            success: false, 
            chunksCreated, 
            error: errorMsg 
          };
        }
        
        // For other errors, continue with next batch but log the error
        console.warn(`Continuing with next batch after error: ${batchError.message}`);
      }
    }

    if (chunksCreated === 0 && validChunks.length > 0) {
      const errorMsg = 'Failed to create embeddings for any chunks. Check OpenAI API key configuration.';
      console.error(`❌ ${errorMsg}`);
      return { success: false, chunksCreated: 0, error: errorMsg };
    }

    console.log(`Successfully created ${chunksCreated} chunks with embeddings for web resource ${webResourceId}`);
    return { 
      success: chunksCreated > 0, 
      chunksCreated,
      error: chunksCreated === 0 && validChunks.length > 0 ? 'Failed to create embeddings' : undefined
    };

  } catch (error) {
    console.error(`Error in chunkAndEmbedWebResource for ${webResourceId}:`, error);
    
    let errorMessage = error.message;
    if (error.code === 'invalid_api_key' || error.message?.includes('API key')) {
      errorMessage = 'Invalid OpenAI API key. Please check your OPENAI_API_KEY environment variable in Netlify settings.';
    }
    
    return { success: false, chunksCreated: 0, error: errorMessage };
  }
}

// Function to scrape a single web resource
async function scrapeWebResource(url, sourceType, pool, regulationIds = []) {
  const startTime = Date.now();
  let webResourceDbId = null;

  try {
    console.log(`Starting scrape for: ${url}`);
    
    // Download HTML content
    const htmlContent = await downloadHTMLContent(url);
    
    // Extract text from HTML
    const extractedText = extractTextFromHTMLStructured(htmlContent);
    
    if (!extractedText || extractedText.trim().length < 20) {
      throw new Error(`Extracted text too short (${extractedText?.length || 0} chars). Minimum 20 characters required.`);
    }

    // Extract title
    const title = extractTitleFromHTML(htmlContent) || url;
    
    // Extract domain
    const domain = extractDomain(url);
    
    // Check if resource already exists
    const existingResult = await pool.query(
      'SELECT id, status FROM cfr_title21_web_resources WHERE source_url = $1',
      [url]
    );

    if (existingResult.rows.length > 0) {
      // Update existing record
      webResourceDbId = existingResult.rows[0].id;
      console.log(`Updating existing web resource record for ${url}...`);
      
      const updateResult = await pool.query(`
        UPDATE cfr_title21_web_resources 
        SET title = $1, full_text = $2, extraction_method = $3, 
            updated_at = CURRENT_TIMESTAMP, last_checked_at = CURRENT_TIMESTAMP,
            status = 'active', domain = $4, source_type = $5
        WHERE id = $6
        RETURNING id
      `, [
        title,
        extractedText,
        'html_extraction',
        domain,
        sourceType || null,
        webResourceDbId
      ]);
      
      console.log(`Updated web resource record: ${url} (DB ID: ${webResourceDbId})`);
    } else {
      // Create new record
      console.log(`Creating new web resource record for ${url}...`);
      const insertResult = await pool.query(`
        INSERT INTO cfr_title21_web_resources 
        (source_url, title, source_type, domain, full_text, extraction_method, status, last_checked_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, CURRENT_TIMESTAMP)
        RETURNING id
      `, [
        url,
        title,
        sourceType || null,
        domain,
        extractedText,
        'html_extraction',
        'active'
      ]);
      webResourceDbId = insertResult.rows[0]?.id;
      console.log(`Created new web resource record: ${url} (DB ID: ${webResourceDbId})`);
      
      if (!webResourceDbId) {
        throw new Error('Failed to get database ID after insert');
      }
    }

    // Chunk and embed the resource
    console.log(`Starting chunking for web resource ${url} (DB ID: ${webResourceDbId}) with ${extractedText.length} characters of text`);
    const chunkResult = await chunkAndEmbedWebResource(extractedText, webResourceDbId, pool, startTime);
    
    if (!chunkResult.success || chunkResult.chunksCreated === 0) {
      console.warn(`⚠️ Warning: Failed to create chunks for ${url}. Error: ${chunkResult.error || 'Unknown error'}`);
      // Update status to error but don't fail the entire operation
      await pool.query(
        'UPDATE cfr_title21_web_resources SET status = $1 WHERE id = $2',
        ['error', webResourceDbId]
      );
    }

    // Link to regulations if provided
    if (regulationIds && regulationIds.length > 0) {
      for (const regulationId of regulationIds) {
        try {
          await pool.query(`
            INSERT INTO cfr_title21_web_resource_links (web_resource_id, regulation_id, link_type)
            VALUES ($1, $2, $3)
            ON CONFLICT (web_resource_id, regulation_id) DO NOTHING
          `, [webResourceDbId, regulationId, 'related_topic']);
        } catch (linkError) {
          console.warn(`Failed to link web resource ${webResourceDbId} to regulation ${regulationId}:`, linkError.message);
        }
      }
    }

    const duration = Date.now() - startTime;
    console.log(`✓ Successfully scraped ${url} in ${duration}ms (${chunkResult.chunksCreated || 0} chunks created)`);

    return {
      success: true,
      webResourceId: webResourceDbId,
      url,
      title,
      chunksCreated: chunkResult.chunksCreated || 0,
      duration
    };

  } catch (error) {
    console.error(`❌ Error scraping ${url}:`, error);
    
    // If we have a DB ID, update status to error
    if (webResourceDbId) {
      try {
        await pool.query(
          'UPDATE cfr_title21_web_resources SET status = $1 WHERE id = $2',
          ['error', webResourceDbId]
        );
      } catch (updateError) {
        console.error('Failed to update error status:', updateError);
      }
    }
    
    return {
      success: false,
      url,
      error: error.message
    };
  }
}

export const handler = async (event) => {
  console.log('=== WEB RESOURCE SCRAPING ===');
  console.log('Request:', {
    method: event.httpMethod,
    path: event.path,
    timestamp: new Date().toISOString()
  });

  // Handle CORS preflight
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Allow-Methods': 'POST, OPTIONS'
      },
      body: ''
    };
  }

  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      },
      body: JSON.stringify({
        success: false,
        error: 'Method not allowed. Use POST to scrape URLs.'
      })
    };
  }

  try {
    await initDatabase();
    const pool = getPool();

    const requestBody = JSON.parse(event.body || '{}');
    const { url, urls, sourceType, regulationIds } = requestBody;

    // Support both single URL and array of URLs
    const urlsToScrape = urls || (url ? [url] : []);

    if (urlsToScrape.length === 0) {
      return {
        statusCode: 400,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        },
        body: JSON.stringify({
          success: false,
          error: 'No URLs provided. Please provide either "url" or "urls" array in the request body.'
        })
      };
    }

    console.log(`Scraping ${urlsToScrape.length} URL(s)...`);

    const results = [];
    for (const urlToScrape of urlsToScrape) {
      const result = await scrapeWebResource(urlToScrape, sourceType, pool, regulationIds);
      results.push(result);
    }

    const successCount = results.filter(r => r.success).length;
    const failureCount = results.filter(r => !r.success).length;

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      },
      body: JSON.stringify({
        success: true,
        message: `Scraped ${successCount} resource(s) successfully, ${failureCount} failed`,
        results
      })
    };

  } catch (error) {
    console.error('Web resource scraping error:', error);
    
    return {
      statusCode: 500,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      },
      body: JSON.stringify({
        success: false,
        error: error.message
      })
    };
  }
};

