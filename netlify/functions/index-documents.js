// Veeva Vault integration has been removed.
// Uploaded document indexing is handled by upload-document.js and related functions.
export const handler = async () => {
  return {
    statusCode: 200,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      total: 0,
      processed: 0,
      duration: 0,
      stats: { created: 0, updated: 0, unchanged: 0, errors: 0 },
      results: [],
      message: "Veeva Vault integration has been removed. Use the document upload feature instead."
    }),
  };
};
