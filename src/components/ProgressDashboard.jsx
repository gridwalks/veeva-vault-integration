import { useState, useEffect } from 'react';
import { useAuth0 } from '@auth0/auth0-react';
import { TrendingUp, Clock, CheckCircle, BookOpen, Award, Target } from 'lucide-react';
import { getStudentProgress } from '../api';

export default function ProgressDashboard({ userId }) {
  const { getAccessTokenSilently } = useAuth0();
  const [progress, setProgress] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedCourse, setSelectedCourse] = useState(null);

  useEffect(() => {
    loadProgress();
  }, [userId]);

  async function loadProgress() {
    if (!userId) return;

    try {
      setLoading(true);
      setError(null);
      const accessToken = await getAccessTokenSilently();
      const data = await getStudentProgress(userId, {}, accessToken);
      setProgress(data);
    } catch (err) {
      console.error('Error loading progress:', err);
      setError(err.message || 'Failed to load progress');
    } finally {
      setLoading(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-gray-500">Loading progress...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
        <p className="text-red-800">Error: {error}</p>
        <button
          onClick={loadProgress}
          className="mt-2 px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700"
        >
          Retry
        </button>
      </div>
    );
  }

  if (!progress) {
    return (
      <div className="p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
        <p className="text-yellow-800">No progress data available</p>
      </div>
    );
  }

  const stats = progress.statistics || {};
  const courseProgress = selectedCourse
    ? progress.course_progress?.find(cp => cp.id === selectedCourse)
    : null;
  const lessonProgress = selectedCourse
    ? progress.lesson_progress?.filter(lp => lp.course_id === selectedCourse)
    : progress.lesson_progress || [];

  return (
    <div className="space-y-6">
      {/* Overall Statistics */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <StatCard
          icon={<BookOpen className="w-6 h-6" />}
          label="Total Lessons"
          value={stats.total_lessons || 0}
          color="blue"
        />
        <StatCard
          icon={<CheckCircle className="w-6 h-6" />}
          label="Completed"
          value={stats.completed_lessons || 0}
          color="green"
        />
        <StatCard
          icon={<Clock className="w-6 h-6" />}
          label="In Progress"
          value={stats.in_progress_lessons || 0}
          color="yellow"
        />
        <StatCard
          icon={<TrendingUp className="w-6 h-6" />}
          label="Completion"
          value={`${stats.overall_completion_percentage || 0}%`}
          color="indigo"
        />
      </div>

      {/* Course Progress */}
      {progress.course_progress && progress.course_progress.length > 0 && (
        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Course Progress</h2>
          <div className="space-y-4">
            {progress.course_progress.map(course => (
              <div
                key={course.id}
                className={`p-4 border rounded-lg cursor-pointer transition-all ${
                  selectedCourse === course.id
                    ? 'border-indigo-500 bg-indigo-50'
                    : 'border-gray-200 hover:border-gray-300'
                }`}
                onClick={() => setSelectedCourse(selectedCourse === course.id ? null : course.id)}
              >
                <div className="flex items-center justify-between mb-2">
                  <h3 className="font-semibold text-gray-900">{course.title}</h3>
                  <span className="text-sm font-medium text-indigo-600">
                    {course.completion_percentage}%
                  </span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-2 mb-2">
                  <div
                    className="bg-indigo-600 h-2 rounded-full transition-all"
                    style={{ width: `${course.completion_percentage}%` }}
                  />
                </div>
                <div className="flex items-center justify-between text-xs text-gray-600">
                  <span>
                    {course.completed_lessons} / {course.total_lessons} lessons
                  </span>
                  <span>{formatTime(course.time_spent_minutes || 0)}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Lesson Progress Details */}
      {lessonProgress.length > 0 && (
        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">
            {selectedCourse ? 'Lesson Progress' : 'Recent Activity'}
          </h2>
          <div className="space-y-3">
            {lessonProgress.slice(0, 20).map(lesson => (
              <div
                key={lesson.id}
                className="flex items-center justify-between p-3 border border-gray-200 rounded-lg"
              >
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <h4 className="font-medium text-gray-900">{lesson.lesson_title}</h4>
                    <StatusBadge status={lesson.status} />
                  </div>
                  <p className="text-sm text-gray-600 mt-1">
                    {lesson.course_title} • Module {lesson.module_title}
                  </p>
                  {lesson.progress_percentage > 0 && (
                    <div className="w-full bg-gray-200 rounded-full h-1.5 mt-2">
                      <div
                        className="bg-indigo-600 h-1.5 rounded-full"
                        style={{ width: `${lesson.progress_percentage}%` }}
                      />
                    </div>
                  )}
                </div>
                <div className="text-xs text-gray-500 ml-4">
                  {lesson.last_accessed_at && (
                    <div>
                      {new Date(lesson.last_accessed_at).toLocaleDateString()}
                    </div>
                  )}
                  {lesson.time_spent_minutes > 0 && (
                    <div className="mt-1">
                      {formatTime(lesson.time_spent_minutes)}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Certificates */}
      {progress.certificates && progress.certificates.length > 0 && (
        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
            <Award className="w-5 h-5 text-yellow-500" />
            Certificates
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {progress.certificates.map(cert => (
              <div key={cert.id} className="border border-yellow-200 bg-yellow-50 rounded-lg p-4">
                <h3 className="font-semibold text-gray-900">{cert.course_title}</h3>
                <p className="text-xs text-gray-600 mt-1">
                  Issued: {new Date(cert.issued_at).toLocaleDateString()}
                </p>
                {cert.pdf_url && (
                  <a
                    href={cert.pdf_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-indigo-600 hover:text-indigo-800 mt-2 inline-block"
                  >
                    Download Certificate
                  </a>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Badges */}
      {progress.badges && progress.badges.length > 0 && (
        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
            <Target className="w-5 h-5 text-purple-500" />
            Badges Earned
          </h2>
          <div className="flex flex-wrap gap-3">
            {progress.badges.map(badge => (
              <div
                key={badge.id}
                className="flex items-center gap-2 border border-gray-200 rounded-lg px-3 py-2 bg-white"
              >
                {badge.icon_url && (
                  <img src={badge.icon_url} alt={badge.badge_name} className="w-6 h-6" />
                )}
                <div>
                  <p className="text-sm font-medium text-gray-900">{badge.badge_name}</p>
                  <p className="text-xs text-gray-500">
                    {new Date(badge.earned_at).toLocaleDateString()}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
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
          <p className="text-sm text-gray-600">{label}</p>
          <p className="text-2xl font-bold text-gray-900 mt-1">{value}</p>
        </div>
        <div className={`p-3 rounded-lg ${colorClasses[color]}`}>
          {icon}
        </div>
      </div>
    </div>
  );
}

function StatusBadge({ status }) {
  const statusConfig = {
    completed: { color: 'bg-green-100 text-green-700', label: 'Completed' },
    in_progress: { color: 'bg-yellow-100 text-yellow-700', label: 'In Progress' },
    not_started: { color: 'bg-gray-100 text-gray-700', label: 'Not Started' }
  };

  const config = statusConfig[status] || statusConfig.not_started;

  return (
    <span className={`px-2 py-1 text-xs font-medium rounded ${config.color}`}>
      {config.label}
    </span>
  );
}

function formatTime(minutes) {
  if (!minutes) return '0 minutes';
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  if (hours > 0) {
    return `${hours}h ${mins > 0 ? `${mins}m` : ''}`;
  }
  return `${mins}m`;
}

