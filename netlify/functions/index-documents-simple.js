// Veeva Vault integration has been removed.
// Uploaded document indexing is handled by upload-document.js and related functions.
export const handler = async () => {
  return {
    statusCode: 200,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      success: true,
      message: "Veeva Vault integration has been removed. Use the document upload feature instead.",
      summary: {
        totalDocuments: 0,
        filteredDocuments: 0,
        newDocuments: 0,
        existingDocuments: 0,
        processedDocuments: 0
      },
      results: []
    })
  };
};
