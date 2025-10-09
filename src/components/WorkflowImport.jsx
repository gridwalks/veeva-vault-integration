import { useState } from 'react';

export default function WorkflowImport({ onImportComplete }) {
  const [file, setFile] = useState(null);
  const [isImporting, setIsImporting] = useState(false);
  const [result, setResult] = useState(null);
  const [showInstructions, setShowInstructions] = useState(false);

  const handleFileChange = (e) => {
    const selectedFile = e.target.files[0];
    if (selectedFile) {
      // Validate file type
      const validTypes = ['text/csv', 'application/vnd.ms-excel', 'text/plain'];
      const fileName = selectedFile.name.toLowerCase();
      
      if (validTypes.includes(selectedFile.type) || fileName.endsWith('.csv')) {
        setFile(selectedFile);
        setResult(null);
      } else {
        alert('Please select a CSV file');
        e.target.value = '';
      }
    }
  };

  const handleImport = async () => {
    if (!file) {
      alert('Please select a file first');
      return;
    }

    setIsImporting(true);
    setResult(null);

    try {
      // Read file content
      const fileContent = await file.text();
      
      // Send to API
      const response = await fetch('/api/import-workflow', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          fileContent: fileContent,
          fileType: file.type || 'text/csv'
        })
      });

      const data = await response.json();

      if (response.ok) {
        setResult({
          success: true,
          ...data
        });
        
        // Clear file input
        setFile(null);
        document.getElementById('workflow-file-input').value = '';
        
        // Notify parent component
        if (onImportComplete) {
          onImportComplete(data);
        }
      } else {
        setResult({
          success: false,
          error: data.error,
          details: data.details
        });
      }
    } catch (error) {
      console.error('Import error:', error);
      setResult({
        success: false,
        error: error.message
      });
    } finally {
      setIsImporting(false);
    }
  };

  const downloadTemplate = () => {
    const templateContent = `workflow_name,workflow_description,workflow_category,trigger_keywords,step_order,question_text,input_type,required,placeholder,help_text,options,validation_rules,group_id,group_order,is_last_in_group,group_synthesis_prompt,group_output_variable
"Sample CAPA Workflow","Corrective and Preventive Action workflow","Quality","capa;corrective action;preventive action",1,"What type of CAPA are you creating?","select","true","","Select the type of action","Corrective Action;Preventive Action;Both","","","","",""
"Sample CAPA Workflow","","","",2,"Please provide a brief title for this CAPA","text","true","e.g., Equipment Calibration Deviation","A concise title that describes the issue","","{""minLength"": 10, ""maxLength"": 200}","","","","",""
"Sample CAPA Workflow","","","",3,"What was the immediate cause of this issue?","textarea","true","Describe what directly caused the problem","Focus on the immediate trigger","","{""minLength"": 20, ""maxLength"": 500}","root_cause_group","1","false","",""
"Sample CAPA Workflow","","","",4,"What contributing factors existed?","textarea","true","What conditions enabled this to happen?","Consider training, procedures, equipment, workload","","{""minLength"": 20, ""maxLength"": 500}","root_cause_group","2","false","",""
"Sample CAPA Workflow","","","",5,"What systemic issues enabled this problem?","textarea","true","Identify any underlying systemic problems","Think about processes, management systems, culture","","{""minLength"": 20, ""maxLength"": 500}","root_cause_group","3","true","Synthesize these root cause analysis responses into a comprehensive paragraph that integrates the immediate cause, contributing factors, and systemic issues. Write in a professional tone suitable for regulatory documentation. Ensure logical flow and clear connections between all three elements.","root_cause_analysis"
"Sample CAPA Workflow","","","",6,"Who or what was impacted by this issue?","checkbox","true","","Select all that apply","Patients;Processes;Products;Regulatory;Staff;Equipment;Other","","","","","",""`;

    const blob = new Blob([templateContent], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'workflow_import_template.csv';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
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
          Import Workflow from Spreadsheet
        </h3>
        <button
          onClick={() => setShowInstructions(!showInstructions)}
          style={{
            padding: '6px 12px',
            backgroundColor: '#f3f4f6',
            color: '#374151',
            border: '1px solid #d1d5db',
            borderRadius: '6px',
            fontSize: '12px',
            fontWeight: '500',
            cursor: 'pointer',
            fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
          }}
        >
          {showInstructions ? 'Hide' : 'Show'} Instructions
        </button>
      </div>

      {/* Instructions */}
      {showInstructions && (
        <div style={{
          marginBottom: '24px',
          padding: '16px',
          backgroundColor: '#eff6ff',
          border: '1px solid #bfdbfe',
          borderRadius: '8px'
        }}>
          <h4 style={{
            margin: '0 0 12px 0',
            fontSize: '14px',
            fontWeight: '600',
            color: '#1e40af',
            fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
          }}>
            How to Import Workflows
          </h4>
          
          <ol style={{
            margin: '0',
            paddingLeft: '20px',
            fontSize: '13px',
            color: '#1e40af',
            lineHeight: '1.6',
            fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
          }}>
            <li>Download the template CSV file using the button below</li>
            <li>Open the template in Excel, Google Sheets, or any spreadsheet app</li>
            <li>Fill in your workflow details:
              <ul style={{ marginTop: '4px' }}>
                <li><strong>First row:</strong> Workflow information (name, description, keywords)</li>
                <li><strong>All rows:</strong> Step details (questions, input types, validation)</li>
              </ul>
            </li>
            <li>Save as CSV format</li>
            <li>Upload the file using the form below</li>
          </ol>

          <div style={{ marginTop: '12px' }}>
            <strong style={{ fontSize: '13px', color: '#1e40af' }}>Required Columns:</strong>
            <ul style={{
              margin: '4px 0 0 20px',
              fontSize: '12px',
              color: '#1e40af',
              fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
            }}>
              <li><code>workflow_name</code> - Name of the workflow</li>
              <li><code>step_order</code> - Step sequence number</li>
              <li><code>question_text</code> - The question to ask</li>
              <li><code>input_type</code> - text, textarea, select, radio, checkbox, date, file</li>
            </ul>
            
            <strong style={{ fontSize: '13px', color: '#1e40af', marginTop: '8px', display: 'block' }}>Optional - Question Grouping:</strong>
            <ul style={{
              margin: '4px 0 0 20px',
              fontSize: '12px',
              color: '#1e40af',
              fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
            }}>
              <li><code>group_id</code> - Identifier for grouped questions (e.g., "root_cause_group")</li>
              <li><code>group_order</code> - Order within the group (1, 2, 3...)</li>
              <li><code>is_last_in_group</code> - true/false - marks the last question in group</li>
              <li><code>group_synthesis_prompt</code> - AI instructions for combining responses (only for last question)</li>
              <li><code>group_output_variable</code> - Template variable name (only for last question, e.g., "root_cause_analysis")</li>
            </ul>
            <p style={{
              margin: '8px 0 0 0',
              fontSize: '11px',
              color: '#6366f1',
              fontStyle: 'italic',
              fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
            }}>
              💡 Group related questions together for AI-powered synthesis. See the template example for root cause analysis grouping.
            </p>
          </div>
        </div>
      )}

      {/* Download Template Button */}
      <div style={{ marginBottom: '24px' }}>
        <button
          onClick={downloadTemplate}
          style={{
            padding: '10px 16px',
            backgroundColor: '#3b82f6',
            color: 'white',
            border: 'none',
            borderRadius: '6px',
            fontSize: '14px',
            fontWeight: '500',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
            transition: 'background-color 0.2s ease'
          }}
          onMouseEnter={(e) => e.target.style.backgroundColor = '#2563eb'}
          onMouseLeave={(e) => e.target.style.backgroundColor = '#3b82f6'}
        >
          <span>📥</span>
          Download Template CSV
        </button>
      </div>

      {/* File Upload */}
      <div style={{
        marginBottom: '24px',
        padding: '20px',
        backgroundColor: '#f8fafc',
        border: '2px dashed #cbd5e1',
        borderRadius: '8px',
        textAlign: 'center'
      }}>
        <input
          id="workflow-file-input"
          type="file"
          accept=".csv,text/csv,application/vnd.ms-excel"
          onChange={handleFileChange}
          style={{ display: 'none' }}
        />
        
        {!file ? (
          <div>
            <div style={{ fontSize: '48px', marginBottom: '12px' }}>📄</div>
            <button
              onClick={() => document.getElementById('workflow-file-input').click()}
              style={{
                padding: '10px 20px',
                backgroundColor: '#4338ca',
                color: 'white',
                border: 'none',
                borderRadius: '6px',
                fontSize: '14px',
                fontWeight: '500',
                cursor: 'pointer',
                fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
              }}
            >
              Select CSV File
            </button>
            <p style={{
              margin: '12px 0 0 0',
              fontSize: '12px',
              color: '#64748b',
              fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
            }}>
              Supported format: CSV (.csv)
            </p>
          </div>
        ) : (
          <div>
            <div style={{ fontSize: '48px', marginBottom: '12px' }}>✅</div>
            <p style={{
              margin: '0 0 12px 0',
              fontSize: '14px',
              fontWeight: '500',
              color: '#374151',
              fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
            }}>
              {file.name}
            </p>
            <p style={{
              margin: '0 0 16px 0',
              fontSize: '12px',
              color: '#64748b',
              fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
            }}>
              {(file.size / 1024).toFixed(2)} KB
            </p>
            <div style={{ display: 'flex', gap: '8px', justifyContent: 'center' }}>
              <button
                onClick={handleImport}
                disabled={isImporting}
                style={{
                  padding: '10px 20px',
                  backgroundColor: isImporting ? '#9ca3af' : '#16a34a',
                  color: 'white',
                  border: 'none',
                  borderRadius: '6px',
                  fontSize: '14px',
                  fontWeight: '500',
                  cursor: isImporting ? 'not-allowed' : 'pointer',
                  fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
                }}
              >
                {isImporting ? 'Importing...' : 'Import Workflow'}
              </button>
              <button
                onClick={() => {
                  setFile(null);
                  document.getElementById('workflow-file-input').value = '';
                }}
                disabled={isImporting}
                style={{
                  padding: '10px 20px',
                  backgroundColor: '#6b7280',
                  color: 'white',
                  border: 'none',
                  borderRadius: '6px',
                  fontSize: '14px',
                  fontWeight: '500',
                  cursor: isImporting ? 'not-allowed' : 'pointer',
                  fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
                }}
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Result Message */}
      {result && (
        <div style={{
          padding: '16px',
          backgroundColor: result.success ? '#dcfce7' : '#fee2e2',
          border: `1px solid ${result.success ? '#86efac' : '#fca5a5'}`,
          borderRadius: '8px'
        }}>
          {result.success ? (
            <div>
              <h4 style={{
                margin: '0 0 8px 0',
                fontSize: '14px',
                fontWeight: '600',
                color: '#166534',
                fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
              }}>
                ✅ Workflow Imported Successfully!
              </h4>
              <p style={{
                margin: '0 0 8px 0',
                fontSize: '13px',
                color: '#166534',
                fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
              }}>
                <strong>Workflow:</strong> {result.template?.name}
              </p>
              <p style={{
                margin: '0',
                fontSize: '13px',
                color: '#166534',
                fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
              }}>
                <strong>Steps Created:</strong> {result.template?.stepsCreated}
              </p>
              {result.warnings && result.warnings.length > 0 && (
                <div style={{ marginTop: '12px' }}>
                  <p style={{
                    margin: '0 0 4px 0',
                    fontSize: '12px',
                    fontWeight: '600',
                    color: '#854d0e',
                    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
                  }}>
                    ⚠️ Warnings:
                  </p>
                  <ul style={{
                    margin: '0',
                    paddingLeft: '20px',
                    fontSize: '12px',
                    color: '#854d0e',
                    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
                  }}>
                    {result.warnings.map((warning, index) => (
                      <li key={index}>{warning}</li>
                    ))}
                  </ul>
                </div>
              )}
              <p style={{
                margin: '12px 0 0 0',
                fontSize: '12px',
                color: '#166534',
                fontStyle: 'italic',
                fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
              }}>
                Note: The workflow is inactive by default. Review it in the Workflow Templates tab and activate when ready.
              </p>
            </div>
          ) : (
            <div>
              <h4 style={{
                margin: '0 0 8px 0',
                fontSize: '14px',
                fontWeight: '600',
                color: '#991b1b',
                fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
              }}>
                ❌ Import Failed
              </h4>
              <p style={{
                margin: '0',
                fontSize: '13px',
                color: '#991b1b',
                fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
              }}>
                {result.error}
              </p>
              {result.details && result.details.length > 0 && (
                <ul style={{
                  margin: '8px 0 0 20px',
                  fontSize: '12px',
                  color: '#991b1b',
                  fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
                }}>
                  {result.details.map((detail, index) => (
                    <li key={index}>{detail}</li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

