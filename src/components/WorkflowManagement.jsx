import { useState, useEffect } from 'react';
import WorkflowImport from './WorkflowImport.jsx';

export default function WorkflowManagement() {
  const [templates, setTemplates] = useState([]);
  const [selectedTemplate, setSelectedTemplate] = useState(null);
  const [steps, setSteps] = useState([]);
  const [loading, setLoading] = useState(false);
  const [showTemplateForm, setShowTemplateForm] = useState(false);
  const [showStepForm, setShowStepForm] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState(null);
  const [editingStep, setEditingStep] = useState(null);
  const [activeTab, setActiveTab] = useState('templates');

  const [templateForm, setTemplateForm] = useState({
    name: '',
    description: '',
    category: 'Quality',
    isActive: true,
    triggerKeywords: [],
    documentTemplate: ''
  });

  const [stepForm, setStepForm] = useState({
    workflowTemplateId: null,
    stepOrder: 1,
    questionText: '',
    inputType: 'text',
    options: {},
    validationRules: {},
    conditionalLogic: {},
    isRequired: false,
    placeholderText: '',
    helpText: '',
    // Group configuration fields
    groupId: '',
    groupOrder: null,
    isLastInGroup: false,
    groupSynthesisPrompt: '',
    groupOutputVariable: ''
  });

  const inputTypes = [
    { value: 'text', label: 'Text Input' },
    { value: 'textarea', label: 'Text Area' },
    { value: 'select', label: 'Dropdown/Select' },
    { value: 'radio', label: 'Radio Buttons' },
    { value: 'checkbox', label: 'Checkboxes' },
    { value: 'date', label: 'Date Picker' },
    { value: 'file', label: 'File Upload' }
  ];

  const categories = [
    'Quality',
    'Regulatory',
    'Operations',
    'Safety',
    'Training',
    'Other'
  ];

  // Load workflow templates on component mount
  useEffect(() => {
    loadTemplates();
  }, []);

  const loadTemplates = async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/workflow-management');
      if (response.ok) {
        const data = await response.json();
        setTemplates(data.templates || []);
      } else {
        console.error('Failed to load workflow templates');
      }
    } catch (error) {
      console.error('Error loading workflow templates:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadTemplateDetails = async (templateId) => {
    setLoading(true);
    try {
      console.log('Loading template details for ID:', templateId);
      const response = await fetch(`/api/workflow-management/${templateId}`);
      
      if (response.ok) {
        const data = await response.json();
        console.log('Template details loaded:', data);
        
        if (data.success && data.template) {
          setSelectedTemplate(data.template);
          setSteps(data.template.steps || []);
          
          // Update step form with the selected template ID
          setStepForm(prev => ({
            ...prev,
            workflowTemplateId: data.template.id,
            stepOrder: (data.template.steps || []).length + 1
          }));
        } else {
          console.error('Invalid response structure:', data);
          alert('Failed to load template details. Please try again.');
        }
      } else {
        const errorText = await response.text();
        console.error('Failed to load template details:', response.status, errorText);
        alert(`Failed to load template details: ${response.status}`);
      }
    } catch (error) {
      console.error('Error loading template details:', error);
      alert('Error loading template details. Please check the console for details.');
    } finally {
      setLoading(false);
    }
  };

  const handleTemplateSubmit = async (e) => {
    e.preventDefault();
    
    if (!templateForm.name.trim()) {
      alert('Please enter a template name.');
      return;
    }

    try {
      const url = editingTemplate 
        ? `/api/workflow-management/${editingTemplate.id}`
        : '/api/workflow-management';
      
      const method = editingTemplate ? 'PUT' : 'POST';
      
      const response = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(templateForm)
      });

      if (response.ok) {
        const result = await response.json();
        if (editingTemplate) {
          setTemplates(prev => prev.map(t => t.id === editingTemplate.id ? result.template : t));
        } else {
          setTemplates(prev => [...prev, result.template]);
        }
        resetTemplateForm();
      } else {
        const error = await response.json();
        alert(`Error: ${error.error || 'Failed to save template'}`);
      }
    } catch (error) {
      console.error('Error saving template:', error);
      alert('Error saving template. Please try again.');
    }
  };

  const handleStepSubmit = async (e) => {
    e.preventDefault();
    
    if (!stepForm.questionText.trim() || !stepForm.inputType) {
      alert('Please enter question text and select input type.');
      return;
    }

    try {
      const url = editingStep 
        ? `/api/workflow-management/workflow-steps/${editingStep.id}`
        : '/api/workflow-management/workflow-steps';
      
      const method = editingStep ? 'PUT' : 'POST';
      
      const response = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(stepForm)
      });

      if (response.ok) {
        const result = await response.json();
        if (editingStep) {
          setSteps(prev => prev.map(s => s.id === editingStep.id ? result.step : s));
        } else {
          setSteps(prev => [...prev, result.step]);
        }
        resetStepForm();
      } else {
        const error = await response.json();
        alert(`Error: ${error.error || 'Failed to save step'}`);
      }
    } catch (error) {
      console.error('Error saving step:', error);
      alert('Error saving step. Please try again.');
    }
  };

  const handleDeleteTemplate = async (id) => {
    if (!confirm('Are you sure you want to delete this workflow template? This will also delete all associated steps.')) {
      return;
    }

    try {
      const response = await fetch(`/api/workflow-management/${id}`, {
        method: 'DELETE'
      });

      if (response.ok) {
        setTemplates(prev => prev.filter(t => t.id !== id));
        if (selectedTemplate && selectedTemplate.id === id) {
          setSelectedTemplate(null);
          setSteps([]);
        }
        alert('Workflow template deleted successfully!');
      } else {
        const error = await response.json();
        
        // Check if deletion failed due to existing instances
        if (error.canDeactivate && error.instanceCount) {
          const deactivate = confirm(
            `${error.error}\n\nWould you like to deactivate this workflow instead? ` +
            `This will prevent new workflows from starting while preserving existing data.`
          );
          
          if (deactivate) {
            // Deactivate the workflow
            await handleDeactivateTemplate(id);
          }
        } else {
          alert(`Error: ${error.error || 'Failed to delete template'}`);
        }
      }
    } catch (error) {
      console.error('Error deleting template:', error);
      alert('Error deleting template. Please try again.');
    }
  };

  const handleDeactivateTemplate = async (id) => {
    try {
      const template = templates.find(t => t.id === id);
      if (!template) return;

      const response = await fetch(`/api/workflow-management/${id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          ...template,
          isActive: false
        })
      });

      if (response.ok) {
        const result = await response.json();
        setTemplates(prev => prev.map(t => t.id === id ? result.template : t));
        alert('Workflow template deactivated successfully! It will no longer be offered to users.');
      } else {
        const error = await response.json();
        alert(`Error: ${error.error || 'Failed to deactivate template'}`);
      }
    } catch (error) {
      console.error('Error deactivating template:', error);
      alert('Error deactivating template. Please try again.');
    }
  };

  const handleDeleteStep = async (id) => {
    if (!confirm('Are you sure you want to delete this workflow step?')) {
      return;
    }

    try {
      const response = await fetch(`/api/workflow-management/workflow-steps/${id}`, {
        method: 'DELETE'
      });

      if (response.ok) {
        setSteps(prev => prev.filter(s => s.id !== id));
      } else {
        const error = await response.json();
        alert(`Error: ${error.error || 'Failed to delete step'}`);
      }
    } catch (error) {
      console.error('Error deleting step:', error);
      alert('Error deleting step. Please try again.');
    }
  };

  const handleEditTemplate = (template) => {
    setEditingTemplate(template);
    setTemplateForm({
      name: template.name,
      description: template.description || '',
      category: template.category || 'Quality',
      isActive: template.isActive,
      triggerKeywords: template.triggerKeywords || [],
      documentTemplate: template.documentTemplate || ''
    });
    setShowTemplateForm(true);
  };

  const handleEditStep = (step) => {
    setEditingStep(step);
    setStepForm({
      workflowTemplateId: selectedTemplate?.id,
      stepOrder: step.stepOrder,
      questionText: step.questionText,
      inputType: step.inputType,
      options: step.options || {},
      validationRules: step.validationRules || {},
      conditionalLogic: step.conditionalLogic || {},
      isRequired: step.isRequired,
      placeholderText: step.placeholderText || '',
      helpText: step.helpText || '',
      groupId: step.groupId || '',
      groupOrder: step.groupOrder || null,
      isLastInGroup: step.isLastInGroup || false,
      groupSynthesisPrompt: step.groupSynthesisPrompt || '',
      groupOutputVariable: step.groupOutputVariable || ''
    });
    setShowStepForm(true);
  };

  const resetTemplateForm = () => {
    setTemplateForm({
      name: '',
      description: '',
      category: 'Quality',
      isActive: true,
      triggerKeywords: [],
      documentTemplate: ''
    });
    setEditingTemplate(null);
    setShowTemplateForm(false);
  };

  const resetStepForm = () => {
    setStepForm({
      workflowTemplateId: selectedTemplate?.id,
      stepOrder: steps.length + 1,
      questionText: '',
      inputType: 'text',
      options: {},
      validationRules: {},
      conditionalLogic: {},
      isRequired: false,
      placeholderText: '',
      helpText: '',
      groupId: '',
      groupOrder: null,
      isLastInGroup: false,
      groupSynthesisPrompt: '',
      groupOutputVariable: ''
    });
    setEditingStep(null);
    setShowStepForm(false);
  };

  const addKeyword = () => {
    const keyword = prompt('Enter keyword:');
    if (keyword && keyword.trim()) {
      setTemplateForm(prev => ({
        ...prev,
        triggerKeywords: [...prev.triggerKeywords, keyword.trim()]
      }));
    }
  };

  const removeKeyword = (index) => {
    setTemplateForm(prev => ({
      ...prev,
      triggerKeywords: prev.triggerKeywords.filter((_, i) => i !== index)
    }));
  };

  const addOption = () => {
    const option = prompt('Enter option:');
    if (option && option.trim()) {
      const newOptions = {
        ...stepForm.options,
        choices: [...(stepForm.options.choices || []), option.trim()]
      };
      setStepForm(prev => ({ ...prev, options: newOptions }));
    }
  };

  const removeOption = (index) => {
    const newOptions = {
      ...stepForm.options,
      choices: stepForm.options.choices?.filter((_, i) => i !== index) || []
    };
    setStepForm(prev => ({ ...prev, options: newOptions }));
  };

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
          Workflow Management
        </h3>
        <button
          onClick={() => setShowTemplateForm(true)}
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
          + New Workflow
        </button>
      </div>

      {/* Tab Navigation */}
      <div style={{display: 'flex', gap: '8px', marginBottom: '20px', justifyContent: 'center', flexWrap: 'wrap'}}>
        <button
          onClick={() => setActiveTab('templates')}
          style={{
            padding: '8px 16px',
            backgroundColor: activeTab === 'templates' ? '#4338ca' : '#f3f4f6',
            color: activeTab === 'templates' ? 'white' : '#374151',
            border: 'none',
            borderRadius: '6px',
            cursor: 'pointer',
            fontSize: '14px',
            fontWeight: '500',
            fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
            transition: 'all 0.2s ease'
          }}
        >
          Workflow Templates
        </button>
        <button
          onClick={() => setActiveTab('import')}
          style={{
            padding: '8px 16px',
            backgroundColor: activeTab === 'import' ? '#4338ca' : '#f3f4f6',
            color: activeTab === 'import' ? 'white' : '#374151',
            border: 'none',
            borderRadius: '6px',
            cursor: 'pointer',
            fontSize: '14px',
            fontWeight: '500',
            fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
            transition: 'all 0.2s ease'
          }}
        >
          Import from Spreadsheet
        </button>
        {selectedTemplate && (
          <button
            onClick={() => setActiveTab('steps')}
            style={{
              padding: '8px 16px',
              backgroundColor: activeTab === 'steps' ? '#4338ca' : '#f3f4f6',
              color: activeTab === 'steps' ? 'white' : '#374151',
              border: 'none',
              borderRadius: '6px',
              cursor: 'pointer',
              fontSize: '14px',
              fontWeight: '500',
              fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
              transition: 'all 0.2s ease'
            }}
          >
            Steps: {selectedTemplate.name}
          </button>
        )}
      </div>

      {/* Template Form */}
      {showTemplateForm && (
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
            {editingTemplate ? 'Edit Workflow Template' : 'Create New Workflow Template'}
          </h4>
          
          <form onSubmit={handleTemplateSubmit}>
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
                  Template Name *
                </label>
                <input
                  type="text"
                  value={templateForm.name}
                  onChange={(e) => setTemplateForm(prev => ({ ...prev, name: e.target.value }))}
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    border: '1px solid #d1d5db',
                    borderRadius: '6px',
                    fontSize: '14px',
                    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
                  }}
                  placeholder="e.g., CAPA Workflow"
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
                  value={templateForm.category}
                  onChange={(e) => setTemplateForm(prev => ({ ...prev, category: e.target.value }))}
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    border: '1px solid #d1d5db',
                    borderRadius: '6px',
                    fontSize: '14px',
                    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
                  }}
                >
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
                Description
              </label>
              <textarea
                value={templateForm.description}
                onChange={(e) => setTemplateForm(prev => ({ ...prev, description: e.target.value }))}
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
                placeholder="Brief description of this workflow"
              />
            </div>

            <div style={{ marginBottom: '16px' }}>
              <label style={{
                display: 'block',
                marginBottom: '8px',
                fontSize: '14px',
                fontWeight: '500',
                color: '#374151',
                fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
              }}>
                Trigger Keywords
              </label>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginBottom: '8px' }}>
                {templateForm.triggerKeywords.map((keyword, index) => (
                  <span key={index} style={{
                    padding: '4px 8px',
                    backgroundColor: '#e0e7ff',
                    color: '#4338ca',
                    borderRadius: '4px',
                    fontSize: '12px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px'
                  }}>
                    {keyword}
                    <button
                      type="button"
                      onClick={() => removeKeyword(index)}
                      style={{
                        background: 'none',
                        border: 'none',
                        color: '#4338ca',
                        cursor: 'pointer',
                        fontSize: '12px',
                        padding: '0',
                        marginLeft: '4px'
                      }}
                    >
                      ×
                    </button>
                  </span>
                ))}
              </div>
              <button
                type="button"
                onClick={addKeyword}
                style={{
                  padding: '6px 12px',
                  backgroundColor: '#f3f4f6',
                  color: '#374151',
                  border: '1px solid #d1d5db',
                  borderRadius: '4px',
                  fontSize: '12px',
                  cursor: 'pointer',
                  fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
                }}
              >
                + Add Keyword
              </button>
            </div>

            <div style={{ marginBottom: '16px' }}>
              <label style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                fontSize: '14px',
                fontWeight: '500',
                color: '#374151',
                fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
              }}>
                <input
                  type="checkbox"
                  checked={templateForm.isActive}
                  onChange={(e) => setTemplateForm(prev => ({ ...prev, isActive: e.target.checked }))}
                />
                Active (workflow can be triggered in chat)
              </label>
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
                Document Template
              </label>
              <textarea
                value={templateForm.documentTemplate}
                onChange={(e) => setTemplateForm(prev => ({ ...prev, documentTemplate: e.target.value }))}
                style={{
                  width: '100%',
                  padding: '8px 12px',
                  border: '1px solid #d1d5db',
                  borderRadius: '6px',
                  fontSize: '14px',
                  fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
                  minHeight: '120px',
                  resize: 'vertical'
                }}
                placeholder="Template for generating final documents. Use {{variable_name}} for placeholders."
              />
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
                {editingTemplate ? 'Update Template' : 'Create Template'}
              </button>
              <button
                type="button"
                onClick={resetTemplateForm}
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

      {/* Step Form */}
      {showStepForm && selectedTemplate && (
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
            {editingStep ? 'Edit Workflow Step' : 'Add New Workflow Step'}
          </h4>
          
          <form onSubmit={handleStepSubmit}>
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
                  Step Order
                </label>
                <input
                  type="number"
                  value={stepForm.stepOrder}
                  onChange={(e) => setStepForm(prev => ({ ...prev, stepOrder: parseInt(e.target.value) || 1 }))}
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    border: '1px solid #d1d5db',
                    borderRadius: '6px',
                    fontSize: '14px',
                    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
                  }}
                  min="1"
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
                  Input Type *
                </label>
                <select
                  value={stepForm.inputType}
                  onChange={(e) => setStepForm(prev => ({ ...prev, inputType: e.target.value }))}
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    border: '1px solid #d1d5db',
                    borderRadius: '6px',
                    fontSize: '14px',
                    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
                  }}
                  required
                >
                  {inputTypes.map(type => (
                    <option key={type.value} value={type.value}>{type.label}</option>
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
                Question Text *
              </label>
              <textarea
                value={stepForm.questionText}
                onChange={(e) => setStepForm(prev => ({ ...prev, questionText: e.target.value }))}
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
                placeholder="Enter the question or prompt for this step"
                required
              />
            </div>

            {(stepForm.inputType === 'select' || stepForm.inputType === 'radio' || stepForm.inputType === 'checkbox') && (
              <div style={{ marginBottom: '16px' }}>
                <label style={{
                  display: 'block',
                  marginBottom: '8px',
                  fontSize: '14px',
                  fontWeight: '500',
                  color: '#374151',
                  fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
                }}>
                  Options
                </label>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginBottom: '8px' }}>
                  {stepForm.options.choices?.map((choice, index) => (
                    <span key={index} style={{
                      padding: '4px 8px',
                      backgroundColor: '#e0e7ff',
                      color: '#4338ca',
                      borderRadius: '4px',
                      fontSize: '12px',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '4px'
                    }}>
                      {choice}
                      <button
                        type="button"
                        onClick={() => removeOption(index)}
                        style={{
                          background: 'none',
                          border: 'none',
                          color: '#4338ca',
                          cursor: 'pointer',
                          fontSize: '12px',
                          padding: '0',
                          marginLeft: '4px'
                        }}
                      >
                        ×
                      </button>
                    </span>
                  ))}
                </div>
                <button
                  type="button"
                  onClick={addOption}
                  style={{
                    padding: '6px 12px',
                    backgroundColor: '#f3f4f6',
                    color: '#374151',
                    border: '1px solid #d1d5db',
                    borderRadius: '4px',
                    fontSize: '12px',
                    cursor: 'pointer',
                    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
                  }}
                >
                  + Add Option
                </button>
              </div>
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
                  Placeholder Text
                </label>
                <input
                  type="text"
                  value={stepForm.placeholderText}
                  onChange={(e) => setStepForm(prev => ({ ...prev, placeholderText: e.target.value }))}
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    border: '1px solid #d1d5db',
                    borderRadius: '6px',
                    fontSize: '14px',
                    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
                  }}
                  placeholder="Optional placeholder text"
                />
              </div>
              
              <div>
                <label style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  fontSize: '14px',
                  fontWeight: '500',
                  color: '#374151',
                  fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
                }}>
                  <input
                    type="checkbox"
                    checked={stepForm.isRequired}
                    onChange={(e) => setStepForm(prev => ({ ...prev, isRequired: e.target.checked }))}
                  />
                  Required Field
                </label>
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
                Help Text
              </label>
              <textarea
                value={stepForm.helpText}
                onChange={(e) => setStepForm(prev => ({ ...prev, helpText: e.target.value }))}
                style={{
                  width: '100%',
                  padding: '8px 12px',
                  border: '1px solid #d1d5db',
                  borderRadius: '6px',
                  fontSize: '14px',
                  fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
                  minHeight: '60px',
                  resize: 'vertical'
                }}
                placeholder="Optional help text to guide the user"
              />
            </div>

            {/* Group Configuration Section */}
            <div style={{
              marginBottom: '16px',
              padding: '16px',
              backgroundColor: '#f0f9ff',
              border: '1px solid #bfdbfe',
              borderRadius: '6px'
            }}>
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                marginBottom: '12px'
              }}>
                <h5 style={{
                  margin: 0,
                  fontSize: '14px',
                  fontWeight: '600',
                  color: '#1e40af',
                  fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
                }}>
                  🔗 Question Grouping (Advanced)
                </h5>
                <div style={{
                  fontSize: '11px',
                  color: '#6b7280',
                  fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
                }}>
                  Group questions for AI synthesis
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '12px' }}>
                <div>
                  <label style={{
                    display: 'block',
                    marginBottom: '4px',
                    fontSize: '13px',
                    fontWeight: '500',
                    color: '#374151',
                    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
                  }}>
                    Group ID
                  </label>
                  <input
                    type="text"
                    value={stepForm.groupId}
                    onChange={(e) => setStepForm(prev => ({ ...prev, groupId: e.target.value }))}
                    style={{
                      width: '100%',
                      padding: '6px 10px',
                      border: '1px solid #d1d5db',
                      borderRadius: '4px',
                      fontSize: '13px',
                      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
                    }}
                    placeholder="e.g., root_cause_group"
                  />
                  <div style={{
                    fontSize: '11px',
                    color: '#6b7280',
                    marginTop: '2px',
                    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
                  }}>
                    Leave empty for ungrouped questions
                  </div>
                </div>

                <div>
                  <label style={{
                    display: 'block',
                    marginBottom: '4px',
                    fontSize: '13px',
                    fontWeight: '500',
                    color: '#374151',
                    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
                  }}>
                    Order in Group
                  </label>
                  <input
                    type="number"
                    value={stepForm.groupOrder || ''}
                    onChange={(e) => setStepForm(prev => ({ ...prev, groupOrder: e.target.value ? parseInt(e.target.value) : null }))}
                    style={{
                      width: '100%',
                      padding: '6px 10px',
                      border: '1px solid #d1d5db',
                      borderRadius: '4px',
                      fontSize: '13px',
                      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
                    }}
                    placeholder="1, 2, 3..."
                    min="1"
                    disabled={!stepForm.groupId}
                  />
                </div>
              </div>

              <div style={{ marginBottom: '12px' }}>
                <label style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  fontSize: '13px',
                  fontWeight: '500',
                  color: '#374151',
                  fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
                  cursor: stepForm.groupId ? 'pointer' : 'not-allowed',
                  opacity: stepForm.groupId ? 1 : 0.5
                }}>
                  <input
                    type="checkbox"
                    checked={stepForm.isLastInGroup}
                    onChange={(e) => setStepForm(prev => ({ ...prev, isLastInGroup: e.target.checked }))}
                    disabled={!stepForm.groupId}
                  />
                  This is the last question in the group
                </label>
                <div style={{
                  fontSize: '11px',
                  color: '#6b7280',
                  marginLeft: '24px',
                  fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
                }}>
                  When checked, AI will synthesize all group responses
                </div>
              </div>

              {stepForm.isLastInGroup && stepForm.groupId && (
                <>
                  <div style={{ marginBottom: '12px' }}>
                    <label style={{
                      display: 'block',
                      marginBottom: '4px',
                      fontSize: '13px',
                      fontWeight: '500',
                      color: '#374151',
                      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
                    }}>
                      AI Synthesis Prompt *
                    </label>
                    <textarea
                      value={stepForm.groupSynthesisPrompt}
                      onChange={(e) => setStepForm(prev => ({ ...prev, groupSynthesisPrompt: e.target.value }))}
                      style={{
                        width: '100%',
                        padding: '8px 10px',
                        border: '1px solid #d1d5db',
                        borderRadius: '4px',
                        fontSize: '13px',
                        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
                        minHeight: '80px',
                        resize: 'vertical'
                      }}
                      placeholder="e.g., Synthesize these answers into a cohesive root cause analysis paragraph, maintaining technical accuracy and professional tone."
                      required={stepForm.isLastInGroup}
                    />
                    <div style={{
                      fontSize: '11px',
                      color: '#6b7280',
                      marginTop: '2px',
                      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
                    }}>
                      Instructions for AI on how to combine the grouped answers
                    </div>
                  </div>

                  <div>
                    <label style={{
                      display: 'block',
                      marginBottom: '4px',
                      fontSize: '13px',
                      fontWeight: '500',
                      color: '#374151',
                      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
                    }}>
                      Template Variable Name *
                    </label>
                    <input
                      type="text"
                      value={stepForm.groupOutputVariable}
                      onChange={(e) => setStepForm(prev => ({ ...prev, groupOutputVariable: e.target.value }))}
                      style={{
                        width: '100%',
                        padding: '6px 10px',
                        border: '1px solid #d1d5db',
                        borderRadius: '4px',
                        fontSize: '13px',
                        fontFamily: 'monospace'
                      }}
                      placeholder="e.g., root_cause_analysis"
                      required={stepForm.isLastInGroup}
                    />
                    <div style={{
                      fontSize: '11px',
                      color: '#6b7280',
                      marginTop: '2px',
                      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
                    }}>
                      Use in template as: {stepForm.groupOutputVariable ? `{{${stepForm.groupOutputVariable}}}` : '{{variable_name}}'}
                    </div>
                  </div>
                </>
              )}
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
                {editingStep ? 'Update Step' : 'Add Step'}
              </button>
              <button
                type="button"
                onClick={resetStepForm}
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

      {/* Templates List */}
      {activeTab === 'templates' && (
        <>
          {loading ? (
            <div style={{
              textAlign: 'center',
              padding: '40px',
              color: '#6b7280',
              fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
            }}>
              Loading workflow templates...
            </div>
          ) : templates.length === 0 ? (
            <div style={{
              textAlign: 'center',
              padding: '40px',
              color: '#6b7280',
              fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
            }}>
              <div style={{ fontSize: '32px', marginBottom: '12px' }}>📋</div>
              <p style={{ margin: '0', fontSize: '14px' }}>No workflow templates created yet</p>
            </div>
          ) : (
            <div style={{
              display: 'grid',
              gap: '12px'
            }}>
              {templates.map((template) => (
                <div key={template.id} style={{
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
                        {template.name}
                      </h4>
                      {template.description && (
                        <p style={{
                          margin: '0 0 8px 0',
                          fontSize: '14px',
                          color: '#6b7280',
                          fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
                        }}>
                          {template.description}
                        </p>
                      )}
                      <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                        <span style={{
                          padding: '2px 8px',
                          backgroundColor: template.isActive ? '#dcfce7' : '#fef2f2',
                          color: template.isActive ? '#166534' : '#dc2626',
                          borderRadius: '12px',
                          fontSize: '12px',
                          fontWeight: '500',
                          fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
                        }}>
                          {template.isActive ? 'Active' : 'Inactive'}
                        </span>
                        <span style={{
                          padding: '2px 8px',
                          backgroundColor: '#e0e7ff',
                          color: '#4338ca',
                          borderRadius: '12px',
                          fontSize: '12px',
                          fontWeight: '500',
                          fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
                        }}>
                          {template.category}
                        </span>
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: '8px' }}>
                      <button
                        onClick={async () => {
                          await loadTemplateDetails(template.id);
                          setActiveTab('steps');
                        }}
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
                        View Steps
                      </button>
                      <button
                        onClick={() => handleEditTemplate(template)}
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
                        onClick={() => handleDeleteTemplate(template.id)}
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
                  
                  {template.triggerKeywords && template.triggerKeywords.length > 0 && (
                    <div style={{
                      display: 'flex',
                      flexWrap: 'wrap',
                      gap: '4px'
                    }}>
                      {template.triggerKeywords.map((keyword, index) => (
                        <span key={index} style={{
                          padding: '2px 6px',
                          backgroundColor: '#f3f4f6',
                          color: '#6b7280',
                          borderRadius: '4px',
                          fontSize: '12px',
                          fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
                        }}>
                          {keyword}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {/* Import Tab */}
      {activeTab === 'import' && (
        <WorkflowImport 
          onImportComplete={(result) => {
            console.log('Workflow import completed:', result);
            // Refresh templates list
            loadTemplates();
            // Switch to templates tab
            setActiveTab('templates');
          }}
        />
      )}

      {/* Steps List */}
      {activeTab === 'steps' && selectedTemplate && (
        <>
          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: '16px'
          }}>
            <h4 style={{
              margin: '0',
              fontSize: '16px',
              fontWeight: '600',
              color: '#374151',
              fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
            }}>
              Workflow Steps: {selectedTemplate.name}
            </h4>
            <button
              onClick={() => setShowStepForm(true)}
              style={{
                padding: '6px 12px',
                backgroundColor: '#4338ca',
                color: '#ffffff',
                border: 'none',
                borderRadius: '4px',
                fontSize: '12px',
                fontWeight: '500',
                cursor: 'pointer',
                fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
              }}
            >
              + Add Step
            </button>
          </div>

          {steps.length === 0 ? (
            <div style={{
              textAlign: 'center',
              padding: '40px',
              color: '#6b7280',
              fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
            }}>
              <div style={{ fontSize: '32px', marginBottom: '12px' }}>📝</div>
              <p style={{ margin: '0', fontSize: '14px' }}>No steps configured for this workflow</p>
            </div>
          ) : (
            <div style={{
              display: 'flex',
              flexDirection: 'column',
              gap: '12px'
            }}>
              {steps.sort((a, b) => a.stepOrder - b.stepOrder).map((step) => (
                <div key={step.id} style={{
                  padding: '16px',
                  backgroundColor: '#f8fafc',
                  border: '1px solid #e5e7eb',
                  borderRadius: '8px'
                }}>
                  <div style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'flex-start',
                    marginBottom: '8px'
                  }}>
                    <div style={{ flex: 1 }}>
                      <div style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                        marginBottom: '4px'
                      }}>
                        <span style={{
                          padding: '2px 6px',
                          backgroundColor: '#4338ca',
                          color: '#ffffff',
                          borderRadius: '4px',
                          fontSize: '12px',
                          fontWeight: '500',
                          fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
                        }}>
                          Step {step.stepOrder}
                        </span>
                        <span style={{
                          padding: '2px 6px',
                          backgroundColor: '#e0e7ff',
                          color: '#4338ca',
                          borderRadius: '4px',
                          fontSize: '12px',
                          fontWeight: '500',
                          fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
                        }}>
                          {step.inputType}
                        </span>
                        {step.groupId && (
                          <span style={{
                            padding: '2px 6px',
                            backgroundColor: '#f0f9ff',
                            color: '#0369a1',
                            borderRadius: '4px',
                            fontSize: '12px',
                            fontWeight: '500',
                            fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
                            border: '1px solid #bae6fd'
                          }}>
                            🔗 {step.groupId}
                            {step.isLastInGroup && ' (Last)'}
                          </span>
                        )}
                        {step.isRequired && (
                          <span style={{
                            padding: '2px 6px',
                            backgroundColor: '#fef2f2',
                            color: '#dc2626',
                            borderRadius: '4px',
                            fontSize: '12px',
                            fontWeight: '500',
                            fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
                          }}>
                            Required
                          </span>
                        )}
                      </div>
                      <h5 style={{
                        margin: '0 0 4px 0',
                        fontSize: '14px',
                        fontWeight: '600',
                        color: '#374151',
                        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
                      }}>
                        {step.questionText}
                      </h5>
                      {step.helpText && (
                        <p style={{
                          margin: '0',
                          fontSize: '12px',
                          color: '#6b7280',
                          fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
                        }}>
                          {step.helpText}
                        </p>
                      )}
                    </div>
                    <div style={{ display: 'flex', gap: '8px' }}>
                      <button
                        onClick={() => handleEditStep(step)}
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
                        onClick={() => handleDeleteStep(step.id)}
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
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

