import React, { useState, useEffect } from 'react';
import { getIndexingLogs, cleanupIndexingLogs } from '../api.js';

export default function IndexingLogs() {
  const [logs, setLogs] = useState([]);
  const [statistics, setStatistics] = useState([]);
  const [pagination, setPagination] = useState({ total: 0, limit: 50, offset: 0, hasMore: false });
  const [filters, setFilters] = useState({
    operationType: '',
    sourceType: '',
    status: '',
    batchId: '',
    startDate: '',
    endDate: ''
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [cleanupLoading, setCleanupLoading] = useState(false);
  const [cleanupResult, setCleanupResult] = useState(null);
  const [retentionDays, setRetentionDays] = useState(30);

  const loadLogs = async (newOffset = 0, newFilters = filters) => {
    setLoading(true);
    setError(null);
    
    try {
      const data = await getIndexingLogs({
        limit: pagination.limit,
        offset: newOffset,
        ...newFilters
      });
      
      setLogs(data.logs);
      setStatistics(data.statistics);
      setPagination(data.pagination);
    } catch (err) {
      setError(err.message);
      console.error('Failed to load indexing logs:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadLogs();
  }, []);

  const handleFilterChange = (key, value) => {
    const newFilters = { ...filters, [key]: value };
    setFilters(newFilters);
    loadLogs(0, newFilters);
  };

  const handlePageChange = (newOffset) => {
    loadLogs(newOffset);
  };

  const handleCleanup = async (dryRun = false) => {
    setCleanupLoading(true);
    setCleanupResult(null);
    
    try {
      const result = await cleanupIndexingLogs({ 
        retentionDays, 
        dryRun 
      });
      setCleanupResult(result);
      
      if (!dryRun && result.success) {
        // Refresh logs after cleanup
        loadLogs();
      }
    } catch (err) {
      setCleanupResult({ 
        success: false, 
        error: err.message 
      });
      console.error('Failed to cleanup logs:', err);
    } finally {
      setCleanupLoading(false);
    }
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'success': return 'text-green-600 bg-green-100';
      case 'error': return 'text-red-600 bg-red-100';
      case 'skipped': return 'text-yellow-600 bg-yellow-100';
      case 'timeout': return 'text-orange-600 bg-orange-100';
      default: return 'text-gray-600 bg-gray-100';
    }
  };

  const getOperationTypeColor = (operationType) => {
    switch (operationType) {
      case 'index': return 'text-blue-600 bg-blue-100';
      case 'regenerate': return 'text-purple-600 bg-purple-100';
      case 'force_regenerate': return 'text-red-600 bg-red-100';
      case 'upload': return 'text-green-600 bg-green-100';
      default: return 'text-gray-600 bg-gray-100';
    }
  };

  const getSourceTypeColor = (sourceType) => {
    switch (sourceType) {
      case 'veeva': return 'text-indigo-600 bg-indigo-100';
      case 'upload': return 'text-emerald-600 bg-emerald-100';
      case 'external': return 'text-amber-600 bg-amber-100';
      default: return 'text-gray-600 bg-gray-100';
    }
  };

  return (
    <div className="p-6">
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-gray-900 mb-4">Document Indexing Logs</h2>
        
        {/* Statistics Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          {statistics.map((stat, index) => (
            <div key={index} className="bg-white p-4 rounded-lg shadow border">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-600">
                    {stat.operationType} - {stat.sourceType}
                  </p>
                  <p className="text-2xl font-bold text-gray-900">{stat.count}</p>
                  <p className="text-xs text-gray-500 capitalize">{stat.status}</p>
                </div>
                <div className="text-right">
                  <p className="text-sm text-gray-600">
                    {stat.avgDurationMs ? `${Math.round(stat.avgDurationMs)}ms` : 'N/A'}
                  </p>
                  <p className="text-xs text-gray-500">
                    {stat.chunksCreated} chunks
                  </p>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Log Cleanup Section */}
        <div className="bg-white p-4 rounded-lg shadow border mb-6">
          <h3 className="text-lg font-semibold mb-4">Log Cleanup</h3>
          <div className="flex items-center space-x-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Retention Days
              </label>
              <input
                type="number"
                value={retentionDays}
                onChange={(e) => setRetentionDays(parseInt(e.target.value) || 30)}
                min="1"
                max="365"
                className="w-24 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div className="flex space-x-2">
              <button
                onClick={() => handleCleanup(true)}
                disabled={cleanupLoading}
                className="px-4 py-2 bg-yellow-600 text-white rounded-md hover:bg-yellow-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {cleanupLoading ? 'Checking...' : 'Preview Cleanup'}
              </button>
              <button
                onClick={() => handleCleanup(false)}
                disabled={cleanupLoading}
                className="px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {cleanupLoading ? 'Cleaning...' : 'Cleanup Logs'}
              </button>
            </div>
          </div>
          
          {cleanupResult && (
            <div className={`mt-4 p-3 rounded-md ${
              cleanupResult.success 
                ? 'bg-green-100 text-green-800' 
                : 'bg-red-100 text-red-800'
            }`}>
              <div className="font-medium">
                {cleanupResult.success ? 'Cleanup Result' : 'Cleanup Error'}
              </div>
              <div className="text-sm mt-1">
                {cleanupResult.message || cleanupResult.error}
              </div>
              {cleanupResult.statistics && (
                <div className="text-sm mt-2">
                  <div>Total logs remaining: {cleanupResult.statistics.totalLogs}</div>
                  <div>Oldest log: {new Date(cleanupResult.statistics.oldestLog).toLocaleString()}</div>
                  <div>Newest log: {new Date(cleanupResult.statistics.newestLog).toLocaleString()}</div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Filters */}
        <div className="bg-white p-4 rounded-lg shadow border mb-6">
          <h3 className="text-lg font-semibold mb-4">Filters</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Operation Type
              </label>
              <select
                value={filters.operationType}
                onChange={(e) => handleFilterChange('operationType', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">All</option>
                <option value="index">Index</option>
                <option value="regenerate">Regenerate</option>
                <option value="force_regenerate">Force Regenerate</option>
                <option value="upload">Upload</option>
              </select>
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Source Type
              </label>
              <select
                value={filters.sourceType}
                onChange={(e) => handleFilterChange('sourceType', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">All</option>
                <option value="veeva">Veeva</option>
                <option value="upload">Upload</option>
                <option value="external">External</option>
              </select>
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Status
              </label>
              <select
                value={filters.status}
                onChange={(e) => handleFilterChange('status', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">All</option>
                <option value="success">Success</option>
                <option value="error">Error</option>
                <option value="skipped">Skipped</option>
                <option value="timeout">Timeout</option>
              </select>
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Batch ID
              </label>
              <input
                type="text"
                value={filters.batchId}
                onChange={(e) => handleFilterChange('batchId', e.target.value)}
                placeholder="Enter batch ID"
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Start Date
              </label>
              <input
                type="date"
                value={filters.startDate}
                onChange={(e) => handleFilterChange('startDate', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                End Date
              </label>
              <input
                type="date"
                value={filters.endDate}
                onChange={(e) => handleFilterChange('endDate', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>
        </div>
      </div>

      {/* Logs Table */}
      <div className="bg-white rounded-lg shadow border">
        <div className="px-6 py-4 border-b border-gray-200">
          <h3 className="text-lg font-semibold">
            Logs ({pagination.total} total)
          </h3>
        </div>
        
        {loading && (
          <div className="p-6 text-center">
            <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
            <p className="mt-2 text-gray-600">Loading logs...</p>
          </div>
        )}
        
        {error && (
          <div className="p-6 text-center">
            <div className="text-red-600 mb-2">Error loading logs</div>
            <p className="text-gray-600">{error}</p>
            <button
              onClick={() => loadLogs()}
              className="mt-2 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
            >
              Retry
            </button>
          </div>
        )}
        
        {!loading && !error && logs.length === 0 && (
          <div className="p-6 text-center text-gray-600">
            No logs found matching your criteria.
          </div>
        )}
        
        {!loading && !error && logs.length > 0 && (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Document
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Operation
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Status
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Duration
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Chunks
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Batch
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Timestamp
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {logs.map((log) => (
                  <tr key={log.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex flex-col">
                        <div className="text-sm font-medium text-gray-900 truncate max-w-xs">
                          {log.documentName}
                        </div>
                        <div className="text-xs text-gray-500">
                          {log.documentNumber} • {log.documentType}
                        </div>
                        {log.errorMessage && (
                          <div className="text-xs text-red-600 mt-1 truncate max-w-xs">
                            {log.errorMessage}
                          </div>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex flex-col space-y-1">
                        <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${getOperationTypeColor(log.operationType)}`}>
                          {log.operationType.replace('_', ' ')}
                        </span>
                        <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${getSourceTypeColor(log.sourceType)}`}>
                          {log.sourceType}
                        </span>
                        {log.forceRegenerate && (
                          <span className="text-xs text-red-600 font-medium">Force</span>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${getStatusColor(log.status)}`}>
                        {log.status}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {log.durationDisplay}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      <div className="flex flex-col">
                        <span>{log.chunksCreated}</span>
                        {log.summaryGenerated && (
                          <span className="text-xs text-green-600">✓ Summary</span>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      <div className="flex flex-col">
                        <span className="font-mono text-xs">{log.batchId}</span>
                        <span className="text-xs">#{log.batchOffset}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {new Date(log.createdAt).toLocaleString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        
        {/* Pagination */}
        {!loading && !error && logs.length > 0 && (
          <div className="px-6 py-4 border-t border-gray-200 flex items-center justify-between">
            <div className="text-sm text-gray-700">
              Showing {pagination.offset + 1} to {Math.min(pagination.offset + pagination.limit, pagination.total)} of {pagination.total} results
            </div>
            <div className="flex space-x-2">
              <button
                onClick={() => handlePageChange(Math.max(0, pagination.offset - pagination.limit))}
                disabled={pagination.offset === 0}
                className="px-3 py-1 text-sm border border-gray-300 rounded-md disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50"
              >
                Previous
              </button>
              <button
                onClick={() => handlePageChange(pagination.offset + pagination.limit)}
                disabled={!pagination.hasMore}
                className="px-3 py-1 text-sm border border-gray-300 rounded-md disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
