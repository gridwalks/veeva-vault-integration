import { useState, useEffect } from 'react';
import { useAuth0 } from '@auth0/auth0-react';
import { BookOpen, Award, Clock, TrendingUp, GraduationCap, Target, CheckCircle } from 'lucide-react';
import { getStudentProgress, listLearningPaths, listCourses } from '../api';
import CourseCatalog from './CourseCatalog';
import ProgressDashboard from './ProgressDashboard';

export default function StudentDashboard({ onOpenCourse, onOpenLearningPath }) {
  const { user, getAccessTokenSilently } = useAuth0();
  const [activeTab, setActiveTab] = useState('overview');
  const [progress, setProgress] = useState(null);
  const [learningPaths, setLearningPaths] = useState([]);
  const [recommendedCourses, setRecommendedCourses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    loadDashboardData();
  }, [user]);

  async function loadDashboardData() {
    if (!user?.sub) return;

    try {
      setLoading(true);
      setError(null);

      const accessToken = await getAccessTokenSilently();

      // Load progress
      const progressData = await getStudentProgress(user.sub, {}, accessToken);
      setProgress(progressData);

      // Load learning paths
      const pathsData = await listLearningPaths({ is_published: true }, accessToken);
      setLearningPaths(pathsData.learning_paths || []);

      // Load recommended courses (published courses)
      const coursesData = await listCourses({ is_published: true }, accessToken);
      setRecommendedCourses(coursesData.courses || []);
    } catch (err) {
      console.error('Error loading dashboard data:', err);
      setError(err.message || 'Failed to load dashboard data');
    } finally {
      setLoading(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-gray-500">Loading dashboard...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
        <p className="text-red-800">Error: {error}</p>
        <button
          onClick={loadDashboardData}
          className="mt-2 px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700"
        >
          Retry
        </button>
      </div>
    );
  }

  const stats = progress?.statistics || {
    total_lessons: 0,
    completed_lessons: 0,
    in_progress_lessons: 0,
    total_courses: 0,
    completed_courses: 0,
    total_time_minutes: 0,
    overall_completion_percentage: 0
  };

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">My Learning Dashboard</h1>
        <p className="text-gray-600 mt-1">Welcome back! Continue your GxP learning journey.</p>
      </div>

      {/* Tabs */}
      <div className="border-b border-gray-200">
        <nav className="flex space-x-8">
          {[
            { id: 'overview', label: 'Overview' },
            { id: 'courses', label: 'Courses' },
            { id: 'progress', label: 'My Progress' }
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`py-4 px-1 border-b-2 font-medium text-sm ${
                activeTab === tab.id
                  ? 'border-indigo-500 text-indigo-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </nav>
      </div>

      {/* Tab Content */}
      {activeTab === 'overview' && (
        <div className="space-y-6">
          {/* Statistics Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <StatCard
              icon={<BookOpen className="w-6 h-6" />}
              label="Total Lessons"
              value={stats.total_lessons}
              color="blue"
            />
            <StatCard
              icon={<CheckCircle className="w-6 h-6" />}
              label="Completed"
              value={stats.completed_lessons}
              color="green"
            />
            <StatCard
              icon={<Clock className="w-6 h-6" />}
              label="In Progress"
              value={stats.in_progress_lessons}
              color="yellow"
            />
            <StatCard
              icon={<TrendingUp className="w-6 h-6" />}
              label="Completion"
              value={`${stats.overall_completion_percentage}%`}
              color="indigo"
            />
          </div>

          {/* Progress Overview */}
          <div className="bg-white rounded-lg border border-gray-200 p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Overall Progress</h2>
            <div className="space-y-4">
              <ProgressBar
                label="Lessons Completed"
                current={stats.completed_lessons}
                total={stats.total_lessons}
                percentage={stats.overall_completion_percentage}
              />
              <div className="flex justify-between text-sm text-gray-600">
                <span>Time Spent: {formatTime(stats.total_time_minutes)}</span>
                <span>Courses: {stats.completed_courses} / {stats.total_courses}</span>
              </div>
            </div>
          </div>

          {/* Learning Paths */}
          {learningPaths.length > 0 && (
            <div className="bg-white rounded-lg border border-gray-200 p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">Learning Paths</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {learningPaths.slice(0, 4).map(path => (
                  <LearningPathCard
                    key={path.id}
                    path={path}
                    onClick={() => onOpenLearningPath && onOpenLearningPath(path.id)}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Recommended Courses */}
          {recommendedCourses.length > 0 && (
            <div className="bg-white rounded-lg border border-gray-200 p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">Recommended Courses</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {recommendedCourses.slice(0, 6).map(course => (
                  <CourseCard
                    key={course.id}
                    course={course}
                    onClick={() => onOpenCourse && onOpenCourse(course.id)}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Certificates */}
          {progress?.certificates && progress.certificates.length > 0 && (
            <div className="bg-white rounded-lg border border-gray-200 p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
                <Award className="w-5 h-5 text-yellow-500" />
                Certificates Earned
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {progress.certificates.map(cert => (
                  <CertificateCard key={cert.id} certificate={cert} />
                ))}
              </div>
            </div>
          )}

          {/* Badges */}
          {progress?.badges && progress.badges.length > 0 && (
            <div className="bg-white rounded-lg border border-gray-200 p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
                <Target className="w-5 h-5 text-purple-500" />
                Badges Earned
              </h2>
              <div className="flex flex-wrap gap-3">
                {progress.badges.map(badge => (
                  <BadgeCard key={badge.id} badge={badge} />
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {activeTab === 'courses' && (
        <CourseCatalog onOpenCourse={onOpenCourse} />
      )}

      {activeTab === 'progress' && (
        <ProgressDashboard userId={user?.sub} />
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

function ProgressBar({ label, current, total, percentage }) {
  return (
    <div>
      <div className="flex justify-between text-sm mb-1">
        <span className="text-gray-700">{label}</span>
        <span className="text-gray-600">{current} / {total}</span>
      </div>
      <div className="w-full bg-gray-200 rounded-full h-2">
        <div
          className="bg-indigo-600 h-2 rounded-full transition-all"
          style={{ width: `${percentage}%` }}
        />
      </div>
    </div>
  );
}

function LearningPathCard({ path, onClick }) {
  return (
    <div
      onClick={onClick}
      className="border border-gray-200 rounded-lg p-4 hover:border-indigo-300 hover:shadow-md cursor-pointer transition-all"
    >
      <h3 className="font-semibold text-gray-900">{path.path_name}</h3>
      <p className="text-sm text-gray-600 mt-1 line-clamp-2">{path.description}</p>
      <div className="flex items-center gap-4 mt-3 text-xs text-gray-500">
        <span>{path.course_count || 0} courses</span>
        {path.estimated_total_hours && (
          <span>{path.estimated_total_hours} hours</span>
        )}
      </div>
    </div>
  );
}

function CourseCard({ course, onClick }) {
  return (
    <div
      onClick={onClick}
      className="border border-gray-200 rounded-lg p-4 hover:border-indigo-300 hover:shadow-md cursor-pointer transition-all"
    >
      <h3 className="font-semibold text-gray-900">{course.title}</h3>
      <p className="text-sm text-gray-600 mt-1 line-clamp-2">{course.description}</p>
      <div className="flex items-center gap-4 mt-3 text-xs text-gray-500">
        <span className="capitalize">{course.difficulty}</span>
        {course.estimated_hours && (
          <span>{course.estimated_hours} hours</span>
        )}
        {course.module_count > 0 && (
          <span>{course.module_count} modules</span>
        )}
      </div>
    </div>
  );
}

function CertificateCard({ certificate }) {
  return (
    <div className="border border-yellow-200 bg-yellow-50 rounded-lg p-4">
      <div className="flex items-center gap-2 mb-2">
        <Award className="w-5 h-5 text-yellow-600" />
        <h3 className="font-semibold text-gray-900">{certificate.course_title}</h3>
      </div>
      <p className="text-xs text-gray-600">
        Issued: {new Date(certificate.issued_at).toLocaleDateString()}
      </p>
      {certificate.pdf_url && (
        <a
          href={certificate.pdf_url}
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs text-indigo-600 hover:text-indigo-800 mt-2 inline-block"
        >
          Download Certificate
        </a>
      )}
    </div>
  );
}

function BadgeCard({ badge }) {
  return (
    <div className="flex items-center gap-2 border border-gray-200 rounded-lg px-3 py-2 bg-white">
      {badge.icon_url && (
        <img src={badge.icon_url} alt={badge.badge_name} className="w-6 h-6" />
      )}
      <div>
        <p className="text-sm font-medium text-gray-900">{badge.badge_name}</p>
        <p className="text-xs text-gray-500">
          Earned {new Date(badge.earned_at).toLocaleDateString()}
        </p>
      </div>
    </div>
  );
}

function formatTime(minutes) {
  if (!minutes) return '0 minutes';
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  if (hours > 0) {
    return `${hours} hour${hours > 1 ? 's' : ''} ${mins > 0 ? `${mins} minute${mins > 1 ? 's' : ''}` : ''}`;
  }
  return `${mins} minute${mins > 1 ? 's' : ''}`;
}

