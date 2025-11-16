import { useEffect, useMemo, useState } from "react";
import { getCfrTitle21 } from "../api";

export default function CfrTitle21() {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const [packages, setPackages] = useState([]);
  const [summary, setSummary] = useState(null);
  const [query, setQuery] = useState("");
  const [selectedPackageId, setSelectedPackageId] = useState(null);
  const [packageDetails, setPackageDetails] = useState({});
  const [detailsLoading, setDetailsLoading] = useState({});

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
                          <GranuleItem key={granule.granuleId || granule.title} granule={granule} />
                        ))}
                      </div>
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

function GranuleItem({ granule }) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [selectedSubchapters, setSelectedSubchapters] = useState(new Set());
  const hasSubchapters = granule.subchapters && granule.subchapters.length > 0;
  const hasParts = granule.parts && granule.parts.length > 0;

  const toggleSubchapter = (subchapterId) => {
    setSelectedSubchapters(prev => {
      const newSet = new Set(prev);
      if (newSet.has(subchapterId)) {
        newSet.delete(subchapterId);
      } else {
        newSet.add(subchapterId);
      }
      return newSet;
    });
  };

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
              const isChecked = selectedSubchapters.has(subchapterId);
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
                      onChange={() => toggleSubchapter(subchapterId)}
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
                      {subchapter.parts.map(part => (
                        <div
                          key={part.granuleId || part.title}
                          style={{
                            border: "1px solid #e5e7eb",
                            borderRadius: "2px",
                            padding: "4px",
                            backgroundColor: "#f9fafb"
                          }}
                        >
                          <div style={{ fontSize: "11px", fontWeight: 600, color: "#1f2937", marginBottom: "2px" }}>
                            {part.title || part.granuleId}
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
                      ))}
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
