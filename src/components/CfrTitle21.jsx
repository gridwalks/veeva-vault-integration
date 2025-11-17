import { useEffect, useMemo, useState } from "react";
import { getCfrTitle21, indexCfrRegulations } from "../api";

export default function CfrTitle21() {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const [packages, setPackages] = useState([]);
  const [summary, setSummary] = useState(null);
  const [query, setQuery] = useState("");
  const [selectedPackageId, setSelectedPackageId] = useState(null);
  const [packageDetails, setPackageDetails] = useState({});
  const [detailsLoading, setDetailsLoading] = useState({});
  
  // Track selected subchapters and parts across all granules
  // Key format: "packageId:chapterId:subchapterId" or "packageId:chapterId:subchapterId:partId"
  const [selectedSubchapters, setSelectedSubchapters] = useState(new Set());
  const [selectedParts, setSelectedParts] = useState(new Set());
  const [isIndexing, setIsIndexing] = useState(false);
  const [indexingStatus, setIndexingStatus] = useState(null);

  useEffect(() => {
    loadPackages();
  }, []);

  async function loadPackages() {
    console.log("Loading CFR Title 21 packages...");
    setIsLoading(true);
    setError(null);

    try {
      const data = await getCfrTitle21();
      setPackages(data.packages || []);
      setSummary({
        totalPackages: data.totalPackages || data.packages?.length || 0,
        expectedTotal: data.expectedTotal || data.totalPackagesBeforeFilter || data.totalPackages || data.packages?.length || 0,
        retrievedAt: data.retrievedAt,
        totalPackagesBeforeFilter: data.totalPackagesBeforeFilter ?? null,
        filteredOutCount: data.filteredOutCount || 0
      });
    } catch (err) {
      console.error("Failed to load CFR Title 21 packages", err);
      setError(err.message || "Unable to load CFR Title 21 data.");
    } finally {
      setIsLoading(false);
    }
  }

  async function togglePackage(packageId) {
    if (selectedPackageId === packageId) {
      setSelectedPackageId(null);
      return;
    }

    setSelectedPackageId(packageId);

    if (!packageDetails[packageId] && !detailsLoading[packageId]) {
      setDetailsLoading(prev => ({ ...prev, [packageId]: true }));
      setError(null);

      try {
        const data = await getCfrTitle21({ packageId });
        setPackageDetails(prev => ({
          ...prev,
          [packageId]: {
            granules: data.granules || [],
            totalGranules: data.totalGranules || data.granules?.length || 0,
            retrievedAt: data.retrievedAt
          }
        }));
      } catch (err) {
        console.error("Failed to load CFR granules", { packageId, error: err });
        setPackageDetails(prev => ({
          ...prev,
          [packageId]: {
            error: err.message || "Unable to load section details."
          }
        }));
      } finally {
        setDetailsLoading(prev => ({ ...prev, [packageId]: false }));
      }
    }
  }

  const filteredPackages = useMemo(() => {
    if (!query.trim()) {
      return packages;
    }

    const normalizedQuery = query.trim().toLowerCase();
    return packages.filter(pkg => {
      return [pkg.title, pkg.packageId]
        .filter(Boolean)
        .some(value => value.toLowerCase().includes(normalizedQuery));
    });
  }, [packages, query]);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
      <div style={{
        display: "flex",
        flexDirection: "column",
        gap: "8px",
        padding: "12px",
        border: "1px solid #e5e7eb",
        borderRadius: "6px",
        backgroundColor: "#f9fafb"
      }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "8px" }}>
          <div>
            <h2 style={{ margin: 0, fontSize: "16px", fontWeight: 600, color: "#1f2937" }}>
              CFR Title 21 (Food and Drugs)
            </h2>
            <p style={{ margin: "4px 0 0", fontSize: "12px", color: "#4b5563" }}>
              Browse the Code of Federal Regulations Title 21 volumes and sections via the GovInfo CFR API.
            </p>
            <p style={{ margin: "2px 0 0", fontSize: "11px", color: "#6b7280" }}>
              Note: eCFR.gov links may require manual access verification due to automated access restrictions.
            </p>
          </div>
          <button
            onClick={loadPackages}
            disabled={isLoading}
            style={{
              padding: "6px 12px",
              fontSize: "12px",
              borderRadius: "4px",
              border: "1px solid #4338ca",
              backgroundColor: isLoading ? "#e5e7eb" : "#4338ca",
              color: isLoading ? "#6b7280" : "#ffffff",
              cursor: isLoading ? "not-allowed" : "pointer"
            }}
          >
            {isLoading ? "Refreshing..." : "Refresh"}
          </button>
        </div>

        {summary && (
          <div style={{ display: "flex", gap: "16px", flexWrap: "wrap" }}>
            <SummaryItem label="Title 21 Volumes" value={summary.totalPackages} />
            {summary.totalPackagesBeforeFilter != null && (
              <SummaryItem label="Total Volumes Retrieved" value={summary.totalPackagesBeforeFilter} />
            )}
            {summary.filteredOutCount > 0 && (
              <SummaryItem label="Non-Title 21 Discarded" value={summary.filteredOutCount} />
            )}
            <SummaryItem label="Expected Volumes" value={summary.expectedTotal} />
            {summary.retrievedAt && (
              <SummaryItem label="Last Updated" value={new Date(summary.retrievedAt).toLocaleString()} />
            )}
          </div>
        )}

        <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
          <input
            value={query}
            onChange={event => setQuery(event.target.value)}
            placeholder="Filter by volume title or package ID"
            style={{
              flex: "1 1 240px",
              padding: "6px 10px",
              fontSize: "12px",
              borderRadius: "4px",
              border: "1px solid #d1d5db"
            }}
          />
          <div style={{ fontSize: "12px", color: "#6b7280", alignSelf: "center" }}>
            Showing {filteredPackages.length} of {packages.length} Title 21 volumes
          </div>
        </div>
      </div>

      {error && (
        <div style={{
          border: "1px solid #fecaca",
          backgroundColor: "#fee2e2",
          color: "#b91c1c",
          borderRadius: "6px",
          padding: "12px",
          fontSize: "12px"
        }}>
          <strong>Error:</strong> {error}
          {/(GPO_API_KEY|GovInfo API key)/i.test(error) && (
            <>
              <br />
              Please configure the <code>GPO_API_KEY</code> environment variable with a valid GovInfo API key.
            </>
          )}
        </div>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
        {filteredPackages.map(pkg => {
          const details = packageDetails[pkg.packageId];
          const isExpanded = selectedPackageId === pkg.packageId;
          const isDetailsLoading = detailsLoading[pkg.packageId];

          return (
            <div
              key={pkg.packageId}
              style={{
                border: "1px solid #e5e7eb",
                borderRadius: "6px",
                backgroundColor: "#ffffff",
                overflow: "hidden"
              }}
            >
              <button
                onClick={() => togglePackage(pkg.packageId)}
                style={{
                  width: "100%",
                  textAlign: "left",
                  backgroundColor: isExpanded ? "#eef2ff" : "#f9fafb",
                  border: "none",
                  padding: "12px",
                  cursor: "pointer",
                  display: "flex",
                  flexDirection: "column",
                  gap: "4px"
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "12px" }}>
                  <span style={{ fontSize: "14px", fontWeight: 600, color: "#1f2937" }}>
                    {pkg.title || pkg.packageId}
                  </span>
                  <span style={{ fontSize: "12px", color: "#4b5563" }}>
                    {isExpanded ? "Hide Sections" : "View Sections"}
                  </span>
                </div>
                <div style={{ display: "flex", gap: "12px", fontSize: "11px", color: "#6b7280", flexWrap: "wrap" }}>
                  {pkg.packageId && <span>Package ID: {pkg.packageId}</span>}
                  {pkg.dateIssued && <span>Issued: {new Date(pkg.dateIssued).toLocaleDateString()}</span>}
                  {pkg.lastModified && <span>Updated: {new Date(pkg.lastModified).toLocaleDateString()}</span>}
                  {typeof pkg.granuleCount === "number" && <span>Granules: {pkg.granuleCount}</span>}
                </div>
                <div style={{ display: "flex", gap: "12px", fontSize: "11px", flexWrap: "wrap" }}>
                  {pkg.detailsLink && (
                    <a href={pkg.detailsLink} target="_blank" rel="noreferrer" style={{ color: "#4338ca" }}>
                      View on GovInfo
                    </a>
                  )}
                  {pkg.packageLink && (
                    <a href={pkg.packageLink} target="_blank" rel="noreferrer" style={{ color: "#4338ca" }}>
                      API Package Details
                    </a>
                  )}
                </div>
              </button>

              {isExpanded && (
                <div style={{ borderTop: "1px solid #e5e7eb", padding: "12px", backgroundColor: "#f9fafb" }}>
                  {isDetailsLoading && (
                    <div style={{ fontSize: "12px", color: "#4b5563" }}>Loading sections...</div>
                  )}

                  {!isDetailsLoading && details?.error && (
                    <div style={{
                      border: "1px solid #fecaca",
                      backgroundColor: "#fee2e2",
                      color: "#b91c1c",
                      borderRadius: "6px",
                      padding: "10px",
                      fontSize: "12px"
                    }}>
                      <strong>Error:</strong> {details.error}
                    </div>
                  )}

                  {!isDetailsLoading && details && !details.error && (
                    <>
                      <div style={{ fontSize: "12px", color: "#4b5563", marginBottom: "8px" }}>
                        Showing {details.granules.length} of {details.totalGranules} sections
                        {details.retrievedAt && (
                          <> (retrieved {new Date(details.retrievedAt).toLocaleString()})</>
                        )}
                      </div>
                      <div style={{ display: "flex", flexDirection: "column", gap: "8px", maxHeight: "320px", overflow: "auto" }}>
                        {details.granules.map(granule => (
                          <GranuleItem 
                            key={granule.granuleId || granule.title} 
                            granule={granule}
                            packageId={pkg.packageId}
                            selectedSubchapters={selectedSubchapters}
                            selectedParts={selectedParts}
                            onToggleSubchapter={(key) => {
                              const newSet = new Set(selectedSubchapters);
                              if (newSet.has(key)) {
                                newSet.delete(key);
                                // Uncheck all parts from this subchapter
                                const newPartsSet = new Set(selectedParts);
                                const partsToRemove = Array.from(selectedParts).filter(partKey => partKey.startsWith(key + ':'));
                                partsToRemove.forEach(partKey => newPartsSet.delete(partKey));
                                setSelectedParts(newPartsSet);
                              } else {
                                newSet.add(key);
                                // Auto-check all parts from this subchapter
                                const newPartsSet = new Set(selectedParts);
                                const chapter = details.granules.find(ch => ch.granuleId === granule.granuleId);
                                const subchapter = chapter?.subchapters?.find(sc => {
                                  const subchapterKey = `${pkg.packageId}:${granule.granuleId}:${sc.granuleId || sc.title}`;
                                  return subchapterKey === key;
                                });
                                if (subchapter?.parts) {
                                  subchapter.parts.forEach(part => {
                                    const partKey = `${key}:${part.granuleId || part.title}`;
                                    newPartsSet.add(partKey);
                                  });
                                }
                                setSelectedParts(newPartsSet);
                              }
                              setSelectedSubchapters(newSet);
                            }}
                            onTogglePart={(key) => {
                              const newSet = new Set(selectedParts);
                              if (newSet.has(key)) {
                                newSet.delete(key);
                              } else {
                                newSet.add(key);
                              }
                              setSelectedParts(newSet);
                            }}
                          />
                        ))}
                      </div>
                      {/* Index Selected Button */}
                      {(selectedSubchapters.size > 0 || selectedParts.size > 0) && (
                        <div style={{ marginTop: "12px", paddingTop: "12px", borderTop: "1px solid #e5e7eb" }}>
                          <button
                            onClick={async () => {
                              if (isIndexing) return;
                              setIsIndexing(true);
                              setIndexingStatus(null);
                              setError(null);
                              
                              try {
                                // Collect selected items
                                const selectedItems = [];
                                
                                // Add selected subchapters
                                selectedSubchapters.forEach(key => {
                                  const [packageId, chapterId, subchapterId] = key.split(':');
                                  const chapter = details.granules.find(ch => ch.granuleId === chapterId);
                                  const subchapter = chapter?.subchapters?.find(sc => {
                                    const scKey = `${packageId}:${chapterId}:${sc.granuleId || sc.title}`;
                                    return scKey === key;
                                  });
                                  if (subchapter) {
                                    selectedItems.push({
                                      type: 'subchapter',
                                      id: subchapter.granuleId || subchapter.title,
                                      granuleId: subchapter.granuleId,
                                      chapterId: chapterId,
                                      title: subchapter.title
                                    });
                                  }
                                });
                                
                                // Add selected parts
                                selectedParts.forEach(key => {
                                  const parts = key.split(':');
                                  if (parts.length >= 4) {
                                    const [packageId, chapterId, subchapterId, partId] = parts;
                                    const chapter = details.granules.find(ch => ch.granuleId === chapterId);
                                    let part = null;
                                    if (subchapterId) {
                                      const subchapter = chapter?.subchapters?.find(sc => sc.granuleId === subchapterId);
                                      part = subchapter?.parts?.find(p => (p.granuleId || p.title) === partId);
                                    } else {
                                      part = chapter?.parts?.find(p => (p.granuleId || p.title) === partId);
                                    }
                                    if (part) {
                                      selectedItems.push({
                                        type: 'part',
                                        id: part.granuleId || part.title,
                                        granuleId: part.granuleId,
                                        chapterId: chapterId,
                                        subchapterId: subchapterId || null,
                                        title: part.title
                                      });
                                    }
                                  }
                                });
                                
                                console.log('Indexing selected items:', selectedItems);
                                
                                const result = await indexCfrRegulations({
                                  selectedItems,
                                  granuleData: { granules: details.granules }
                                });
                                
                                console.log('Indexing result:', result);
                                console.log('Results array:', result.results);
                                if (result.results && result.results.length > 0) {
                                  result.results.forEach((r, idx) => {
                                    const resultDetails = {
                                      success: r.success,
                                      regulationId: r.regulationId,
                                      title: r.title,
                                      error: r.error,
                                      chunksCreated: r.chunksCreated,
                                      regulationType: r.regulationType,
                                      processingDuration: r.processingDuration
                                    };
                                    console.log(`Result ${idx + 1} (full):`, resultDetails);
                                    console.log(`Result ${idx + 1} (JSON):`, JSON.stringify(resultDetails, null, 2));
                                    if (r.error) {
                                      console.error(`❌ ERROR for ${r.title || r.regulationId}:`, r.error);
                                      console.error(`Full error details:`, r);
                                    }
                                  });
                                }
                                
                                setIndexingStatus(result);
                                
                                // Clear selections after successful indexing
                                if (result.success) {
                                  setSelectedSubchapters(new Set());
                                  setSelectedParts(new Set());
                                }
                              } catch (err) {
                                console.error('Indexing error:', err);
                                setError(err.message || 'Failed to index regulations');
                                setIndexingStatus({
                                  success: false,
                                  error: err.message || 'Failed to index regulations'
                                });
                              } finally {
                                setIsIndexing(false);
                              }
                            }}
                            disabled={isIndexing}
                            style={{
                              padding: "8px 16px",
                              fontSize: "12px",
                              borderRadius: "4px",
                              border: "none",
                              backgroundColor: isIndexing ? "#9ca3af" : "#4338ca",
                              color: "#ffffff",
                              cursor: isIndexing ? "not-allowed" : "pointer",
                              fontWeight: 600
                            }}
                          >
                            {isIndexing ? "Indexing..." : `Index Selected (${selectedSubchapters.size + selectedParts.size} items)`}
                          </button>
                          
                          {indexingStatus && (
                            <div style={{
                              marginTop: "8px",
                              padding: "8px",
                              borderRadius: "4px",
                              backgroundColor: indexingStatus.success ? "#d1fae5" : "#fee2e2",
                              border: `1px solid ${indexingStatus.success ? "#10b981" : "#ef4444"}`,
                              fontSize: "11px",
                              color: indexingStatus.success ? "#065f46" : "#991b1b"
                            }}>
                              {indexingStatus.successful > 0 || (indexingStatus.successful === 0 && indexingStatus.failed === 0) ? (
                                <>
                                  <strong>Indexing Complete!</strong>
                                  <div>Processed: {indexingStatus.processed || 0}, Successful: {indexingStatus.successful || 0}, Failed: {indexingStatus.failed || 0}</div>
                                  <div>Total chunks created: {indexingStatus.totalChunksCreated || 0}</div>
                                  {indexingStatus.results && indexingStatus.results.length > 0 && (
                                    <div style={{ marginTop: "8px" }}>
                                      <strong>Details:</strong>
                                      {indexingStatus.results.map((result, idx) => (
                                        <div key={idx} style={{ marginTop: "4px", fontSize: "10px" }}>
                                          {result.title || result.regulationId}: {result.success ? `✓ ${result.chunksCreated || 0} chunks` : `✗ ${result.error || 'Failed'}`}
                                        </div>
                                      ))}
                                    </div>
                                  )}
                                </>
                              ) : (
                                <>
                                  <strong>Indexing Failed</strong>
                                  <div>Processed: {indexingStatus.processed || 0}, Successful: {indexingStatus.successful || 0}, Failed: {indexingStatus.failed || 0}</div>
                                  {indexingStatus.results && indexingStatus.results.length > 0 && (
                                    <div style={{ marginTop: "8px" }}>
                                      <strong>Error Details:</strong>
                                      {indexingStatus.results.map((result, idx) => (
                                        <div key={idx} style={{ marginTop: "4px", fontSize: "10px", wordBreak: "break-word" }}>
                                          <strong>{result.title || result.regulationId}:</strong> {result.error || 'Unknown error'}
                                        </div>
                                      ))}
                                    </div>
                                  )}
                                  {(!indexingStatus.results || indexingStatus.results.length === 0) && (
                                    <div style={{ marginTop: "4px", fontSize: "10px" }}>
                                      {indexingStatus.error || 'No error details available'}
                                    </div>
                                  )}
                                </>
                              )}
                            </div>
                          )}
                        </div>
                      )}
                    </>
                  )}
                </div>
              )}
            </div>
          );
        })}

        {!isLoading && !filteredPackages.length && (
          <div style={{
            padding: "16px",
            textAlign: "center",
            color: "#6b7280",
            border: "1px dashed #d1d5db",
            borderRadius: "6px",
            fontSize: "12px"
          }}>
            No volumes found matching your filter.
          </div>
        )}
      </div>
    </div>
  );
}

