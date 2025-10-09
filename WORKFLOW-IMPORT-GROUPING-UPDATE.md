# Workflow Import: Question Grouping Support

## Overview

Updated the workflow spreadsheet import functionality to support the new question grouping feature with AI synthesis. Users can now define grouped questions directly in their CSV files.

## Changes Made

### Frontend Updates: `src/components/WorkflowImport.jsx`

#### 1. Updated CSV Template
Added 5 new columns to the template:
- `group_id` - Identifier for grouped questions
- `group_order` - Order within the group
- `is_last_in_group` - Marks the last question (triggers synthesis)
- `group_synthesis_prompt` - AI instructions for combining responses
- `group_output_variable` - Template variable name for output

#### 2. Enhanced Template Example
The template now includes a complete root cause analysis group example:
- Step 3: "What was the immediate cause?" (group: root_cause_group, order: 1)
- Step 4: "What contributing factors existed?" (group: root_cause_group, order: 2)
- Step 5: "What systemic issues enabled this?" (group: root_cause_group, order: 3, **last in group**)
  - Includes synthesis prompt
  - Includes output variable: `root_cause_analysis`

#### 3. Updated Instructions
Added new section explaining:
- Optional grouping columns and their purpose
- How to use each grouping field
- Reference to template example for guidance

### Backend Updates: `netlify/functions/import-workflow.js`

#### 1. Extended Step Data Parsing
Updated `stepData` object to include:
```javascript
group_id: row.group_id || null,
group_order: row.group_order ? parseInt(row.group_order) : null,
is_last_in_group: (row.is_last_in_group || 'false').toLowerCase() === 'true',
group_synthesis_prompt: row.group_synthesis_prompt || null,
group_output_variable: row.group_output_variable || null
```

#### 2. Updated Database Insert
Modified INSERT query to include all 5 new grouping columns:
- Properly handles NULL values for ungrouped questions
- Maintains backward compatibility with old CSV files

#### 3. Added Group Validation
Comprehensive validation for group configurations:
- **If `group_id` is specified:** Requires `group_order`
- **If `is_last_in_group` is true:** Requires both `group_synthesis_prompt` and `group_output_variable`
- **Warning:** If grouping fields are used without `group_id`

Validation errors are reported as warnings, allowing the import to continue but alerting admins to configuration issues.

## CSV Template Format

### Complete Column List

```csv
workflow_name,workflow_description,workflow_category,trigger_keywords,
step_order,question_text,input_type,required,placeholder,help_text,options,validation_rules,
group_id,group_order,is_last_in_group,group_synthesis_prompt,group_output_variable
```

### Ungrouped Question Example
```csv
"My Workflow","","","",1,"What is your name?","text","true","John Doe","Enter your full name","","","","","","",""
```

### Grouped Questions Example
```csv
"My Workflow","","","",3,"What was the immediate cause?","textarea","true","","","","","root_cause_group","1","false","",""
"My Workflow","","","",4,"What contributing factors existed?","textarea","true","","","","","root_cause_group","2","false","",""
"My Workflow","","","",5,"What systemic issues enabled this?","textarea","true","","","","","root_cause_group","3","true","Synthesize these into a cohesive root cause analysis paragraph.","root_cause_analysis"
```

## Usage Instructions

### For Users Creating CSV Files:

1. **Download the updated template** using the "Download Template CSV" button
2. **Review the example** showing grouped questions (steps 3-5)
3. **For ungrouped questions:** Leave all grouping columns empty
4. **For grouped questions:**
   - Use the same `group_id` for all related questions
   - Number them sequentially with `group_order`
   - Mark the last one with `is_last_in_group` = "true"
   - For the last question only, provide:
     - `group_synthesis_prompt` - How AI should combine responses
     - `group_output_variable` - Variable name for template

### For Administrators:

**Validation Checks:**
- Import will succeed but show warnings for misconfigured groups
- Review warnings in the import result to fix group configurations
- Edit steps after import if needed to adjust grouping

