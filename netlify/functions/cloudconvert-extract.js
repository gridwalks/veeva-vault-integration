import CloudConvert from 'cloudconvert';

// Initialize CloudConvert with API key from environment
const cloudConvert = process.env.CLOUDCONVERT_API_KEY 
  ? new CloudConvert(process.env.CLOUDCONVERT_API_KEY)
  : null;

/**
 * Convert DOCX to text using CloudConvert API
 * @param {Buffer} fileBuffer - The DOCX file buffer
 * @param {string} fileName - The name of the file
 * @returns {Promise<string>} - Extracted text
 */
export async function convertDocxToTextWithCloudConvert(fileBuffer, fileName) {
  if (!cloudConvert) {
    throw new Error('CloudConvert API key not configured');
  }

  console.log(`Starting CloudConvert DOCX to text conversion for: ${fileName}`);
  
  try {
    // Create a conversion job
    const job = await cloudConvert.jobs.create({
      tasks: {
        'upload-my-file': {
          operation: 'import/upload',
        },
        'convert-my-file': {
          operation: 'convert',
          input: 'upload-my-file',
          input_format: 'docx',
          output_format: 'txt',
          some_other_option: 'value', // Add any conversion options you need
        },
        'export-my-file': {
          operation: 'export/url',
          input: 'convert-my-file',
        },
      },
    });

    console.log(`CloudConvert job created: ${job.id}`);

    // Get the upload task
    const uploadTask = job.tasks.find(task => task.name === 'upload-my-file');
    
    if (!uploadTask) {
      throw new Error('Upload task not found in CloudConvert job');
    }

    // Upload the file
    console.log(`Uploading file to CloudConvert...`);
    await cloudConvert.tasks.upload(uploadTask, fileBuffer, fileName);
    console.log(`File uploaded successfully`);

    // Wait for the job to complete
    console.log(`Waiting for conversion to complete...`);
    const finishedJob = await cloudConvert.jobs.wait(job.id);
    console.log(`Conversion completed`);

    // Get the export task
    const exportTask = finishedJob.tasks.find(task => task.name === 'export-my-file');
    
    if (!exportTask || !exportTask.result || !exportTask.result.files || exportTask.result.files.length === 0) {
      throw new Error('Export task did not produce any files');
    }

    // Download the converted text file
    const file = exportTask.result.files[0];
    console.log(`Downloading converted text file from: ${file.url}`);
    
    const response = await fetch(file.url);
    
    if (!response.ok) {
      throw new Error(`Failed to download converted file: ${response.status} ${response.statusText}`);
    }

    const text = await response.text();
    console.log(`CloudConvert conversion successful: ${text.length} characters extracted`);
    
    return text;
    
  } catch (error) {
    console.error('CloudConvert conversion error:', {
      message: error.message,
      stack: error.stack,
      fileName: fileName
    });
    throw new Error(`CloudConvert conversion failed: ${error.message}`);
  }
}

