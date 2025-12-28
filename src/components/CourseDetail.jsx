import { useState, useEffect } from 'react';
import { useAuth0 } from '@auth0/auth0-react';
import { BookOpen, Clock, Users, ChevronRight, Play, CheckCircle } from 'lucide-react';
import { getCourse, updateLessonProgress } from '../api';
import LessonViewer from './LessonViewer';

export default function CourseDetail({ courseId, onBack }) {
  const { user, getAccessTokenSilently } = useAuth0();
  const [course, setCourse] = useState(null);
  const [selectedLesson, setSelectedLesson] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    loadCourse();
  }, [courseId]);

  async function loadCourse() {
    if (!courseId) return;

    try {
      setLoading(true);
      setError(null);
      const accessToken = await getAccessTokenSilently();
      const data = await getCourse(courseId, accessToken);
      setCourse(data.course);
    } catch (err) {
      console.error('Error loading course:', err);
      setError(err.message || 'Failed to load course');
    } finally {
      setLoading(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-gray-500">Loading course...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
        <p className="text-red-800">Error: {error}</p>
        <button
          onClick={loadCourse}
          className="mt-2 px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700"
        >
          Retry
        </button>
      </div>
    );
  }

  if (!course) {
    return (
      <div className="p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
        <p className="text-yellow-800">Course not found</p>
      </div>
    );
  }

  if (selectedLesson) {
    return (
      <LessonViewer
        lesson={selectedLesson}
        course={course}
        onBack={() => setSelectedLesson(null)}
        onNextLesson={(nextLesson) => setSelectedLesson(nextLesson)}
      />
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <button
            onClick={onBack}
            className="text-sm text-indigo-600 hover:text-indigo-800 mb-2"
          >
            ← Back to Courses
          </button>
          <h1 className="text-3xl font-bold text-gray-900">{course.title}</h1>
          {course.description && (
            <p className="text-gray-600 mt-2">{course.description}</p>
          )}
        </div>
      </div>

      {/* Course Info */}
      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="flex items-center gap-2">
            <Clock className="w-5 h-5 text-gray-400" />
            <div>
              <p className="text-sm text-gray-600">Estimated Time</p>
              <p className="font-semibold">{course.estimated_hours || 'N/A'} hours</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <BookOpen className="w-5 h-5 text-gray-400" />
            <div>
              <p className="text-sm text-gray-600">Modules</p>
              <p className="font-semibold">{course.modules?.length || 0}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Users className="w-5 h-5 text-gray-400" />
            <div>
              <p className="text-sm text-gray-600">Difficulty</p>
              <p className="font-semibold capitalize">{course.difficulty || 'N/A'}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Modules and Lessons */}
      <div className="space-y-4">
        {course.modules && course.modules.length > 0 ? (
          course.modules.map((module, moduleIndex) => (
            <div key={module.id} className="bg-white rounded-lg border border-gray-200 p-6">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h2 className="text-xl font-semibold text-gray-900">
                    Module {module.module_order}: {module.title}
                  </h2>
                  {module.description && (
                    <p className="text-sm text-gray-600 mt-1">{module.description}</p>
                  )}
                </div>
              </div>

              {module.lessons && module.lessons.length > 0 ? (
                <div className="space-y-2">
                  {module.lessons.map((lesson, lessonIndex) => (
                    <LessonItem
                      key={lesson.id}
                      lesson={lesson}
                      module={module}
                      onClick={() => setSelectedLesson({ ...lesson, module, course })}
                    />
                  ))}
                </div>
              ) : (
                <p className="text-sm text-gray-500">No lessons in this module yet.</p>
              )}
            </div>
          ))
        ) : (
          <div className="bg-white rounded-lg border border-gray-200 p-6 text-center">
            <p className="text-gray-600">No modules available for this course yet.</p>
          </div>
        )}
      </div>
    </div>
  );
}

function LessonItem({ lesson, module, onClick }) {
  return (
    <div
      onClick={onClick}
      className="flex items-center justify-between p-4 border border-gray-200 rounded-lg hover:border-indigo-300 hover:bg-indigo-50 cursor-pointer transition-all"
    >
      <div className="flex items-center gap-3 flex-1">
        <div className="w-8 h-8 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-600 font-semibold text-sm">
          {lesson.lesson_order}
        </div>
        <div className="flex-1">
          <h3 className="font-medium text-gray-900">{lesson.title}</h3>
          {lesson.description && (
            <p className="text-sm text-gray-600 mt-1 line-clamp-1">{lesson.description}</p>
          )}
          <div className="flex items-center gap-4 mt-2 text-xs text-gray-500">
            {lesson.estimated_minutes && (
              <span className="flex items-center gap-1">
                <Clock className="w-3 h-3" />
                {lesson.estimated_minutes} min
              </span>
            )}
            {lesson.content_type && (
              <span className="capitalize">{lesson.content_type}</span>
            )}
          </div>
        </div>
      </div>
      <ChevronRight className="w-5 h-5 text-gray-400" />
    </div>
  );
}

