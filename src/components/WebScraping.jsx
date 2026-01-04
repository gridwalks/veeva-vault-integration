import { useState, useEffect } from 'react';
import { getIndexedCfrRegulations } from '../api';

export default function WebScraping() {
  const [resources, setResources] = useState([]);
  const [loading, setLoading] = useState(false);
  const [scraping, setScraping] = useState(false);
  const [showScrapeForm, setShowScrapeForm] = useState(false);
  const [entryMode, setEntryMode] = useState('scrape'); // 'scrape' or 'manual'
  const [editingResource, setEditingResource] = useState(null);
  const [scrapeResult, setScrapeResult] = useState(null);
  const [regulations, setRegulations] = useState([]);
  const [loadingRegulations, setLoadingRegulations] = useState(false);
  const [filters, setFilters] = useState({
    sourceType: '',
    status: 'active'
  });
  const [formData, setFormData] = useState({
    url: '',
    urls: '',
    sourceType: '',
    regulationIds: [],
    title: '',
    content: ''
  });

  useEffect(() => {
    loadResources();
    loadRegulations();
  }, [filters]);

  const loadRegulations = async () => {
    setLoadingRegulations(true);
    try {
      const data = await getIndexedCfrRegulations();
      if (data.success && data.regulations) {
        setRegulations(data.regulations || []);
      }
    } catch (error) {
      console.error('Error loading regulations:', error);
    } finally {
      setLoadingRegulations(false);
    }
  };

  const loadResources = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (filters.sourceType) params.append('source_type', filters.sourceType);
      if (filters.status) params.append('status', filters.status);
      
      const response = await fetch(`/api/web-resources?${params.toString()}`);
      if (response.ok) {
        const data = await response.json();
        setResources(data.resources || []);
      } else {
        console.error('Failed to load web resources');
      }
    } catch (error) {
      console.error('Error loading web resources:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleScrape = async (e) => {
    e.preventDefault();
    
    if (entryMode === 'manual') {
      handleManualEntry(e);
      return;
    }
    
    if (!formData.url.trim() && !formData.urls.trim()) {
      alert('Please provide at least one URL to scrape.');
      return;
    }

    setScraping(true);
    setScrapeResult(null);
    
    try {
      const payload = {
        sourceType: formData.sourceType || null
      };

      // Support both single URL and multiple URLs
      if (formData.urls.trim()) {
        const urlList = formData.urls.split('\n')
          .map(url => url.trim())
          .filter(url => url.length > 0);
        payload.urls = urlList;
      } else {
        payload.url = formData.url.trim();
      }

      // Include regulation IDs if provided
      if (formData.regulationIds && formData.regulationIds.length > 0) {
        payload.regulationIds = formData.regulationIds.map(id => parseInt(id)).filter(id => !isNaN(id));
      }

      const response = await fetch('/api/scrape-web-resources', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      });

      const result = await response.json();
      
      if (response.ok) {
        setScrapeResult({
          success: true,
          message: result.message,
          results: result.results
        });
        resetScrapeForm();
        loadResources();
      } else {
        setScrapeResult({
          success: false,
          message: result.error || 'Failed to scrape resources'
        });
      }
    } catch (error) {
      console.error('Error scraping resources:', error);
      setScrapeResult({
        success: false,
        message: error.message || 'Error scraping resources. Please try again.'
      });
    } finally {
      setScraping(false);
    }
  };

  const handleManualEntry = async (e) => {
    e.preventDefault();
    
    if (!formData.url.trim()) {
      alert('Please provide a URL (even if you can\'t scrape it, we need it for reference).');
      return;
    }
    
    if (!formData.title.trim()) {
      alert('Please provide a title for this resource.');
      return;
    }
    
    if (!formData.content.trim() || formData.content.trim().length < 20) {
      alert('Please provide the content (at least 20 characters).');
      return;
    }

    setScraping(true);
    setScrapeResult(null);
    
    try {
      const payload = {
        url: formData.url.trim(),
        title: formData.title.trim(),
        content: formData.content.trim(),
        sourceType: formData.sourceType || null
      };

      // Include regulation IDs if provided
      if (formData.regulationIds && formData.regulationIds.length > 0) {
        payload.regulationIds = formData.regulationIds.map(id => parseInt(id)).filter(id => !isNaN(id));
      }

      const response = await fetch('/api/scrape-web-resources', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      });

      const result = await response.json();
      
      if (response.ok) {
        setScrapeResult({
          success: true,
          message: result.message,
          results: result.results
        });
        resetScrapeForm();
        loadResources();
      } else {
        setScrapeResult({
          success: false,
          message: result.error || 'Failed to save manual entry'
        });
      }
    } catch (error) {
      console.error('Error saving manual entry:', error);
      setScrapeResult({
        success: false,
        message: error.message || 'Error saving manual entry. Please try again.'
      });
    } finally {
      setScraping(false);
    }
  };

  const handleDelete = async (id) => {
    if (!confirm('Are you sure you want to delete this scraped resource? This will also delete all associated chunks.')) {
      return;
    }

    try {
      const response = await fetch(`/api/web-resources/${id}`, {
        method: 'DELETE'
      });

      if (response.ok) {
        setResources(prev => prev.filter(r => r.id !== id));
      } else {
        const error = await response.json();
        alert(`Error: ${error.error || 'Failed to delete resource'}`);
      }
    } catch (error) {
      console.error('Error deleting resource:', error);
      alert('Error deleting resource. Please try again.');
    }
  };

  const handleUpdate = async (id, updates) => {
    try {
      const response = await fetch(`/api/web-resources/${id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(updates)
      });

      if (response.ok) {
        const result = await response.json();
        setResources(prev => prev.map(r => r.id === id ? result.resource : r));
        setEditingResource(null);
      } else {
        const error = await response.json();
        alert(`Error: ${error.error || 'Failed to update resource'}`);
      }
    } catch (error) {
      console.error('Error updating resource:', error);
      alert('Error updating resource. Please try again.');
    }
  };

  const resetScrapeForm = () => {
    setFormData({
      url: '',
      urls: '',
      sourceType: '',
      regulationIds: [],
      title: '',
      content: ''
    });
    setShowScrapeForm(false);
    setEntryMode('scrape');
  };

  const sourceTypes = [
    'fda_guidance',
    'fda_regulation_preamble',
    'industry_resource',
    'regulatory_news',
    'guidance_document',
    'other'
  ];

  return (
    <div style={{
      padding: '24px',
      backgroundColor: '#ffffff',
      border: '1px solid #e5e7eb',
      borderRadius: '8px'
    }}>
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: '24px'
      }}>
        <h3 style={{
          margin: '0',
          fontSize: '18px',
          fontWeight: '600',
          color: '#374151',
          fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
        }}>
          Web Scraping for Title 21 Regulations
        </h3>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button
            onClick={() => {
              setEntryMode('scrape');
              setShowScrapeForm(true);
            }}
            style={{
              padding: '8px 16px',
              backgroundColor: '#4338ca',
              color: '#ffffff',
              border: 'none',
              borderRadius: '6px',
              fontSize: '14px',
              fontWeight: '500',
              cursor: 'pointer',
              fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
              transition: 'all 0.2s ease'
            }}
          >
            + Scrape Website
          </button>
          <button
            onClick={() => {
              setEntryMode('manual');
              setShowScrapeForm(true);
            }}
            style={{
              padding: '8px 16px',
              backgroundColor: '#059669',
              color: '#ffffff',
              border: 'none',
              borderRadius: '6px',
              fontSize: '14px',
              fontWeight: '500',
              cursor: 'pointer',
              fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
              transition: 'all 0.2s ease'
            }}
          >
            + Manual Entry
          </button>
        </div>
      </div>

      {/* Filters */}
      <div style={{
        display: 'flex',
        gap: '12px',
        marginBottom: '24px',
        padding: '16px',
        backgroundColor: '#f8fafc',
        borderRadius: '6px',
        border: '1px solid #e5e7eb'
      }}>
        <div style={{ flex: 1 }}>
          <label style={{
            display: 'block',
            marginBottom: '4px',
            fontSize: '12px',
            fontWeight: '500',
            color: '#6b7280',
            fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
          }}>
            Source Type
          </label>
          <select
            value={filters.sourceType}
            onChange={(e) => setFilters(prev => ({ ...prev, sourceType: e.target.value }))}
            style={{
              width: '100%',
              padding: '6px 10px',
              border: '1px solid #d1d5db',
              borderRadius: '6px',
              fontSize: '14px',
              fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
            }}
          >
            <option value="">All Types</option>
            {sourceTypes.map(type => (
              <option key={type} value={type}>{type.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase())}</option>
            ))}
          </select>
        </div>
        <div style={{ flex: 1 }}>
          <label style={{
            display: 'block',
            marginBottom: '4px',
            fontSize: '12px',
            fontWeight: '500',
            color: '#6b7280',
            fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
          }}>
            Status
          </label>
          <select
            value={filters.status}
            onChange={(e) => setFilters(prev => ({ ...prev, status: e.target.value }))}
            style={{
              width: '100%',
              padding: '6px 10px',
              border: '1px solid #d1d5db',
              borderRadius: '6px',
              fontSize: '14px',
              fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
            }}
          >
            <option value="active">Active</option>
            <option value="pending">Pending</option>
            <option value="error">Error</option>
            <option value="archived">Archived</option>
            <option value="">All Statuses</option>
          </select>
        </div>
      </div>

      {/* Scrape Form */}
      {showScrapeForm && (
        <div style={{
          marginBottom: '24px',
          padding: '20px',
          backgroundColor: '#f8fafc',
          border: '1px solid #e5e7eb',
          borderRadius: '8px'
        }}>
          <h4 style={{
            margin: '0 0 16px 0',
            fontSize: '16px',
            fontWeight: '600',
            color: '#374151',
            fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
          }}>
            {entryMode === 'manual' ? 'Manual Entry' : 'Scrape Website'}
          </h4>
          
          {entryMode === 'scrape' ? (
            <p style={{
              margin: '0 0 16px 0',
              padding: '12px',
              backgroundColor: '#fef3c7',
              border: '1px solid #fbbf24',
              borderRadius: '6px',
              fontSize: '13px',
              color: '#92400e',
              fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
            }}>
              <strong>Tip:</strong> Make sure the URL is correct and accessible. If you get a 404 error, the page may not exist or may have been moved. Try opening the URL in your browser first to verify it works.
            </p>
          ) : (
            <p style={{
              margin: '0 0 16px 0',
              padding: '12px',
              backgroundColor: '#d1fae5',
              border: '1px solid #10b981',
              borderRadius: '6px',
              fontSize: '13px',
              color: '#065f46',
              fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
            }}>
              <strong>Manual Entry:</strong> Use this when automated scraping is blocked (e.g., by bot detection). Copy the content from the webpage and paste it here. The content will be processed and made searchable just like scraped content.
            </p>
          )}
          
          <form onSubmit={handleScrape}>
            {entryMode === 'manual' ? (
              <>
                <div style={{ marginBottom: '16px' }}>
                  <label style={{
                    display: 'block',
                    marginBottom: '4px',
                    fontSize: '14px',
                    fontWeight: '500',
                    color: '#374151',
                    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
                  }}>
                    URL * <span style={{ fontSize: '12px', color: '#6b7280', fontWeight: 'normal' }}>(for reference, even if scraping is blocked)</span>
                  </label>
                  <input
                    type="url"
                    value={formData.url}
                    onChange={(e) => setFormData(prev => ({ ...prev, url: e.target.value }))}
                    style={{
                      width: '100%',
                      padding: '8px 12px',
                      border: '1px solid #d1d5db',
                      borderRadius: '6px',
                      fontSize: '14px',
                      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
                    }}
                    placeholder="https://www.fda.gov/..."
                    required
                  />
                </div>

                <div style={{ marginBottom: '16px' }}>
                  <label style={{
                    display: 'block',
                    marginBottom: '4px',
                    fontSize: '14px',
                    fontWeight: '500',
                    color: '#374151',
                    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
                  }}>
                    Title *
                  </label>
                  <input
                    type="text"
                    value={formData.title}
                    onChange={(e) => setFormData(prev => ({ ...prev, title: e.target.value }))}
                    style={{
                      width: '100%',
                      padding: '8px 12px',
                      border: '1px solid #d1d5db',
                      borderRadius: '6px',
                      fontSize: '14px',
                      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
                    }}
                    placeholder="Page title or document name"
                    required
                  />
                </div>

                <div style={{ marginBottom: '16px' }}>
                  <label style={{
                    display: 'block',
                    marginBottom: '4px',
                    fontSize: '14px',
                    fontWeight: '500',
                    color: '#374151',
                    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
                  }}>
                    Content * <span style={{ fontSize: '12px', color: '#6b7280', fontWeight: 'normal' }}>(paste the text content from the webpage)</span>
                  </label>
                  <textarea
                    value={formData.content}
                    onChange={(e) => setFormData(prev => ({ ...prev, content: e.target.value }))}
                    style={{
                      width: '100%',
                      padding: '8px 12px',
                      border: '1px solid #d1d5db',
                      borderRadius: '6px',
                      fontSize: '14px',
                      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
                      minHeight: '300px',
                      resize: 'vertical'
                    }}
                    placeholder="Paste the content from the webpage here..."
                    required
                  />
                  <p style={{
                    margin: '4px 0 0 0',
                    fontSize: '12px',
                    color: '#6b7280',
                    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
                  }}>
                    Minimum 20 characters. The content will be chunked and embedded for search.
                  </p>
                </div>
              </>
            ) : (
              <>
                <div style={{ marginBottom: '16px' }}>
                  <label style={{
                    display: 'block',
                    marginBottom: '4px',
                    fontSize: '14px',
                    fontWeight: '500',
                    color: '#374151',
                    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
                  }}>
                    Single URL
                  </label>
                  <input
                    type="url"
                    value={formData.url}
                    onChange={(e) => setFormData(prev => ({ ...prev, url: e.target.value }))}
                    style={{
                      width: '100%',
                      padding: '8px 12px',
                      border: '1px solid #d1d5db',
                      borderRadius: '6px',
                      fontSize: '14px',
                      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
                    }}
                    placeholder="https://www.fda.gov/..."
                  />
                </div>

                <div style={{ marginBottom: '16px' }}>
                  <label style={{
                    display: 'block',
                    marginBottom: '4px',
                    fontSize: '14px',
                    fontWeight: '500',
                    color: '#374151',
                    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
                  }}>
                    Multiple URLs (one per line)
                  </label>
                  <textarea
                    value={formData.urls}
                    onChange={(e) => setFormData(prev => ({ ...prev, urls: e.target.value }))}
                    style={{
                      width: '100%',
                      padding: '8px 12px',
                      border: '1px solid #d1d5db',
                      borderRadius: '6px',
                      fontSize: '14px',
                      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
                      minHeight: '100px',
                      resize: 'vertical'
                    }}
                    placeholder="https://www.fda.gov/...&#10;https://www.fda.gov/..."
                  />
                </div>
              </>
            )}

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '16px' }}>
              <div>
                <label style={{
                  display: 'block',
                  marginBottom: '4px',
                  fontSize: '14px',
                  fontWeight: '500',
                  color: '#374151',
                  fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
                }}>
                  Source Type
                </label>
                <select
                  value={formData.sourceType}
                  onChange={(e) => setFormData(prev => ({ ...prev, sourceType: e.target.value }))}
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    border: '1px solid #d1d5db',
                    borderRadius: '6px',
                    fontSize: '14px',
                    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
                  }}
                >
                  <option value="">Select type (optional)</option>
                  {sourceTypes.map(type => (
                    <option key={type} value={type}>{type.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase())}</option>
                  ))}
                </select>
              </div>
              
              <div>
                <label style={{
                  display: 'block',
                  marginBottom: '4px',
                  fontSize: '14px',
                  fontWeight: '500',
                  color: '#374151',
                  fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
                }}>
                  Link to Regulations <span style={{ fontSize: '12px', color: '#6b7280', fontWeight: 'normal' }}>(optional)</span>
                </label>
                <select
                  multiple
                  value={formData.regulationIds.map(id => String(id))}
                  onChange={(e) => {
                    const selectedIds = Array.from(e.target.selectedOptions, option => parseInt(option.value));
                    setFormData(prev => ({ ...prev, regulationIds: selectedIds }));
                  }}
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    border: '1px solid #d1d5db',
                    borderRadius: '6px',
                    fontSize: '14px',
                    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
                    minHeight: '100px',
                    backgroundColor: '#ffffff'
                  }}
                  disabled={loadingRegulations}
                >
                  {loadingRegulations ? (
                    <option>Loading regulations...</option>
                  ) : regulations.length === 0 ? (
                    <option>No regulations available. Index some CFR regulations first.</option>
                  ) : (
                    regulations
                      .sort((a, b) => {
                        // Sort by regulation_id (e.g., "part-11" comes before "part-820")
                        if (a.regulationId && b.regulationId) {
                          return a.regulationId.localeCompare(b.regulationId);
                        }
                        return 0;
                      })
                      .map(reg => (
                        <option key={reg.id} value={reg.id}>
                          {reg.regulationId} - {reg.title} {reg.regulationType ? `(${reg.regulationType})` : ''}
                        </option>
                      ))
                  )}
                </select>
                <p style={{
                  margin: '4px 0 0 0',
                  fontSize: '12px',
                  color: '#6b7280',
                  fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
                }}>
                  Hold Ctrl/Cmd to select multiple regulations
                </p>
                {formData.regulationIds.length > 0 && (
                  <div style={{
                    marginTop: '8px',
                    padding: '8px',
                    backgroundColor: '#f3f4f6',
                    borderRadius: '4px',
                    fontSize: '12px',
                    color: '#374151'
                  }}>
                    <strong>Selected:</strong> {formData.regulationIds.length} regulation{formData.regulationIds.length !== 1 ? 's' : ''}
                  </div>
                )}
              </div>
            </div>

            <div style={{ display: 'flex', gap: '12px' }}>
              <button
                type="submit"
                disabled={scraping}
                style={{
                  padding: '10px 20px',
                  backgroundColor: scraping ? '#9ca3af' : (entryMode === 'manual' ? '#059669' : '#4338ca'),
                  color: '#ffffff',
                  border: 'none',
                  borderRadius: '6px',
                  fontSize: '14px',
                  fontWeight: '500',
                  cursor: scraping ? 'not-allowed' : 'pointer',
                  fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
                }}
              >
                {scraping ? (entryMode === 'manual' ? 'Processing...' : 'Scraping...') : (entryMode === 'manual' ? 'Save & Process' : 'Start Scraping')}
              </button>
              <button
                type="button"
                onClick={resetScrapeForm}
                disabled={scraping}
                style={{
                  padding: '10px 20px',
                  backgroundColor: '#6b7280',
                  color: '#ffffff',
                  border: 'none',
                  borderRadius: '6px',
                  fontSize: '14px',
                  fontWeight: '500',
                  cursor: scraping ? 'not-allowed' : 'pointer',
                  fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
                }}
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Scrape Result */}
      {scrapeResult && (
        <div style={{
          marginBottom: '24px',
          padding: '16px',
          backgroundColor: scrapeResult.success ? '#d1fae5' : '#fee2e2',
          border: `1px solid ${scrapeResult.success ? '#10b981' : '#ef4444'}`,
          borderRadius: '6px',
          color: scrapeResult.success ? '#065f46' : '#991b1b',
          fontSize: '14px',
          fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
        }}>
          <strong>{scrapeResult.success ? 'Success:' : 'Error:'}</strong> {scrapeResult.message}
          {scrapeResult.results && (
            <div style={{ marginTop: '8px', fontSize: '12px' }}>
              {scrapeResult.results.map((result, idx) => (
                <div key={idx} style={{ marginTop: '4px' }}>
                  {result.success ? (
                    <span>✓ {result.url}: {result.chunksCreated} chunks created</span>
                  ) : (
                    <span>✗ {result.url}: {result.error}</span>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Resources List */}
      {loading ? (
        <div style={{
          textAlign: 'center',
          padding: '40px',
          color: '#6b7280',
          fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
        }}>
          Loading resources...
        </div>
      ) : resources.length === 0 ? (
        <div style={{
          textAlign: 'center',
          padding: '40px',
          color: '#6b7280',
          fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
        }}>
          <div style={{ fontSize: '32px', marginBottom: '12px' }}>🌐</div>
          <p style={{ margin: '0', fontSize: '14px' }}>No scraped resources yet</p>
        </div>
      ) : (
        <div style={{
          display: 'grid',
          gap: '12px'
        }}>
          {resources.map((resource) => (
            <div key={resource.id} style={{
              padding: '16px',
              backgroundColor: '#f8fafc',
              border: '1px solid #e5e7eb',
              borderRadius: '8px',
              transition: 'all 0.2s ease'
            }}>
              <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'flex-start',
                marginBottom: '8px'
              }}>
                <div style={{ flex: 1 }}>
                  <h4 style={{
                    margin: '0 0 4px 0',
                    fontSize: '16px',
                    fontWeight: '600',
                    color: '#374151',
                    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
                  }}>
                    <a
                      href={resource.sourceUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{
                        color: '#4338ca',
                        textDecoration: 'none'
                      }}
                      onMouseEnter={(e) => e.target.style.textDecoration = 'underline'}
                      onMouseLeave={(e) => e.target.style.textDecoration = 'none'}
                    >
                      {resource.title}
                    </a>
                  </h4>
                  <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginTop: '8px' }}>
                    {resource.sourceType && (
                      <span style={{
                        display: 'inline-block',
                        padding: '2px 8px',
                        backgroundColor: '#e0e7ff',
                        color: '#4338ca',
                        borderRadius: '12px',
                        fontSize: '12px',
                        fontWeight: '500',
                        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
                      }}>
                        {resource.sourceType.replace('_', ' ')}
                      </span>
                    )}
                    <span style={{
                      display: 'inline-block',
                      padding: '2px 8px',
                      backgroundColor: resource.status === 'active' ? '#d1fae5' : resource.status === 'error' ? '#fee2e2' : '#fef3c7',
                      color: resource.status === 'active' ? '#065f46' : resource.status === 'error' ? '#991b1b' : '#92400e',
                      borderRadius: '12px',
                      fontSize: '12px',
                      fontWeight: '500',
                      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
                    }}>
                      {resource.status}
                    </span>
                    {resource.linkedRegulationCount > 0 && (
                      <span style={{
                        display: 'inline-block',
                        padding: '2px 8px',
                        backgroundColor: '#f3f4f6',
                        color: '#6b7280',
                        borderRadius: '12px',
                        fontSize: '12px',
                        fontWeight: '500',
                        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
                      }}>
                        {resource.linkedRegulationCount} linked regulation{resource.linkedRegulationCount !== 1 ? 's' : ''}
                      </span>
                    )}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button
                    onClick={() => handleDelete(resource.id)}
                    style={{
                      padding: '4px 8px',
                      backgroundColor: '#fef2f2',
                      color: '#dc2626',
                      border: 'none',
                      borderRadius: '4px',
                      fontSize: '12px',
                      cursor: 'pointer',
                      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
                    }}
                  >
                    Delete
                  </button>
                </div>
              </div>
              
              <div style={{
                marginTop: '8px',
                fontSize: '12px',
                color: '#6b7280',
                fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
              }}>
                <div>Domain: {resource.domain || 'N/A'}</div>
                <div>Scraped: {new Date(resource.scrapedAt).toLocaleString()}</div>
                {resource.lastCheckedAt && (
                  <div>Last checked: {new Date(resource.lastCheckedAt).toLocaleString()}</div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

