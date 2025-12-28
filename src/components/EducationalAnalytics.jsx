import { useState, useEffect } from 'react';
import { useAuth0 } from '@auth0/auth0-react';
import { Users, BookOpen, Award, TrendingUp, Clock, BarChart3 } from 'lucide-react';
import { getEducationalAnalytics } from '../api';

export default function EducationalAnalytics() {
  const { getAccessTokenSilently } = useAuth0();
  const [analytics, setAnalytics] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [timeRange, setTimeRange] = useState('30'); // days

  useEffect(() => {
    loadAnalytics();
  }, [timeRange]);

  async function loadAnalytics() {
    try {
      setLoading(true);
      setError(null);
      const accessToken = await getAccessTokenSilently();
      const data = await getEducationalAnalytics({ time_range: timeRange }, accessToken);
      setAnalytics(data);
    } catch (err) {
      console.error('Error loading analytics:', err);
      setError(err.message || 'Failed to load analytics');
    } finally {
      setLoading(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-gray-500">Loading analytics...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
        <p className="text-red-800">Error: {error}</p>
        <button
          onClick={loadAnalytics}
          className="mt-2 px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700"
        >
          Retry
        </button>
      </div>
    );
  }

  const stats = analytics?.statistics || {};
  const courseStats = analytics?.course_statistics || [];
  const assessmentStats = analytics?.assessment_statistics || [];
  const popularContent = analytics?.popular_content || [];

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Educational Analytics</h1>
          <p className="text-gray-600 mt-1">Track student engagement and course performance</p>
        </div>
        <select
          value={timeRange}
          onChange={(e) => setTimeRange(e.target.value)}
          className="px-4 py-2 border border-gray-300 rounded-lg"
        >
          <option value="7">Last 7 days</option>
          <option value="30">Last 30 days</option>
          <option value="90">Last 90 days</option>
          <option value="365">Last year</option>
        </select>
      </div>

      {/* Statistics Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          icon={<Users className="w-6 h-6" />}
          label="Total Students"
          value={stats.total_students || 0}
          color="blue"
        />
        <StatCard
          icon={<BookOpen className="w-6 h-6" />}
          label="Active Courses"
          value={stats.active_courses || 0}
          color="green"
        />
        <StatCard
          icon={<Award className="w-6 h-6" />}
          label="Certificates Issued"
          value={stats.certificates_issued || 0}
          color="yellow"
        />
        <StatCard
          icon={<TrendingUp className="w-6 h-6" />}
          label="Avg Completion Rate"
          value={`${stats.avg_completion_rate || 0}%`}
          color="indigo"
        />
      </div>

      {/* Course Statistics */}
      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Course Performance</h2>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-200">
                <th className="text-left py-3 px-4 font-medium text-gray-700">Course</th>
                <th className="text-right py-3 px-4 font-medium text-gray-700">Enrollments</th>
                <th className="text-right py-3 px-4 font-medium text-gray-700">Completions</th>
                <th className="text-right py-3 px-4 font-medium text-gray-700">Completion Rate</th>
                <th className="text-right py-3 px-4 font-medium text-gray-700">Avg Score</th>
              </tr>
            </thead>
            <tbody>
              {courseStats.map((course, index) => (
                <tr key={course.course_id || index} className="border-b border-gray-100">
                  <td className="py-3 px-4 text-gray-900">{course.course_title}</td>
                  <td className="py-3 px-4 text-right text-gray-700">{course.enrollments || 0}</td>
                  <td className="py-3 px-4 text-right text-gray-700">{course.completions || 0}</td>
                  <td className="py-3 px-4 text-right text-gray-700">
                    {course.completion_rate ? `${course.completion_rate}%` : 'N/A'}
                  </td>
                  <td className="py-3 px-4 text-right text-gray-700">
                    {course.avg_score ? `${course.avg_score}%` : 'N/A'}
                  </td>
                </tr>
              ))}
              {courseStats.length === 0 && (
                <tr>
                  <td colSpan={5} className="py-8 text-center text-gray-500">
                    No course data available
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Assessment Statistics */}
      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Assessment Performance</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="p-4 bg-gray-50 rounded-lg">
            <div className="text-sm text-gray-600 mb-1">Average Score</div>
            <div className="text-2xl font-bold text-gray-900">
              {assessmentStats.avg_score ? `${assessmentStats.avg_score}%` : 'N/A'}
            </div>
          </div>
          <div className="p-4 bg-gray-50 rounded-lg">
            <div className="text-sm text-gray-600 mb-1">Pass Rate</div>
            <div className="text-2xl font-bold text-gray-900">
              {assessmentStats.pass_rate ? `${assessmentStats.pass_rate}%` : 'N/A'}
            </div>
          </div>
          <div className="p-4 bg-gray-50 rounded-lg">
            <div className="text-sm text-gray-600 mb-1">Total Attempts</div>
            <div className="text-2xl font-bold text-gray-900">
              {assessmentStats.total_attempts || 0}
            </div>
          </div>
          <div className="p-4 bg-gray-50 rounded-lg">
            <div className="text-sm text-gray-600 mb-1">Unique Students</div>
            <div className="text-2xl font-bold text-gray-900">
              {assessmentStats.unique_students || 0}
            </div>
          </div>
        </div>
      </div>

      {/* Popular Content */}
      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Popular Content</h2>
        <div className="space-y-3">
          {popularContent.map((item, index) => (
            <div key={index} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
              <div>
                <div className="font-medium text-gray-900">{item.title}</div>
                <div className="text-sm text-gray-500">{item.type}</div>
              </div>
              <div className="text-right">
                <div className="font-semibold text-gray-900">{item.views || 0} views</div>
                <div className="text-sm text-gray-500">{item.completions || 0} completions</div>
              </div>
            </div>
          ))}
          {popularContent.length === 0 && (
            <div className="text-center text-gray-500 py-8">
              No popular content data available
            </div>
          )}
        </div>
      </div>

      {/* Engagement Metrics */}
      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Student Engagement</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="p-4 bg-blue-50 rounded-lg">
            <div className="flex items-center gap-2 mb-2">
              <Clock className="w-5 h-5 text-blue-600" />
              <div className="text-sm text-blue-600 font-medium">Total Time Spent</div>
            </div>
            <div className="text-2xl font-bold text-blue-900">
              {formatTime(stats.total_time_minutes || 0)}
            </div>
          </div>
          <div className="p-4 bg-green-50 rounded-lg">
            <div className="flex items-center gap-2 mb-2">
              <BookOpen className="w-5 h-5 text-green-600" />
              <div className="text-sm text-green-600 font-medium">Lessons Completed</div>
            </div>
            <div className="text-2xl font-bold text-green-900">
              {stats.lessons_completed || 0}
            </div>
          </div>
          <div className="p-4 bg-purple-50 rounded-lg">
            <div className="flex items-center gap-2 mb-2">
              <BarChart3 className="w-5 h-5 text-purple-600" />
              <div className="text-sm text-purple-600 font-medium">Active This Period</div>
            </div>
            <div className="text-2xl font-bold text-purple-900">
              {stats.active_students || 0}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function StatCard({ icon, label, value, color }) {
  const colorClasses = {
    blue: 'bg-blue-50 text-blue-600',
    green: 'bg-green-50 text-green-600',
    yellow: 'bg-yellow-50 text-yellow-600',
    indigo: 'bg-indigo-50 text-indigo-600'
  };

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-4">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-sm text-gray-600 mb-1">{label}</div>
          <div className="text-2xl font-bold text-gray-900">{value}</div>
        </div>
        <div className={`p-3 rounded-lg ${colorClasses[color]}`}>
          {icon}
        </div>
      </div>
    </div>
  );
}

function formatTime(minutes) {
  if (!minutes) return '0m';
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  if (hours > 0) {
    return `${hours}h ${mins}m`;
  }
  return `${mins}m`;
}