**Common Issues:**
- Missing `group_order` when `group_id` is specified
- Missing synthesis prompt on last-in-group step
- Missing output variable on last-in-group step
- Grouping fields without `group_id`

## Example: Complete Grouped Workflow Import

```csv
workflow_name,workflow_description,workflow_category,trigger_keywords,step_order,question_text,input_type,required,placeholder,help_text,options,validation_rules,group_id,group_order,is_last_in_group,group_synthesis_prompt,group_output_variable
"Incident Analysis","Analyze incidents thoroughly","Safety","incident;accident;near miss",1,"What type of incident occurred?","select","true","","Select the type","Minor;Major;Critical","","","","","",""
"Incident Analysis","","","",2,"When did the incident occur?","date","true","","Date of incident","","","","","","",""
"Incident Analysis","","","",3,"What was the immediate cause?","textarea","true","","Describe the direct cause","","{""minLength"": 20}","cause_group","1","false","",""
"Incident Analysis","","","",4,"What were the contributing factors?","textarea","true","","List all contributing factors","","{""minLength"": 20}","cause_group","2","false","",""
"Incident Analysis","","","",5,"What systemic issues were present?","textarea","true","","Identify systemic problems","","{""minLength"": 20}","cause_group","3","true","Synthesize these into a comprehensive root cause analysis that integrates the immediate cause, contributing factors, and systemic issues. Use professional language suitable for safety documentation.","root_cause_analysis"
"Incident Analysis","","","",6,"What immediate actions were taken?","textarea","true","","Describe containment actions","","","","","","",""
```

## Benefits

### For Workflow Creators:
- ✅ Define complete workflows with grouping in spreadsheets
- ✅ Easy to maintain and version control
- ✅ Visible structure and configuration
- ✅ Share workflow templates across teams

### For Import Process:
- ✅ Full feature parity with manual UI configuration
- ✅ Validation catches configuration errors
- ✅ Clear error messages guide corrections
- ✅ Backward compatible with old CSV files

### For System:
- ✅ Maintains data integrity
- ✅ Proper NULL handling for ungrouped steps
- ✅ Comprehensive validation prevents issues
- ✅ Works seamlessly with existing workflow execution

## Testing Recommendations

1. **Import the template as-is** - Verify the example workflow works correctly
2. **Import without grouping columns** - Test backward compatibility
3. **Import with partial grouping** - Verify validation warnings
4. **Import with invalid grouping** - Check error messages are helpful
5. **Execute imported grouped workflow** - Verify AI synthesis works

## Migration Notes

**No migration required!** This update is fully backward compatible:
- Old CSV files without grouping columns continue to work
- Grouping columns default to NULL (ungrouped behavior)
- Existing import workflows unchanged
- New functionality is opt-in

## Related Documentation

- **Main Guide:** See `WORKFLOW-USER-GUIDE.md` - Section 11: Advanced Question Grouping
- **Implementation:** See `WORKFLOW-GROUPING-IMPLEMENTATION-SUMMARY.md`
- **Backend API:** See `netlify/functions/import-workflow.js`
- **Frontend UI:** See `src/components/WorkflowImport.jsx`

## Quick Reference

### Grouping Column Summary

| Column | Required? | Used When | Example Value |
|--------|-----------|-----------|---------------|
| `group_id` | Optional | Grouping questions | `root_cause_group` |
| `group_order` | If grouped | Within group | `1`, `2`, `3` |
| `is_last_in_group` | If grouped | Last question only | `true` or `false` |
| `group_synthesis_prompt` | If last in group | Last question only | `Synthesize these...` |
| `group_output_variable` | If last in group | Last question only | `root_cause_analysis` |

### Quick Setup Checklist

For each group:
- [ ] All questions have the same `group_id`
- [ ] All questions have unique `group_order` (1, 2, 3...)
- [ ] Exactly one question has `is_last_in_group` = "true"
- [ ] Last question has synthesis prompt
- [ ] Last question has output variable name
- [ ] Output variable used in document template

---

**Status:** ✅ Complete and Ready for Use
**Version:** Supports workflow grouping v1.0
**Compatibility:** Backward compatible with all existing CSV imports

