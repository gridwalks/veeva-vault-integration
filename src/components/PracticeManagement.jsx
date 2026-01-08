import { useEffect, useState } from "react";
import { useAuth0 } from '@auth0/auth0-react';
import { getPractices, getRegulations, getAssociations, createPracticeAssociation, deletePracticeAssociation } from "../api";

export default function PracticeManagement() {
  const { getAccessTokenSilently } = useAuth0();
  const [practices, setPractices] = useState([]);
  const [regulations, setRegulations] = useState([]);
  const [associations, setAssociations] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedPractice, setSelectedPractice] = useState(null);
  const [selectedRegulation, setSelectedRegulation] = useState(null);
  const [viewMode, setViewMode] = useState("practice"); // "practice" or "regulation"
  const [pagination, setPagination] = useState({
    total: 0,
    offset: 0,
    limit: 50
  });

  useEffect(() => {
    loadPractices();
    loadRegulations();
    loadAssociations();
  }, []);

  useEffect(() => {
    if (searchQuery !== undefined) {
      loadRegulations();
    }
  }, [searchQuery, pagination.offset]);

  async function loadPractices() {
    try {
      const accessToken = await getAccessTokenSilently();
      const data = await getPractices({ accessToken });
      if (data.practices) {
        setPractices(data.practices);
      }
    } catch (err) {
      console.error("Failed to load practices:", err);
      setError(err.message || "Failed to load practices");
    }
  }

  async function loadRegulations() {
    setLoading(true);
    setError(null);
    try {
      const accessToken = await getAccessTokenSilently();
      const data = await getRegulations({
        search: searchQuery,
        limit: pagination.limit,
        offset: pagination.offset,
        accessToken
      });
      if (data.regulations) {
        setRegulations(data.regulations);
        setPagination(prev => ({
          ...prev,
          total: data.total || 0
        }));
      }
    } catch (err) {
      console.error("Failed to load regulations:", err);
      setError(err.message || "Failed to load regulations");
    } finally {
      setLoading(false);
    }
  }

  async function loadAssociations() {
    try {
      const accessToken = await getAccessTokenSilently();
      const data = await getAssociations({ accessToken });
      if (data.associations) {
        setAssociations(data.associations);
      }
    } catch (err) {
      console.error("Failed to load associations:", err);
    }
  }

  async function handleCreateAssociation(practiceId, regulationId) {
    try {
      const accessToken = await getAccessTokenSilently();
      await createPracticeAssociation({
        practice_id: practiceId,
        regulation_id: regulationId,
        accessToken
      });
      
      // Refresh data
      await loadAssociations();
      await loadRegulations();
      
      // Show success
      alert("Association created successfully!");
    } catch (err) {
      console.error("Failed to create association:", err);
      alert(err.message || "Failed to create association");
    }
  }

  async function handleDeleteAssociation(associationId) {
    if (!confirm("Are you sure you want to remove this association?")) {
      return;
    }
    
    try {
      const accessToken = await getAccessTokenSilently();
      await deletePracticeAssociation({
        associationId,
        accessToken
      });
      
      // Refresh data
      await loadAssociations();
      await loadRegulations();
      
      alert("Association removed successfully!");
    } catch (err) {
      console.error("Failed to delete association:", err);
      alert(err.message || "Failed to delete association");
    }
  }

  const getRegulationAssociations = (regulationId) => {
    return associations.filter(a => a.regulation_id === regulationId);
  };

  const getPracticeAssociations = (practiceId) => {
    return associations.filter(a => a.practice_id === practiceId);
  };

  const isRegulationAssociated = (regulationId, practiceId) => {
    return associations.some(a => 
      a.regulation_id === regulationId && a.practice_id === practiceId
    );
  };

  return (
    <div style={{ padding: '20px' }}>
      <div style={{ marginBottom: '20px' }}>
        <h2 style={{ margin: '0 0 16px 0', fontSize: '18px', fontWeight: '600' }}>
          Practice-Regulation Associations
        </h2>
        <p style={{ margin: '0 0 16px 0', color: '#6b7280', fontSize: '14px' }}>
          Associate CFR Title 21 regulations with pharmaceutical practices (GCP, GMP, GLP, GDP).
          When users ask about practice-related topics, associated regulations will be automatically included.
        </p>
        
        {/* View Mode Toggle */}
        <div style={{ marginBottom: '16px', display: 'flex', gap: '8px' }}>
          <button
            onClick={() => setViewMode("practice")}
            style={{
              padding: '8px 16px',
              backgroundColor: viewMode === "practice" ? '#4338ca' : '#f3f4f6',
              color: viewMode === "practice" ? 'white' : '#374151',
              border: 'none',
              borderRadius: '6px',
              cursor: 'pointer',
              fontSize: '14px',
              fontWeight: viewMode === "practice" ? '500' : '400'
            }}
          >
            View by Practice
          </button>
          <button
            onClick={() => setViewMode("regulation")}
            style={{
              padding: '8px 16px',
              backgroundColor: viewMode === "regulation" ? '#4338ca' : '#f3f4f6',
              color: viewMode === "regulation" ? 'white' : '#374151',
              border: 'none',
              borderRadius: '6px',
              cursor: 'pointer',
              fontSize: '14px',
              fontWeight: viewMode === "regulation" ? '500' : '400'
            }}
          >
            View by Regulation
          </button>
        </div>
      </div>

      {error && (
        <div style={{
          backgroundColor: '#fee2e2',
          color: '#991b1b',
          padding: '12px',
          borderRadius: '6px',
          marginBottom: '16px'
        }}>
          {error}
        </div>
      )}

      {viewMode === "practice" ? (
        /* View by Practice */
        <div>
          <h3 style={{ margin: '0 0 16px 0', fontSize: '16px', fontWeight: '600' }}>
            Practices
          </h3>
          <div style={{ display: 'grid', gap: '16px' }}>
            {practices.map(practice => {
              const practiceAssociations = getPracticeAssociations(practice.id);
              return (
                <div
                  key={practice.id}
                  style={{
                    border: '1px solid #e5e7eb',
                    borderRadius: '8px',
                    padding: '16px',
                    backgroundColor: '#ffffff'
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', marginBottom: '12px' }}>
                    <div>
                      <h4 style={{ margin: '0 0 4px 0', fontSize: '16px', fontWeight: '600' }}>
                        {practice.practice_code} - {practice.practice_name}
                      </h4>
                      {practice.description && (
                        <p style={{ margin: '4px 0 0 0', color: '#6b7280', fontSize: '14px' }}>
                          {practice.description}
                        </p>
                      )}
                    </div>
                    <span style={{
                      backgroundColor: '#dbeafe',
                      color: '#1e40af',
                      padding: '4px 8px',
                      borderRadius: '4px',
                      fontSize: '12px',
                      fontWeight: '500'
                    }}>
                      {practiceAssociations.length} regulation{practiceAssociations.length !== 1 ? 's' : ''}
                    </span>
                  </div>
                  
                  {practiceAssociations.length > 0 && (
                    <div style={{ marginTop: '12px' }}>
                      <div style={{ fontSize: '13px', fontWeight: '500', marginBottom: '8px', color: '#374151' }}>
                        Associated Regulations:
                      </div>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                        {practiceAssociations.map(assoc => (
                          <div
                            key={assoc.id}
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: '8px',
                              backgroundColor: '#f3f4f6',
                              padding: '6px 12px',
                              borderRadius: '6px',
                              fontSize: '13px'
                            }}
                          >
                            <span style={{ fontWeight: '500' }}>{assoc.regulation_identifier}</span>
                            <span style={{ color: '#6b7280' }}>{assoc.regulation_title}</span>
                            <button
                              onClick={() => handleDeleteAssociation(assoc.id)}
                              style={{
                                backgroundColor: '#ef4444',
                                color: 'white',
                                border: 'none',
                                borderRadius: '4px',
                                padding: '2px 8px',
                                cursor: 'pointer',
                                fontSize: '11px'
                              }}
                            >
                              Remove
                            </button>
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
      ) : (
        /* View by Regulation */
        <div>
          <div style={{ marginBottom: '16px', display: 'flex', gap: '8px', alignItems: 'center' }}>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setPagination(prev => ({ ...prev, offset: 0 }));
              }}
              placeholder="Search regulations..."
              style={{
                flex: 1,
                padding: '8px 12px',
                border: '1px solid #d1d5db',
                borderRadius: '6px',
                fontSize: '14px'
              }}
            />
            <button
              onClick={loadRegulations}
              disabled={loading}
              style={{
                padding: '8px 16px',
                backgroundColor: '#4338ca',
                color: 'white',
                border: 'none',
                borderRadius: '6px',
                cursor: loading ? 'not-allowed' : 'pointer',
                fontSize: '14px'
              }}
            >
              {loading ? 'Loading...' : 'Search'}
            </button>
          </div>

          <div style={{ marginBottom: '8px', fontSize: '14px', color: '#6b7280' }}>
            Showing {regulations.length} of {pagination.total} regulations
          </div>

          <div style={{ display: 'grid', gap: '12px' }}>
            {regulations.map(regulation => {
              const regulationAssociations = getRegulationAssociations(regulation.id);
              return (
                <div
                  key={regulation.id}
                  style={{
                    border: '1px solid #e5e7eb',
                    borderRadius: '8px',
                    padding: '16px',
                    backgroundColor: '#ffffff'
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', marginBottom: '12px' }}>
                    <div style={{ flex: 1 }}>
                      <h4 style={{ margin: '0 0 4px 0', fontSize: '15px', fontWeight: '600' }}>
                        {regulation.regulation_id} - {regulation.title}
                      </h4>
                      <div style={{ fontSize: '12px', color: '#6b7280', marginTop: '4px' }}>
                        Type: {regulation.regulation_type} | Chunks: {regulation.chunk_count}
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                      {regulation.associated_practices && regulation.associated_practices.length > 0 ? (
                        regulation.associated_practices.map(practiceCode => (
                          <span
                            key={practiceCode}
                            style={{
                              backgroundColor: '#dbeafe',
                              color: '#1e40af',
                              padding: '4px 8px',
                              borderRadius: '4px',
                              fontSize: '12px',
                              fontWeight: '500'
                            }}
                          >
                            {practiceCode}
                          </span>
                        ))
                      ) : (
                        <span style={{ fontSize: '12px', color: '#9ca3af' }}>No associations</span>
                      )}
                    </div>
                  </div>

                  <div style={{ marginTop: '12px', paddingTop: '12px', borderTop: '1px solid #e5e7eb' }}>
                    <div style={{ fontSize: '13px', fontWeight: '500', marginBottom: '8px', color: '#374151' }}>
                      Associate with Practice:
                    </div>
                    <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                      {practices.map(practice => (
                        <button
                          key={practice.id}
                          onClick={() => handleCreateAssociation(practice.id, regulation.id)}
                          disabled={isRegulationAssociated(regulation.id, practice.id)}
                          style={{
                            padding: '6px 12px',
                            backgroundColor: isRegulationAssociated(regulation.id, practice.id) 
                              ? '#d1d5db' 
                              : '#4338ca',
                            color: isRegulationAssociated(regulation.id, practice.id)
                              ? '#6b7280'
                              : 'white',
                            border: 'none',
                            borderRadius: '6px',
                            cursor: isRegulationAssociated(regulation.id, practice.id)
                              ? 'not-allowed'
                              : 'pointer',
                            fontSize: '13px',
                            fontWeight: '500'
                          }}
                        >
                          {isRegulationAssociated(regulation.id, practice.id) ? '✓ ' : '+'} {practice.practice_code}
                        </button>
                      ))}
                    </div>
                    {regulationAssociations.length > 0 && (
                      <div style={{ marginTop: '12px' }}>
                        {regulationAssociations.map(assoc => (
                          <div
                            key={assoc.id}
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: '8px',
                              marginTop: '8px',
                              padding: '8px',
                              backgroundColor: '#f9fafb',
                              borderRadius: '6px'
                            }}
                          >
                            <span style={{ fontSize: '13px', fontWeight: '500' }}>
                              {assoc.practice_code} - {assoc.practice_name}
                            </span>
                            <button
                              onClick={() => handleDeleteAssociation(assoc.id)}
                              style={{
                                backgroundColor: '#ef4444',
                                color: 'white',
                                border: 'none',
                                borderRadius: '4px',
                                padding: '4px 8px',
                                cursor: 'pointer',
                                fontSize: '11px',
                                marginLeft: 'auto'
                              }}
                            >
                              Remove
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Pagination */}
          {pagination.total > pagination.limit && (
            <div style={{ marginTop: '20px', display: 'flex', gap: '8px', justifyContent: 'center', alignItems: 'center' }}>
              <button
                onClick={() => setPagination(prev => ({ ...prev, offset: Math.max(0, prev.offset - prev.limit) }))}
                disabled={pagination.offset === 0}
                style={{
                  padding: '8px 16px',
                  backgroundColor: pagination.offset === 0 ? '#f3f4f6' : '#4338ca',
                  color: pagination.offset === 0 ? '#9ca3af' : 'white',
                  border: 'none',
                  borderRadius: '6px',
                  cursor: pagination.offset === 0 ? 'not-allowed' : 'pointer',
                  fontSize: '14px'
                }}
              >
                Previous
              </button>
              <span style={{ fontSize: '14px', color: '#6b7280' }}>
                Page {Math.floor(pagination.offset / pagination.limit) + 1} of {Math.ceil(pagination.total / pagination.limit)}
              </span>
              <button
                onClick={() => setPagination(prev => ({ ...prev, offset: prev.offset + prev.limit }))}
                disabled={pagination.offset + pagination.limit >= pagination.total}
                style={{
                  padding: '8px 16px',
                  backgroundColor: pagination.offset + pagination.limit >= pagination.total ? '#f3f4f6' : '#4338ca',
                  color: pagination.offset + pagination.limit >= pagination.total ? '#9ca3af' : 'white',
                  border: 'none',
                  borderRadius: '6px',
                  cursor: pagination.offset + pagination.limit >= pagination.total ? 'not-allowed' : 'pointer',
                  fontSize: '14px'
                }}
              >
                Next
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

