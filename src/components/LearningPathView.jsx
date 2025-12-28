import { useState, useEffect } from 'react';
import { useAuth0 } from '@auth0/auth0-react';
import { BookOpen, Clock, ArrowRight, CheckCircle } from 'lucide-react';
import { getLearningPath } from '../api';
import CourseDetail from './CourseDetail';

export default function LearningPathView({ pathId, onBack }) {
  const { getAccessTokenSilently } = useAuth0();
  const [path, setPath] = useState(null);
  const [selectedCourseId, setSelectedCourseId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    loadLearningPath();
  }, [pathId]);

  async function loadLearningPath() {
    if (!pathId) return;

    try {
      setLoading(true);
      setError(null);
      const accessToken = await getAccessTokenSilently();
      const data = await getLearningPath(pathId, accessToken);
      setPath(data.learning_path);
    } catch (err) {
      console.error('Error loading learning path:', err);
      setError(err.message || 'Failed to load learning path');
    } finally {
      setLoading(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-gray-500">Loading learning path...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
        <p className="text-red-800">Error: {error}</p>
        <button
          onClick={loadLearningPath}
          className="mt-2 px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700"
        >
          Retry
        </button>
      </div>
    );
  }

  if (!path) {
    return (
      <div className="p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
        <p className="text-yellow-800">Learning path not found</p>
      </div>
    );
  }

  if (selectedCourseId) {
    return (
      <CourseDetail
        courseId={selectedCourseId}
        onBack={() => setSelectedCourseId(null)}
      />
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <button
          onClick={onBack}
          className="text-sm text-indigo-600 hover:text-indigo-800 mb-2"
        >
          ← Back to Learning Paths
        </button>
        <h1 className="text-3xl font-bold text-gray-900">{path.path_name}</h1>
        {path.description && (
          <p className="text-gray-600 mt-2">{path.description}</p>
        )}
        <div className="flex items-center gap-4 mt-4 text-sm text-gray-600">
          {path.estimated_total_hours && (
            <span className="flex items-center gap-1">
              <Clock className="w-4 h-4" />
              {path.estimated_total_hours} hours
            </span>
          )}
          {path.category && (
            <span className="px-2 py-1 bg-indigo-100 text-indigo-700 rounded text-xs">
              {path.category}
            </span>
          )}
        </div>
      </div>

      {/* Course Sequence */}
      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Course Sequence</h2>
        {path.courses && path.courses.length > 0 ? (
          <div className="space-y-4">
            {path.courses.map((course, index) => (
              <div key={course.id}>
                <div className="flex items-start gap-4">
                  {/* Step Number */}
                  <div className="flex flex-col items-center">
                    <div className="w-10 h-10 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-600 font-semibold">
                      {index + 1}
                    </div>
                    {index < path.courses.length - 1 && (
                      <div className="w-0.5 h-12 bg-gray-200 mt-2" />
                    )}
                  </div>

                  {/* Course Card */}
                  <div
                    onClick={() => setSelectedCourseId(course.id)}
                    className="flex-1 border border-gray-200 rounded-lg p-4 hover:border-indigo-300 hover:shadow-md cursor-pointer transition-all"
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <h3 className="font-semibold text-gray-900">{course.title}</h3>
                        {course.description && (
                          <p className="text-sm text-gray-600 mt-1 line-clamp-2">
                            {course.description}
                          </p>
                        )}
                        <div className="flex items-center gap-4 mt-3 text-xs text-gray-500">
                          {course.estimated_hours && (
                            <span className="flex items-center gap-1">
                              <Clock className="w-3 h-3" />
                              {course.estimated_hours} hours
                            </span>
                          )}
                          {course.difficulty && (
                            <span className="capitalize px-2 py-1 bg-gray-100 rounded">
                              {course.difficulty}
                            </span>
                          )}
                        </div>
                      </div>
                      <ArrowRight className="w-5 h-5 text-gray-400 ml-4" />
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-gray-600">No courses in this learning path yet.</p>
        )}
      </div>
    </div>
  );
}

