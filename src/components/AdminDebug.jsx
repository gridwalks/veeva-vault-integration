import { useAuth0 } from '@auth0/auth0-react';
import { useAdminRole } from '../hooks/useAdminRole.js';

/**
 * Debug component to help troubleshoot admin role issues
 * Add this temporarily to your App component to see detailed role information
 */
export default function AdminDebug() {
  const { user, isLoading, error } = useAuth0();
  const { isAdmin, debugInfo } = useAdminRole();

  if (isLoading) {
    return <div style={{ padding: '16px', backgroundColor: '#f3f4f6', margin: '16px', borderRadius: '8px' }}>
      <h3>Admin Debug - Loading...</h3>
    </div>;
  }

  if (error) {
    return <div style={{ padding: '16px', backgroundColor: '#fef2f2', margin: '16px', borderRadius: '8px' }}>
      <h3>Admin Debug - Error</h3>
      <p>Error: {error}</p>
    </div>;
  }

  return (
    <div style={{ 
      padding: '16px', 
      backgroundColor: '#f8fafc', 
      margin: '16px', 
      borderRadius: '8px',
      border: '1px solid #e5e7eb',
      fontFamily: 'monospace',
      fontSize: '12px'
    }}>
      <h3 style={{ margin: '0 0 12px 0', color: '#374151' }}>Admin Debug Information</h3>
      
      <div style={{ marginBottom: '12px' }}>
        <strong>Is Admin:</strong> <span style={{ color: isAdmin ? '#059669' : '#dc2626' }}>
          {isAdmin ? '✅ YES' : '❌ NO'}
        </span>
      </div>

      <div style={{ marginBottom: '12px' }}>
        <strong>Auth0 Domain:</strong> {debugInfo.auth0Domain || 'Not found'}
      </div>

      <div style={{ marginBottom: '12px' }}>
        <strong>Custom Claim Namespace:</strong> {debugInfo.customClaimNamespace || 'Not found'}
      </div>

      <div style={{ marginBottom: '12px' }}>
        <strong>All Roles Found:</strong> 
        {debugInfo.allRoles && debugInfo.allRoles.length > 0 ? (
          <ul style={{ margin: '4px 0 0 16px', padding: 0 }}>
            {debugInfo.allRoles.map((role, index) => (
              <li key={index} style={{ color: role === 'admin' ? '#059669' : '#374151' }}>
                {role} {role === 'admin' ? '✅' : ''}
              </li>
            ))}
          </ul>
        ) : (
          <span style={{ color: '#dc2626' }}> No roles found</span>
        )}
      </div>

      <details style={{ marginTop: '12px' }}>
        <summary style={{ cursor: 'pointer', fontWeight: 'bold' }}>Full User Object</summary>
        <pre style={{ 
          marginTop: '8px', 
          padding: '8px', 
          backgroundColor: '#ffffff', 
          border: '1px solid #d1d5db',
          borderRadius: '4px',
          overflow: 'auto',
          maxHeight: '300px'
        }}>
          {JSON.stringify(user, null, 2)}
        </pre>
      </details>

      <details style={{ marginTop: '12px' }}>
        <summary style={{ cursor: 'pointer', fontWeight: 'bold' }}>Debug Info</summary>
        <pre style={{ 
          marginTop: '8px', 
          padding: '8px', 
          backgroundColor: '#ffffff', 
          border: '1px solid #d1d5db',
          borderRadius: '4px',
          overflow: 'auto',
          maxHeight: '300px'
        }}>
          {JSON.stringify(debugInfo, null, 2)}
        </pre>
      </details>
    </div>
  );
}
