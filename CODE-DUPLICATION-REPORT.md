# Code Duplication Report - netlify/functions/

## Summary
This report identifies duplicate code patterns in the netlify/functions directory that should be refactored to improve maintainability.

## Critical Duplications

### 1. `generateSafeFileName` Function - DUPLICATED in 2 files
**Location:** 
- `blob-upload.js` (lines 13-41)
- `upload-documents.js` (lines 229-257)

**Identical code:** ✓ Yes (identical implementations)

**Impact:** High - Any bug fix or enhancement needs to be applied in multiple places

**Recommendation:** 
Create a shared utility module `utils.js`:
```javascript
// utils.js
export function generateSafeFileName(fileName) {
  if (!fileName) return '';
  const trimmed = fileName.trim();
  if (!trimmed) return '';
  const lower = trimmed.toLowerCase();
  const lastDotIndex = lower.lastIndexOf('.');
  let base = lower;
  let extension = '';
  if (lastDotIndex > 0 && lastDotIndex < lower.length - 1) {
    base = lower.substring(0, lastDotIndex);
    extension = lower.substring(lastDotIndex + 1);
  }
  const safeBase = base.replace(/[^a-z0-9]+/g, '-').replace(/^-+/, '').replace(/-+$/, '').substring(0, 96) || 'document';
  const safeExtension = extension.replace(/[^a-z0-9]+/g, '').substring(0, 16);
  return safeExtension ? `${safeBase}.${safeExtension}` : safeBase;
}
```

Then both files can import:
```javascript
import { generateSafeFileName } from './utils.js';
```

---

### 2. `extractTextFromFile` Function - PARTIAL DUPLICATION
**Location:**
- `blob-upload.js` (lines 138-194) - Has its own implementation
- `text-extraction-utils.js` - Shared utility (already exists)
- `upload-documents.js` - Correctly imports from text-extraction-utils.js

**Status:** blob-upload.js has duplicate logic instead of using the shared utility

**Recommendation:**
Refactor `blob-upload.js` to import from `text-extraction-utils.js`:
```javascript
// In blob-upload.js, replace the function with:
import { extractTextFromFile } from './text-extraction-utils.js';
```

---

### 3. `STORE_NAME` Constant - DUPLICATED in 4 files
**Location:**
- `blob-upload.js` line 11
- `blob-delete.js` line 4
- `cleanup-blobs.js` line 4
- `list-blob-documents.js` line 55

**Value:** `'chat-uploads'`

**Recommendation:**
Create a config file or shared constants:
```javascript
// blob-storage-config.js
export const BLOB_STORAGE_CONFIG = {
  STORE_NAME: 'chat-uploads',
  STORE_NAMES_DOCUMENTS: 'documents',
  STORE_NAMES_UPLOADS: 'chat-uploads'
};
```

---

## Medium Priority Duplications

### 4. Similar `update-uploaded-document.js` Safe Name Logic
**Location:** `update-uploaded-document.js` (lines 143-149)

Similar logic to `generateSafeFileName` but with slight variations:
```javascript
const safeBase = trimmedSafeName
  .toLowerCase()
  .replace(/[^a-z0-9._-]+/g, '-')
  .replace(/-+/g, '-')
  .replace(/^-+/, '')
  .replace(/-+$/, '');
```

**Recommendation:** Use the same shared `generateSafeFileName` function

---

## Statistics

- **Total duplications found:** 4 major patterns
- **Files affected:** 6-7 files
- **Estimated lines of duplicate code:** ~200+ lines
- **Risk level:** Medium-High (maintenance burden, inconsistency risks)

## Next Steps

1. Create `netlify/functions/utils.js` with shared functions
2. Refactor `blob-upload.js` to use `text-extraction-utils.js`
3. Create `netlify/functions/blob-storage-config.js` for constants
4. Update all files to import from shared modules
5. Test all affected functions after refactoring

