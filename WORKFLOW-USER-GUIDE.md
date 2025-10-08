# Workflow Management User Guide

## Table of Contents
1. [Introduction](#introduction)
2. [Getting Started](#getting-started)
3. [Creating a Workflow Template](#creating-a-workflow-template)
4. [Configuring Workflow Steps](#configuring-workflow-steps)
5. [Input Types and Options](#input-types-and-options)
6. [Validation Rules](#validation-rules)
7. [Document Templates](#document-templates)
8. [Testing Your Workflow](#testing-your-workflow)
9. [Best Practices](#best-practices)
10. [Troubleshooting](#troubleshooting)

---

## Introduction

The Workflow Management system allows administrators to create guided, step-by-step processes for users to complete complex documents like CAPAs, Deviations, Change Controls, and more. Workflows are fully configurable through the admin interface without requiring any code changes.

### Key Benefits
- **No Coding Required** - Build workflows using a visual interface
- **Flexible Configuration** - Support any document type or process
- **AI-Powered** - Automatic workflow detection in chat
- **User-Friendly** - Guided step-by-step experience
- **Document Generation** - Automatic creation of formatted documents

---

## Getting Started

### Accessing Workflow Management

1. Log into the application
2. Click on the **Admin** tab in the header
3. Select the **Workflow Management** tab
4. You'll see two sub-tabs:
   - **Workflow Templates** - View and manage workflow templates
   - **Steps** - Configure questions for a selected workflow

### Understanding Workflow Components

A workflow consists of:
- **Template** - The overall workflow definition (name, description, triggers)
- **Steps** - Individual questions or prompts presented to users
- **Instances** - Active user sessions working through a workflow
- **Generated Documents** - Final outputs created from user responses

---

## Creating a Workflow Template

### Step 1: Create a New Template

1. Click the **+ New Workflow** button
2. Fill in the template information:

#### Template Name **(Required)**
- **Purpose**: The display name for your workflow
- **Example**: "CAPA Workflow", "Deviation Report", "Change Control"
- **Best Practice**: Use clear, descriptive names that users will recognize

#### Description
- **Purpose**: Explain what this workflow is for and when to use it
- **Example**: "Corrective and Preventive Action workflow for addressing nonconformities"
- **Best Practice**: Include guidance on when this workflow should be used

#### Category
- **Purpose**: Organize workflows by type
- **Options**: Quality, Regulatory, Operations, Safety, Training, Other
- **Best Practice**: Use consistent categories across related workflows

#### Trigger Keywords
- **Purpose**: Words or phrases that automatically start this workflow in chat
- **Example**: ["capa", "corrective action", "preventive action", "nonconformity"]
- **How to Add**:
  1. Click **+ Add Keyword**
  2. Enter a keyword or phrase
  3. Click OK
  4. Repeat for all relevant keywords
- **Best Practice**: 
  - Include common variations and synonyms
  - Use lowercase for consistency
  - Include acronyms (e.g., "CAPA", "CA", "PA")

#### Active Status
- **Purpose**: Enable or disable the workflow
- **Checked**: Workflow can be triggered in chat
- **Unchecked**: Workflow is hidden from users
- **Best Practice**: Keep inactive while building, activate when ready to test

#### Document Template
- **Purpose**: Define the format of the final generated document
- **Syntax**: Use `{{variable_name}}` for placeholders
- **Example**:
```
CAPA Document: {{title}}

Problem Description: {{problem_description}}

Root Cause: {{root_cause}}

Corrective Actions: {{corrective_actions}}

Preventive Actions: {{preventive_actions}}

Responsible Person: {{responsible_person}}

Target Date: {{target_date}}

Effectiveness Measures: {{effectiveness_measures}}
```
- **Best Practice**: 
  - Use descriptive variable names that match your step purposes
  - Include section headers for clarity
  - Format for readability

### Step 2: Save the Template

1. Click **Create Template**
2. The template will appear in the templates list
3. Click **View Steps** to begin adding questions

---

## Configuring Workflow Steps

### Adding a New Step

1. Select your workflow template
2. Click the **Steps** tab
3. Click **+ Add Step**

### Step Configuration Fields

#### Step Order **(Required)**
- **Purpose**: Determines the sequence of questions
- **Format**: Integer (1, 2, 3, etc.)
- **Best Practice**: 
  - Number sequentially starting from 1
  - Leave gaps (5, 10, 15) if you might insert steps later
  - Reorder by editing step numbers

#### Question Text **(Required)**
- **Purpose**: The question or prompt shown to the user
- **Example**: "What was the root cause of this issue?"
- **Best Practice**:
  - Be specific and clear
  - Use action verbs (Describe, Explain, List, Identify)
  - Keep questions focused on one topic
  - Use proper grammar and punctuation

#### Input Type **(Required)**
- **Purpose**: Determines how users provide their answer
- **Options**: See [Input Types and Options](#input-types-and-options)
- **Best Practice**: Choose the type that best matches the expected response

#### Placeholder Text
- **Purpose**: Example text shown in empty input fields
- **Example**: "e.g., Equipment Calibration Deviation"
- **Best Practice**:
  - Provide realistic examples
  - Show the expected format
  - Keep it concise

#### Help Text
- **Purpose**: Additional guidance displayed below the question
- **Example**: "Include all relevant facts and observations"
- **Best Practice**:
  - Clarify what information is needed
  - Mention any requirements (length, format, etc.)
  - Reference related procedures if applicable

#### Required Field
- **Purpose**: Whether the user must answer before proceeding
- **Checked**: User cannot skip this step
- **Unchecked**: Step is optional
- **Best Practice**: Mark critical information as required

### Step 3: Save the Step

1. Click **Add Step** or **Update Step**
2. The step will appear in the steps list
3. Repeat for all questions in your workflow

---

## Input Types and Options

### Text Input
- **Use For**: Short, single-line responses
- **Example**: Names, titles, reference numbers
- **Configuration**: 
  - Set placeholder text for guidance
  - Use validation rules for length limits

### Text Area
- **Use For**: Long, multi-line responses
- **Example**: Detailed descriptions, explanations, analyses
- **Configuration**:
  - Set placeholder text with examples
  - Use validation rules for minimum length
  - Provide help text for expected detail level

### Dropdown/Select
- **Use For**: Single choice from predefined options
- **Example**: Status selection, type selection, priority level
- **Configuration**:
  1. Select "Dropdown/Select" as input type
  2. Click **+ Add Option** for each choice
  3. Enter option text (e.g., "High", "Medium", "Low")
  4. Options appear in the order added
- **Best Practice**:
  - Keep options mutually exclusive
  - Order logically (alphabetically, by severity, etc.)
  - Limit to 10-15 options for usability

### Radio Buttons
- **Use For**: Single choice with visible options
- **Example**: Yes/No questions, type selection with 2-5 options
- **Configuration**: Same as dropdown
- **Best Practice**:
  - Use for 2-5 options
  - Use dropdown for more options
  - Make options clearly distinct

### Checkboxes
- **Use For**: Multiple selections from predefined options
- **Example**: Impact assessment, affected areas, applicable regulations
- **Configuration**: Same as dropdown
- **Best Practice**:
  - Allow multiple selections when appropriate
  - Include "Other" option if list isn't exhaustive
  - Keep list manageable (under 15 options)

### Date Picker
- **Use For**: Date selection
- **Example**: Target completion date, incident date, review date
- **Configuration**: No additional options needed
- **Best Practice**:
  - Use for actual dates, not durations
  - Clarify date format in help text if needed
  - Specify if past/future dates are expected

### File Upload
- **Use For**: Attaching supporting documents
- **Example**: Photos, reports, evidence, attachments
- **Configuration**: No additional options needed
- **Note**: Currently displays as text input; file handling can be enhanced
- **Best Practice**:
  - Specify accepted file types in help text
  - Mention file size limits
  - Clarify what should be uploaded

---

## Validation Rules

Validation rules ensure users provide appropriate responses before proceeding.

### Setting Validation Rules

Validation rules are configured in JSON format in the step configuration. Common rules:

#### Minimum Length
```json
{
  "minLength": 50
}
```
- **Use For**: Ensuring detailed responses
- **Example**: Problem descriptions, root cause analyses

#### Maximum Length
```json
{
  "maxLength": 500
}
```
- **Use For**: Keeping responses concise
- **Example**: Titles, brief summaries

#### Combined Min/Max Length
```json
{
  "minLength": 20,
  "maxLength": 1000
}
```
- **Use For**: Responses that need detail but have limits

#### Pattern Matching (Regex)
```json
{
  "pattern": "^[A-Z]{3}-\\d{4}$",
  "patternMessage": "Must be in format ABC-1234"
}
```
- **Use For**: Specific formats (IDs, reference numbers)
- **Example**: Document numbers, employee IDs

#### Required Field
- Set via the "Required Field" checkbox
- User must provide a response to proceed

### Best Practices for Validation
- Don't over-validate - allow flexibility where appropriate
- Provide clear error messages
- Test validation with realistic inputs
- Balance thoroughness with user experience

---

## Document Templates

Document templates define how the final output is formatted using user responses.

### Template Syntax

Use double curly braces for variables: `{{variable_name}}`

### Mapping Variables to Steps

Variables correspond to step IDs in the format `step_{id}`:
- Step 1 response → `{{step_1}}`
- Step 2 response → `{{step_2}}`
- etc.

For better readability, use descriptive names that match your workflow:
- `{{title}}` → Step 2 (if that's your title step)
- `{{problem_description}}` → Step 3
- `{{root_cause}}` → Step 4

### Example: CAPA Document Template

```
CORRECTIVE AND PREVENTIVE ACTION (CAPA)

Document ID: CAPA-{{date}}-{{id}}
Created: {{current_date}}

═══════════════════════════════════════════════════

SECTION 1: BASIC INFORMATION
═══════════════════════════════════════════════════

CAPA Type: {{capa_type}}
Title: {{title}}

═══════════════════════════════════════════════════

SECTION 2: PROBLEM DESCRIPTION
═══════════════════════════════════════════════════

{{problem_description}}

Impact Assessment:
{{impact_assessment}}

═══════════════════════════════════════════════════

SECTION 3: ROOT CAUSE ANALYSIS
═══════════════════════════════════════════════════

{{root_cause}}

═══════════════════════════════════════════════════

SECTION 4: CORRECTIVE ACTIONS
═══════════════════════════════════════════════════

Immediate Actions Taken:
{{corrective_actions}}

═══════════════════════════════════════════════════

SECTION 5: PREVENTIVE ACTIONS
═══════════════════════════════════════════════════

Long-term Preventive Measures:
{{preventive_actions}}

═══════════════════════════════════════════════════

SECTION 6: IMPLEMENTATION PLAN
═══════════════════════════════════════════════════

Responsible Person: {{responsible_person}}
Target Completion Date: {{target_date}}

Effectiveness Measures:
{{effectiveness_measures}}

═══════════════════════════════════════════════════

SECTION 7: APPROVAL
═══════════════════════════════════════════════════

Prepared By: _____________________ Date: __________

Reviewed By: _____________________ Date: __________

Approved By: _____________________ Date: __________
```

### Template Best Practices

1. **Structure**: Use clear sections and headers
2. **Formatting**: Use consistent spacing and separators
3. **Labels**: Include field labels before variables
4. **Completeness**: Include all necessary sections
5. **Professional**: Use appropriate formatting for your industry
6. **Signatures**: Include approval sections if needed
7. **Metadata**: Include document ID, dates, version info

---

## Testing Your Workflow

### Pre-Launch Checklist

Before activating your workflow, verify:

- [ ] Template name is clear and descriptive
- [ ] All trigger keywords are added
- [ ] Steps are in correct order
- [ ] All questions are clear and specific
- [ ] Input types match expected responses
- [ ] Required fields are marked
- [ ] Validation rules are appropriate
- [ ] Help text provides adequate guidance
- [ ] Document template includes all variables
- [ ] Template formatting is professional

### Testing Process

1. **Activate the Workflow**
   - Edit your template
   - Check the "Active" checkbox
   - Save changes

2. **Test in Chat**
   - Go to the main chat interface
   - Type a trigger keyword (e.g., "I need to create a CAPA")
   - Verify the workflow starts

3. **Complete All Steps**
   - Answer each question
   - Verify validation works
   - Check that help text is helpful
   - Ensure progression is logical

4. **Review Generated Document**
   - Complete the workflow
   - Review the final document
   - Check formatting and completeness
   - Verify all responses are included

5. **Test Edge Cases**
   - Try invalid inputs
   - Test optional vs required fields
   - Try exiting mid-workflow
   - Test with minimal responses
   - Test with maximum length responses

### Common Issues and Fixes

**Workflow doesn't trigger:**
- Check that workflow is marked "Active"
- Verify trigger keywords are lowercase
- Try exact keyword phrases
- Check database connection

**Steps appear out of order:**
- Edit step orders to be sequential
- Save and refresh

**Validation not working:**
- Check JSON syntax in validation rules
- Verify field is marked as required
- Test with different inputs

**Document template missing data:**
- Verify variable names match step IDs
- Check for typos in variable names
- Ensure double curly braces are used

---

## Best Practices

### Workflow Design

1. **Keep It Simple**
   - Aim for 5-15 steps
   - Break complex workflows into multiple templates
   - One question per step

2. **Logical Flow**
   - Order questions naturally
   - Group related questions
   - Start with basic info, end with details

3. **Clear Communication**
   - Use plain language
   - Avoid jargon unless necessary
   - Be specific about requirements

4. **User Experience**
   - Provide examples in placeholders
   - Include helpful guidance
   - Don't over-validate
   - Allow flexibility where appropriate

### Content Guidelines

1. **Question Writing**
   - Start with action verbs (Describe, Explain, List)
   - Be specific about what you need
   - Keep questions focused
   - Use proper grammar

2. **Help Text**
   - Clarify expectations
   - Provide examples
   - Reference relevant procedures
   - Keep it concise

3. **Options and Choices**
   - Make options mutually exclusive
   - Order logically
   - Include "Other" when appropriate
   - Keep lists manageable

### Maintenance

1. **Regular Reviews**
   - Review workflows quarterly
   - Update based on user feedback
   - Refine questions for clarity
   - Update document templates

2. **Version Control**
   - Document changes to workflows
   - Test after modifications
   - Communicate updates to users

3. **User Feedback**
   - Collect feedback on workflow usability
   - Track completion rates
   - Identify common issues
   - Iterate and improve

---

## Troubleshooting

### Workflow Not Starting

**Problem**: User types trigger keyword but workflow doesn't start

**Solutions**:
1. Verify workflow is marked "Active"
2. Check trigger keywords are lowercase
3. Ensure database tables are created
4. Check API endpoint is accessible
5. Review browser console for errors

### Steps Not Appearing

**Problem**: Workflow starts but no steps show

**Solutions**:
1. Verify steps are created for the template
2. Check step order starts at 1
3. Ensure steps have required fields filled
4. Check database connection
5. Review API logs for errors

### Validation Errors

**Problem**: Validation rules not working correctly

**Solutions**:
1. Check JSON syntax in validation rules
2. Verify field is marked as required
3. Test validation rules independently
4. Check for conflicting rules
5. Review error messages in console

### Document Generation Issues

**Problem**: Generated document missing data or poorly formatted

**Solutions**:
1. Verify variable names match step IDs
2. Check for typos in template
3. Ensure double curly braces: `{{variable}}`
4. Test with sample data
5. Review template formatting

### Performance Issues

**Problem**: Workflow is slow or unresponsive

**Solutions**:
1. Check database performance
2. Reduce number of steps if possible
3. Optimize validation rules
4. Check network connectivity
5. Review server logs

### User Experience Issues

**Problem**: Users find workflow confusing or difficult

**Solutions**:
1. Simplify question wording
2. Add more help text
3. Provide better examples
4. Reduce number of steps
5. Collect specific feedback

---

## Example Workflows

### Example 1: Simple Deviation Report

**Template Configuration:**
- Name: "Deviation Report"
- Category: Quality
- Keywords: ["deviation", "non-conformance", "quality issue"]

**Steps:**
1. **Deviation Type** (Select)
   - Options: Minor, Major, Critical
   
2. **Brief Description** (Text)
   - Placeholder: "e.g., Temperature excursion in storage area"
   
3. **Detailed Description** (Textarea)
   - Min Length: 50
   - Help: "Include what happened, when, where, and who was involved"
   
4. **Immediate Action** (Textarea)
   - Help: "What was done immediately to address the issue?"
   
5. **Responsible Person** (Text)
   - Required: Yes

### Example 2: Change Control Request

**Template Configuration:**
- Name: "Change Control Request"
- Category: Operations
- Keywords: ["change control", "change request", "modification"]

**Steps:**
1. **Change Type** (Select)
   - Options: Process, Equipment, Document, System
   
2. **Change Title** (Text)
   - Max Length: 100
   
3. **Justification** (Textarea)
   - Min Length: 50
   - Help: "Why is this change necessary?"
   
4. **Impact Assessment** (Checkboxes)
   - Options: Quality, Safety, Regulatory, Cost, Timeline
   
5. **Implementation Plan** (Textarea)
   - Help: "How will this change be implemented?"
   
6. **Target Date** (Date)
   - Help: "When should this change be completed?"

### Example 3: Risk Assessment

**Template Configuration:**
- Name: "Risk Assessment"
- Category: Safety
- Keywords: ["risk assessment", "risk analysis", "hazard"]

**Steps:**
1. **Activity/Process** (Text)
   - Help: "What activity or process is being assessed?"
   
2. **Hazard Identification** (Textarea)
   - Help: "List all potential hazards"
   
3. **Risk Level** (Select)
   - Options: Low, Medium, High, Critical
   
4. **Affected Personnel** (Checkboxes)
   - Options: Operators, Supervisors, Maintenance, Visitors, Other
   
5. **Control Measures** (Textarea)
   - Help: "What controls are in place or needed?"
   
6. **Residual Risk** (Select)
   - Options: Acceptable, Needs Review, Unacceptable

---

## Support and Resources

### Getting Help

If you encounter issues or need assistance:

1. **Check This Guide** - Review relevant sections
2. **Test in Isolation** - Simplify to identify the issue
3. **Review Logs** - Check browser console and server logs
4. **Contact Support** - Provide specific details about the issue

### Additional Resources

- Database Schema: See `database-schema.sql`
- API Documentation: See `netlify/functions/workflow-management.js`
- Component Code: See `src/components/WorkflowManagement.jsx`

### Best Practices Summary

✅ **DO:**
- Keep workflows simple and focused
- Test thoroughly before activating
- Provide clear guidance to users
- Use appropriate validation
- Maintain and update regularly

❌ **DON'T:**
- Create overly complex workflows
- Use technical jargon unnecessarily
- Over-validate user inputs
- Skip testing
- Forget to gather user feedback

---

## Appendix: Quick Reference

### Input Type Selection Guide

| Response Type | Recommended Input | Example Use Case |
|--------------|------------------|------------------|
| Short text (< 100 chars) | Text Input | Names, titles, IDs |
| Long text (> 100 chars) | Text Area | Descriptions, explanations |
| Single choice (2-5 options) | Radio Buttons | Yes/No, Type selection |
| Single choice (6+ options) | Dropdown | Status, category, priority |
| Multiple choices | Checkboxes | Impact areas, affected parties |
| Date | Date Picker | Deadlines, incident dates |
| File | File Upload | Evidence, attachments |

### Validation Rules Quick Reference

```json
// Minimum length
{"minLength": 50}

// Maximum length
{"maxLength": 500}

// Both min and max
{"minLength": 20, "maxLength": 1000}

// Pattern (regex)
{"pattern": "^[A-Z]{3}-\\d{4}$", "patternMessage": "Format: ABC-1234"}

// Email format
{"pattern": "^[^@]+@[^@]+\\.[^@]+$", "patternMessage": "Enter valid email"}

// Phone format
{"pattern": "^\\d{3}-\\d{3}-\\d{4}$", "patternMessage": "Format: 123-456-7890"}
```

### Common Trigger Keywords

**CAPA:**
- capa, corrective action, preventive action, nonconformity, non-conformance, quality issue

**Deviation:**
- deviation, non-conformance, quality deviation, process deviation

**Change Control:**
- change control, change request, modification, update

**Risk Assessment:**
- risk assessment, risk analysis, hazard assessment, safety assessment

**Incident Report:**
- incident, accident, injury, near miss, safety incident

---

**Document Version:** 1.0  
**Last Updated:** October 2025  
**Maintained By:** System Administrator

---

*For questions or suggestions about this guide, please contact your system administrator.*

