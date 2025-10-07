import { useState, useEffect } from 'react';

export default function ExternalResources() {
  const [resources, setResources] = useState([]);
  const [loading, setLoading] = useState(false);
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingResource, setEditingResource] = useState(null);
  const [formData, setFormData] = useState({
    title: '',
    url: '',
    description: '',
    category: '',
    tags: ''
  });

  // Load external resources on component mount
  useEffect(() => {
    loadResources();
  }, []);

  const loadResources = async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/external-resources');
      if (response.ok) {
        const data = await response.json();
        setResources(data.resources || []);
      } else {
        console.error('Failed to load external resources');
      }
    } catch (error) {
      console.error('Error loading external resources:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (!formData.title.trim() || !formData.url.trim()) {
      alert('Please fill in title and URL fields.');
      return;
    }

    try {
      const url = editingResource 
        ? `/api/external-resources/${editingResource.id}`
        : '/api/external-resources';
      
      const method = editingResource ? 'PUT' : 'POST';
      
      const response = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          ...formData,
          tags: formData.tags.split(',').map(tag => tag.trim()).filter(tag => tag)
        })
      });

      if (response.ok) {
        const result = await response.json();
        if (editingResource) {
          setResources(prev => prev.map(r => r.id === editingResource.id ? result.resource : r));
        } else {
          setResources(prev => [...prev, result.resource]);
        }
        resetForm();
      } else {
        const error = await response.json();
        alert(`Error: ${error.message || 'Failed to save resource'}`);
      }
    } catch (error) {
      console.error('Error saving resource:', error);
      alert('Error saving resource. Please try again.');
    }
  };

  const handleDelete = async (id) => {
    if (!confirm('Are you sure you want to delete this resource?')) {
      return;
    }

    try {
      const response = await fetch(`/api/external-resources/${id}`, {
        method: 'DELETE'
      });

      if (response.ok) {
        setResources(prev => prev.filter(r => r.id !== id));
      } else {
        const error = await response.json();
        alert(`Error: ${error.message || 'Failed to delete resource'}`);
      }
    } catch (error) {
      console.error('Error deleting resource:', error);
      alert('Error deleting resource. Please try again.');
    }
  };

  const handleEdit = (resource) => {
    setEditingResource(resource);
    setFormData({
      title: resource.title,
      url: resource.url,
      description: resource.description || '',
      category: resource.category || '',
      tags: resource.tags ? resource.tags.join(', ') : ''
    });
    setShowAddForm(true);
  };

  const resetForm = () => {
    setFormData({
      title: '',
      url: '',
      description: '',
      category: '',
      tags: ''
    });
    setEditingResource(null);
    setShowAddForm(false);
  };

  const validateUrl = (url) => {
    try {
      new URL(url);
      return true;
    } catch {
      return false;
    }
  };

  const categories = [
    'Documentation',
    'Training',
    'Reference',
    'Tool',
    'API',
    'Support',
    'Other'
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
          External Resources
        </h3>
        <button
          onClick={() => setShowAddForm(true)}
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
          + Add Resource
        </button>
      </div>

      {/* Add/Edit Form */}
      {showAddForm && (
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
            {editingResource ? 'Edit Resource' : 'Add New Resource'}
          </h4>
          
          <form onSubmit={handleSubmit}>
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
                  placeholder="Resource title"
                  required
                />
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
                  Category
                </label>
                <select
                  value={formData.category}
                  onChange={(e) => setFormData(prev => ({ ...prev, category: e.target.value }))}
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    border: '1px solid #d1d5db',
                    borderRadius: '6px',
                    fontSize: '14px',
                    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
                  }}
                >
                  <option value="">Select category</option>
                  {categories.map(cat => (
                    <option key={cat} value={cat}>{cat}</option>
                  ))}
                </select>
              </div>
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
                URL *
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
                placeholder="https://example.com"
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
                Description
              </label>
              <textarea
                value={formData.description}
                onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
                style={{
                  width: '100%',
                  padding: '8px 12px',
                  border: '1px solid #d1d5db',
                  borderRadius: '6px',
                  fontSize: '14px',
                  fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
                  minHeight: '80px',
                  resize: 'vertical'
                }}
                placeholder="Brief description of the resource"
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
                Tags
              </label>
              <input
                type="text"
                value={formData.tags}
                onChange={(e) => setFormData(prev => ({ ...prev, tags: e.target.value }))}
                style={{
                  width: '100%',
                  padding: '8px 12px',
                  border: '1px solid #d1d5db',
                  borderRadius: '6px',
                  fontSize: '14px',
                  fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
                }}
                placeholder="tag1, tag2, tag3"
              />
              <p style={{
                margin: '4px 0 0 0',
                fontSize: '12px',
                color: '#6b7280',
                fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
              }}>
                Separate tags with commas
              </p>
            </div>

            <div style={{ display: 'flex', gap: '12px' }}>
              <button
                type="submit"
                style={{
                  padding: '10px 20px',
                  backgroundColor: '#4338ca',
                  color: '#ffffff',
                  border: 'none',
                  borderRadius: '6px',
                  fontSize: '14px',
                  fontWeight: '500',
                  cursor: 'pointer',
                  fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
                }}
              >
                {editingResource ? 'Update Resource' : 'Add Resource'}
              </button>
              <button
                type="button"
                onClick={resetForm}
                style={{
                  padding: '10px 20px',
                  backgroundColor: '#6b7280',
                  color: '#ffffff',
                  border: 'none',
                  borderRadius: '6px',
                  fontSize: '14px',
                  fontWeight: '500',
                  cursor: 'pointer',
                  fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
                }}
              >
                Cancel
              </button>
            </div>
          </form>
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
          <div style={{ fontSize: '32px', marginBottom: '12px' }}>🔗</div>
          <p style={{ margin: '0', fontSize: '14px' }}>No external resources added yet</p>
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
                      href={resource.url}
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
                  {resource.category && (
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
                      {resource.category}
                    </span>
                  )}
                </div>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button
                    onClick={() => handleEdit(resource)}
                    style={{
                      padding: '4px 8px',
                      backgroundColor: '#f3f4f6',
                      color: '#374151',
                      border: 'none',
                      borderRadius: '4px',
                      fontSize: '12px',
                      cursor: 'pointer',
                      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
                    }}
                  >
                    Edit
                  </button>
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
              
              {resource.description && (
                <p style={{
                  margin: '0 0 8px 0',
                  fontSize: '14px',
                  color: '#6b7280',
                  fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
                }}>
                  {resource.description}
                </p>
              )}
              
              {resource.tags && resource.tags.length > 0 && (
                <div style={{
                  display: 'flex',
                  flexWrap: 'wrap',
                  gap: '4px'
                }}>
                  {resource.tags.map((tag, index) => (
                    <span key={index} style={{
                      padding: '2px 6px',
                      backgroundColor: '#f3f4f6',
                      color: '#6b7280',
                      borderRadius: '4px',
                      fontSize: '12px',
                      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
                    }}>
                      {tag}
                    </span>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
