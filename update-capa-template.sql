-- Update CAPA Workflow Template with Comprehensive Document Template
-- Run this in your Neon database console

UPDATE qms_chat_workflow_templates 
SET document_template = 'CORRECTIVE AND PREVENTIVE ACTION (CAPA) DOCUMENT

Document Number: [AUTO-GENERATED]
Date: [CURRENT DATE]
Status: OPEN
Classification: QUALITY ASSURANCE

================================================================================
1. PROBLEM DESCRIPTION
================================================================================

What exactly happened?
{{step_1}}

When and where was the issue first detected?
{{step_2}}

Who discovered the issue, and under what conditions?
{{step_3}}

What were the expected results versus actual results?
{{step_4}}

What was the immediate containment action?
{{step_5}}

================================================================================
2. IMPACT ASSESSMENT
================================================================================

Was any product, data, or process impacted before containment?
{{step_6}}

What objective evidence supports the issue?
{{step_7}}

================================================================================
3. PROCESS INVESTIGATION
================================================================================

Was the process followed as written?
{{step_8}}

If not, why was the process not followed?
{{step_9}}

Were tools, systems, or equipment functioning properly?
{{step_10}}

Was human error a contributing factor?
{{step_11}}

If yes, what human factors contributed?
{{step_12}}

Were SOPs or controls adequate to prevent this issue?
{{step_13}}

================================================================================
4. HISTORICAL ANALYSIS
================================================================================

Has a similar issue occurred previously?
{{step_14}}

If yes, what previous CAPAs or investigations addressed similar issues?
{{step_15}}

================================================================================
5. ROOT CAUSE ANALYSIS
================================================================================

What is the direct cause of the issue?
{{step_16}}

What is the contributing cause?
{{step_17}}

What is the root cause of this issue?
{{step_18}}

How confident are you that this is the true root cause?
{{step_19}}

================================================================================
6. CORRECTIVE AND PREVENTIVE ACTIONS
================================================================================

What corrective or preventive actions are required?
{{step_20}}

How will effectiveness of actions be measured?
{{step_21}}

When will the effectiveness check be performed?
{{step_22}}

Who is responsible for verifying CAPA effectiveness?
{{step_23}}

================================================================================
7. EFFECTIVENESS VERIFICATION
================================================================================

What were the results of the effectiveness verification?
{{step_24}}

Is the CAPA ready for closure?
{{step_25}}

================================================================================
8. SIGNATURES AND APPROVALS
================================================================================

Investigation Completed By:
Name: _____________________________
Signature: ________________________
Date: _____________________________

Quality Assurance Review:
Name: _____________________________
Signature: ________________________
Date: _____________________________

CAPA Closure Approval:
Name: _____________________________
Signature: ________________________
Date: _____________________________

================================================================================
END OF DOCUMENT
================================================================================

This CAPA document has been generated through a structured workflow process to ensure comprehensive investigation and documentation of corrective and preventive actions in accordance with quality management system requirements.',
    updated_at = CURRENT_TIMESTAMP
WHERE name ILIKE '%CAPA%'
RETURNING id, name, is_active;

-- Verify the update
SELECT id, name, is_active, 
       LENGTH(document_template) as template_length,
       SUBSTRING(document_template, 1, 100) as template_preview
FROM qms_chat_workflow_templates 
WHERE name ILIKE '%CAPA%';
