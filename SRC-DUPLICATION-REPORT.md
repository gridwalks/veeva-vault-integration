# Code Duplication Report - src/

## Analysis Summary

After analyzing the `src/` directory for code duplication, I've identified several patterns that could be refactored.

## Findings

### 1. API Error Handling Pattern - HIGH DUPLICATION

**Location:** `src/api.js` (throughout the entire file)

**Pattern:** Every API function follows the same structure:

```javascript
export async function someFunction(params) {
  const startTime = Date.now();
  console.log('Starting...', params);
  
  try {
    const res = await fetch(url);
    
    if (!res.ok) {
      const errorText = await res.text();
      console.error('Failed:', { status, errorText, url, params });
      throw new Error(`Failed: ${res.status} ${res.statusText}`);
    }
    
    const data = await res.json();
    const duration = Date.now() - startTime;
    console.log(`Completed in ${duration}ms:`, data);
    
    return data;
  } catch (error) {
    const duration = Date.now() - startTime;
    console.error(`Error after ${duration}ms:`, { message, stack, params });
    throw error;
  }
}
```

**Impact:** 
- This pattern is repeated in **~37 API functions**
- Each function has ~30-40 lines of identical error handling
- Total duplicate code: **~1100-1400 lines**

**Recommendation:** 
Create a generic API request wrapper function:

```javascript
async function apiRequest({ url, params, method = 'GET', body, errorMessage, successMessage }) {
  const startTime = Date.now();
  const queryString = params ? new URLSearchParams(params).toString() : '';
  const fullUrl = queryString ? `${url}?${queryString}` : url;
  
  console.log(successMessage || 'API request...', params);
  
  try {
    const config = { method };
    if (body) {
      config.body = JSON.stringify(body);
      config.headers = { 'Content-Type': 'application/json' };
    }
    
    const res = await fetch(fullUrl, config);
    
    if (!res.ok) {
      const errorText = await res.text();
      console.error(errorMessage || 'Request failed:', {
        status: res.status,
        statusText: res.statusText,
        errorText,
        url: res.url,
        params
      });
      throw new Error(errorMessage || `Request failed: ${res.status} ${res.statusText}`);
    }
    
    const data = await res.json();
    const duration = Date.now() - startTime;
    console.log(`Request completed in ${duration}ms`, data);
    
    return data;
  } catch (error) {
    const duration = Date.now() - startTime;
    console.error(`Request error after ${duration}ms:`, {
      message: error.message,
      stack: error.stack,
      params
    });
    throw error;
  }
}
```

Then each function becomes:
```javascript
export async function listApproved({ name = "", limit = 50, offset = 0 } = {}) {
  return apiRequest({
    url: '/api/list-approved',
    params: { name, limit, offset },
    successMessage: 'Fetching approved documents...',
    errorMessage: 'Failed to load documents'
  });
}
```

### 2. React Component Inline Styles - MODERATE DUPLICATION

**Location:** Throughout all components in `src/components/`

**Pattern:** Inline style objects with similar patterns:
```javascript
const style = {
  backgroundColor: '#f8fafc',
  padding: '16px',
  border: '1px solid #e5e7eb',
  borderRadius: '8px',
  // ... more similar styles
}
```

**Impact:** Moderate - Many components have similar styling patterns

**Recommendation:**
Consider using Tailwind CSS classes (which is already installed based on `tailwind.config.js`) or create a theme/styling constants file.

### 3. Data Fetching with Loading States - DUPLICATION IN COMPONENTS

**Location:** Multiple components in `src/components/`

**Pattern:** Similar loading/error state management:
```javascript
const [loading, setLoading] = useState(false);
const [error, setError] = useState(null);
const [data, setData] = useState(null);

useEffect(() => {
  const fetchData = async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await apiFunction();
      setData(result);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };
  fetchData();
}, [dependencies]);
```

**Recommendation:** Create a custom hook `useAsync` or similar.

## Priority Recommendations

### High Priority (Implement Now)
1. **Refactor API.js error handling** - Will reduce ~1100 lines of duplicate code
2. **Create API request wrapper** - DRY principle, easier to maintain

### Medium Priority (Consider for Later)
1. **Create custom hooks for data fetching**
2. **Extract common styling constants**
3. **Consider migrating to Tailwind classes**

## Files Affected

### High Impact
- `src/api.js` - Entire file refactoring needed (~1700 lines)
- Potentially reduces to ~600-800 lines with wrapper

### Medium Impact
- Components with inline styles
- Components with repeated loading state logic

## Estimated Impact

- **Lines eliminated:** ~800-1000 lines of duplicate code
- **Maintainability:** Significantly improved
- **Bug risk:** Reduced (single source for error handling)
- **Development speed:** Faster (wrapper handles common patterns)