function GranuleItem({ granule, packageId, selectedSubchapters, selectedParts, onToggleSubchapter, onTogglePart }) {
  const [isExpanded, setIsExpanded] = useState(false);
  const hasSubchapters = granule.subchapters && granule.subchapters.length > 0;
  const hasParts = granule.parts && granule.parts.length > 0;

  return (
    <div
      style={{
        border: "1px solid #e5e7eb",
        borderRadius: "4px",
        backgroundColor: "#ffffff"
      }}
    >
      <div
        style={{
          padding: "8px",
          display: "flex",
          flexDirection: "column",
          gap: "4px"
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ fontSize: "13px", fontWeight: 600, color: "#1f2937" }}>
            {granule.title || granule.granuleId || "Untitled Section"}
          </div>
          {hasSubchapters && (
            <button
              onClick={() => setIsExpanded(!isExpanded)}
              style={{
                padding: "2px 6px",
                fontSize: "10px",
                borderRadius: "3px",
                border: "1px solid #d1d5db",
                backgroundColor: isExpanded ? "#eef2ff" : "#f9fafb",
                color: "#4338ca",
                cursor: "pointer"
              }}
            >
              {isExpanded ? "Hide" : "Show"} Subchapters
            </button>
          )}
        </div>
        
        <div style={{ display: "flex", gap: "12px", fontSize: "11px", color: "#6b7280", flexWrap: "wrap" }}>
          {granule.granuleId && <span>ID: {granule.granuleId}</span>}
          {granule.granuleClass && <span>Type: {granule.granuleClass}</span>}
          {granule.dateIssued && <span>Issued: {new Date(granule.dateIssued).toLocaleDateString()}</span>}
        </div>
        
        <div style={{ display: "flex", gap: "12px", fontSize: "11px", marginTop: "6px", flexWrap: "wrap" }}>
          {granule.detailsLink && (
            <a href={granule.detailsLink} target="_blank" rel="noreferrer" style={{ color: "#4338ca" }}>
              eCFR.gov
            </a>
          )}
          {granule.pdfLink && (
            <a href={granule.pdfLink} target="_blank" rel="noreferrer" style={{ color: "#4338ca" }}>
              PDF
            </a>
          )}
          {granule.htmlLink && (
            <a href={granule.htmlLink} target="_blank" rel="noreferrer" style={{ color: "#4338ca" }}>
              HTML
            </a>
          )}
          {granule.txtLink && (
            <a href={granule.txtLink} target="_blank" rel="noreferrer" style={{ color: "#4338ca" }}>
              Text
            </a>
          )}
          {granule.xmlLink && (
            <a href={granule.xmlLink} target="_blank" rel="noreferrer" style={{ color: "#4338ca" }}>
              XML
            </a>
          )}
        </div>
      </div>

      {isExpanded && hasSubchapters && (
        <div style={{ borderTop: "1px solid #e5e7eb", padding: "8px", backgroundColor: "#f9fafb" }}>
          <div style={{ fontSize: "11px", color: "#4b5563", marginBottom: "6px", fontWeight: 600 }}>
            Subchapters ({granule.subchapters.length}):
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
            {granule.subchapters.map(subchapter => {
              const subchapterId = subchapter.granuleId || subchapter.title;
              const subchapterKey = `${packageId}:${granule.granuleId}:${subchapterId}`;
              const isChecked = selectedSubchapters.has(subchapterKey);
              return (
                <div
                  key={subchapterId}
                  style={{
                    border: "1px solid #d1d5db",
                    borderRadius: "3px",
                    padding: "6px",
                    backgroundColor: "#ffffff"
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "3px" }}>
                    <input
                      type="checkbox"
                      checked={isChecked}
                      onChange={() => onToggleSubchapter(subchapterKey)}
                      style={{
                        width: "16px",
                        height: "16px",
                        cursor: "pointer"
                      }}
                    />
                    <div style={{ fontSize: "12px", fontWeight: 600, color: "#1f2937" }}>
                      {subchapter.title || subchapter.granuleId}
                    </div>
                  </div>
                <div style={{ display: "flex", gap: "8px", fontSize: "10px", color: "#6b7280", flexWrap: "wrap" }}>
                  {subchapter.granuleId && <span>ID: {subchapter.granuleId}</span>}
                  {subchapter.granuleClass && <span>Type: {subchapter.granuleClass}</span>}
                  {subchapter.dateIssued && <span>Issued: {new Date(subchapter.dateIssued).toLocaleDateString()}</span>}
                </div>
                <div style={{ display: "flex", gap: "8px", fontSize: "10px", marginTop: "4px", flexWrap: "wrap" }}>
                  {subchapter.detailsLink && (
                    <a href={subchapter.detailsLink} target="_blank" rel="noreferrer" style={{ color: "#4338ca" }}>
                      eCFR.gov
                    </a>
                  )}
                  {subchapter.htmlLink && (
                    <a href={subchapter.htmlLink} target="_blank" rel="noreferrer" style={{ color: "#4338ca" }}>
                      HTML
                    </a>
                  )}
                </div>
                
                {subchapter.parts && subchapter.parts.length > 0 && (
                  <div style={{ marginTop: "6px" }}>
                    <div style={{ fontSize: "10px", color: "#4b5563", marginBottom: "4px", fontWeight: 600 }}>
                      Parts ({subchapter.parts.length}):
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                      {subchapter.parts.map(part => {
                        const partId = part.granuleId || part.title;
                        const partKey = `${subchapterKey}:${partId}`;
                        const isPartChecked = selectedParts.has(partKey);
                        return (
                          <div
                            key={partId}
                            style={{
                              border: "1px solid #e5e7eb",
                              borderRadius: "2px",
                              padding: "4px",
                              backgroundColor: "#f9fafb"
                            }}
                          >
                            <div style={{ display: "flex", alignItems: "center", gap: "6px", marginBottom: "2px" }}>
                              <input
                                type="checkbox"
                                checked={isPartChecked}
                                onChange={() => onTogglePart(partKey)}
                                style={{
                                  width: "14px",
                                  height: "14px",
                                  cursor: "pointer"
                                }}
                              />
                              <div style={{ fontSize: "11px", fontWeight: 600, color: "#1f2937" }}>
                                {part.title || part.granuleId}
                              </div>
                            </div>
                          <div style={{ display: "flex", gap: "6px", fontSize: "9px", color: "#6b7280", flexWrap: "wrap" }}>
                            {part.granuleId && <span>ID: {part.granuleId}</span>}
                            {part.granuleClass && <span>Type: {part.granuleClass}</span>}
                            {part.dateIssued && <span>Issued: {new Date(part.dateIssued).toLocaleDateString()}</span>}
                          </div>
                          <div style={{ display: "flex", gap: "6px", fontSize: "9px", marginTop: "3px", flexWrap: "wrap" }}>
                            {part.detailsLink && (
                              <a href={part.detailsLink} target="_blank" rel="noreferrer" style={{ color: "#4338ca" }}>
                                eCFR.gov
                              </a>
                            )}
                            {part.htmlLink && (
                              <a href={part.htmlLink} target="_blank" rel="noreferrer" style={{ color: "#4338ca" }}>
                                HTML
                              </a>
                            )}
                            {part.govInfoLink && (
                              <a href={part.govInfoLink} target="_blank" rel="noreferrer" style={{ color: "#059669" }}>
                                GovInfo
                              </a>
                            )}
                          </div>
                        </div>
                      );
                      })}
                    </div>
                  </div>
                )}
              </div>
            );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

function SummaryItem({ label, value }) {
  return (
    <div style={{
      display: "flex",
      flexDirection: "column",
      padding: "8px 12px",
      borderRadius: "6px",
      backgroundColor: "#ffffff",
      border: "1px solid #e5e7eb",
      minWidth: "120px"
    }}>
      <span style={{ fontSize: "11px", textTransform: "uppercase", color: "#6b7280" }}>{label}</span>
      <span style={{ fontSize: "16px", fontWeight: 600, color: "#111827" }}>{value}</span>
    </div>
  );
}
