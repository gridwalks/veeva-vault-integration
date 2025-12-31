import { useState, useEffect } from 'react';
import { useAuth0 } from '@auth0/auth0-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { ChevronLeft, ChevronRight, MessageCircle, CheckCircle, Clock, BookOpen } from 'lucide-react';
import { updateLessonProgress, chatWithAITutor } from '../api';
import StaticChatPane from './StaticChatPane';

export default function LessonViewer({ lesson, course, module, onBack, onNextLesson }) {
  const { user, getAccessTokenSilently } = useAuth0();
  const [showTutor, setShowTutor] = useState(false);
  const [progress, setProgress] = useState({ status: 'not_started', progress_percentage: 0 });
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    // Load lesson progress if available
    loadProgress();
  }, [lesson?.id]);

  async function loadProgress() {
    // Progress would be loaded from student-progress API
    // For now, we'll track locally
  }

  async function markAsComplete() {
    if (!lesson?.id || !user?.sub) return;

    try {
      setLoading(true);
      const accessToken = await getAccessTokenSilently();
      await updateLessonProgress({
        lesson_id: lesson.id,
        status: 'completed',
        progress_percentage: 100
      }, accessToken);
      setProgress({ status: 'completed', progress_percentage: 100 });
    } catch (err) {
      console.error('Error updating progress:', err);
    } finally {
      setLoading(false);
    }
  }

  function getNextLesson() {
    if (!module?.lessons || !course?.modules) return null;

    const currentModuleIndex = course.modules.findIndex(m => m.id === module.id);
    const currentLessonIndex = module.lessons.findIndex(l => l.id === lesson.id);

    // Check if there's a next lesson in current module
    if (currentLessonIndex < module.lessons.length - 1) {
      return module.lessons[currentLessonIndex + 1];
    }

    // Check if there's a next module with lessons
    for (let i = currentModuleIndex + 1; i < course.modules.length; i++) {
      const nextModule = course.modules[i];
      if (nextModule.lessons && nextModule.lessons.length > 0) {
        return nextModule.lessons[0];
      }
    }

    return null;
  }

  function getPreviousLesson() {
    if (!module?.lessons || !course?.modules) return null;

    const currentModuleIndex = course.modules.findIndex(m => m.id === module.id);
    const currentLessonIndex = module.lessons.findIndex(l => l.id === lesson.id);

    // Check if there's a previous lesson in current module
    if (currentLessonIndex > 0) {
      return module.lessons[currentLessonIndex - 1];
    }

    // Check if there's a previous module with lessons
    for (let i = currentModuleIndex - 1; i >= 0; i--) {
      const prevModule = course.modules[i];
      if (prevModule.lessons && prevModule.lessons.length > 0) {
        return prevModule.lessons[prevModule.lessons.length - 1];
      }
    }

    return null;
  }

  const nextLesson = getNextLesson();
  const previousLesson = getPreviousLesson();

  if (showTutor) {
    return (
      <div className="h-full flex flex-col">
        <div className="p-4 border-b border-gray-200 bg-white">
          <button
            onClick={() => setShowTutor(false)}
            className="text-sm text-indigo-600 hover:text-indigo-800"
          >
            ← Back to Lesson
          </button>
          <h2 className="text-lg font-semibold mt-2">AI Tutor - {lesson.title}</h2>
        </div>
        <div className="flex-1 overflow-hidden">
          <StaticChatPane
            selectedDocuments={[]}
            onOpenDocumentInPane={() => {}}
            userId={user?.sub}
            tutoringMode={true}
            courseId={course?.id}
            lessonId={lesson?.id}
            onReferencedDocumentsUpdate={() => {}}
            onClearWorkspace={() => {}}
          />
        </div>
      </div>
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
            ← Back to Course
          </button>
          <div className="flex items-center gap-2 text-sm text-gray-600 mb-2">
            <span>{course?.title}</span>
            <ChevronRight className="w-4 h-4" />
            <span>Module {module?.module_order}</span>
            <ChevronRight className="w-4 h-4" />
            <span>Lesson {lesson.lesson_order}</span>
          </div>
          <h1 className="text-3xl font-bold text-gray-900">{lesson.title}</h1>
          {lesson.description && (
            <p className="text-gray-600 mt-2">{lesson.description}</p>
          )}
        </div>
      </div>

      {/* Lesson Info Bar */}
      <div className="bg-white rounded-lg border border-gray-200 p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-6 text-sm text-gray-600">
            {lesson.estimated_minutes && (
              <span className="flex items-center gap-1">
                <Clock className="w-4 h-4" />
                {lesson.estimated_minutes} minutes
              </span>
            )}
            {lesson.content_type && (
              <span className="flex items-center gap-1">
                <BookOpen className="w-4 h-4" />
                {lesson.content_type}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowTutor(true)}
              className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700"
            >
              <MessageCircle className="w-4 h-4" />
              Ask AI Tutor
            </button>
            {progress.status !== 'completed' && (
              <button
                onClick={markAsComplete}
                disabled={loading}
                className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50"
              >
                <CheckCircle className="w-4 h-4" />
                Mark Complete
              </button>
            )}
            {progress.status === 'completed' && (
              <div className="flex items-center gap-2 px-4 py-2 bg-green-100 text-green-700 rounded-lg">
                <CheckCircle className="w-4 h-4" />
                Completed
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Lesson Content */}
      <div className="bg-white rounded-lg border border-gray-200 p-6">
        {lesson.content_data ? (
          <div className="prose max-w-none">
            {lesson.content_type === 'text' || lesson.content_type === 'markdown' ? (
              <ReactMarkdown remarkPlugins={[remarkGfm]}>
                {lesson.content_data.content || lesson.content_data.text || ''}
              </ReactMarkdown>
            ) : lesson.content_type === 'video' ? (
              <div className="aspect-video">
                {lesson.content_data.video_url ? (
                  <iframe
                    src={lesson.content_data.video_url}
                    className="w-full h-full rounded-lg"
                    allowFullScreen
                  />
                ) : (
                  <p className="text-gray-600">Video content not available</p>
                )}
              </div>
            ) : (
              <div className="text-gray-600">
                <p>Content type: {lesson.content_type}</p>
                <pre className="mt-4 p-4 bg-gray-50 rounded overflow-auto">
                  {JSON.stringify(lesson.content_data, null, 2)}
                </pre>
              </div>
            )}
          </div>
        ) : lesson.cfr_regulation_id || lesson.document_id || lesson.workflow_template_id ? (
          <div className="space-y-4">
            <div className="prose max-w-none">
              {lesson.description && (
                <div className="mb-6">
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>
                    {lesson.description}
                  </ReactMarkdown>
                </div>
              )}
            </div>
            
            <div className="space-y-4">
              <h3 className="text-lg font-semibold text-gray-900">Linked Resources</h3>
              
              {lesson.cfr_regulation_id && (
                <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
                  <div className="flex items-start gap-3">
                    <BookOpen className="w-5 h-5 text-blue-600 mt-0.5" />
                    <div className="flex-1">
                      <h4 className="font-medium text-blue-900">CFR Regulation</h4>
                      <p className="text-sm text-blue-700 mt-1">
                        {lesson.cfr_regulation_title || lesson.cfr_regulation_identifier || `Regulation ID: ${lesson.cfr_regulation_id}`}
                      </p>
                      <p className="text-sm text-gray-600 mt-2">
                        This lesson references a CFR Title 21 regulation. You can ask the AI Tutor about this regulation or explore it through the document chat interface.
                      </p>
                    </div>
                  </div>
                </div>
              )}
              
              {lesson.document_id && (
                <div className="p-4 bg-green-50 border border-green-200 rounded-lg">
                  <div className="flex items-start gap-3">
                    <BookOpen className="w-5 h-5 text-green-600 mt-0.5" />
                    <div className="flex-1">
                      <h4 className="font-medium text-green-900">Document</h4>
                      <p className="text-sm text-green-700 mt-1">
                        {lesson.document_name || `Document ID: ${lesson.document_id}`}
                      </p>
                      {lesson.document_number && (
                        <p className="text-sm text-gray-600 mt-1">
                          Document Number: {lesson.document_number}
                        </p>
                      )}
                      <p className="text-sm text-gray-600 mt-2">
                        This lesson references a document. You can access it through the document chat interface or ask the AI Tutor questions about it.
                      </p>
                    </div>
                  </div>
                </div>
              )}
              
              {lesson.workflow_template_id && (
                <div className="p-4 bg-purple-50 border border-purple-200 rounded-lg">
                  <div className="flex items-start gap-3">
                    <BookOpen className="w-5 h-5 text-purple-600 mt-0.5" />
                    <div className="flex-1">
                      <h4 className="font-medium text-purple-900">Workflow Exercise</h4>
                      <p className="text-sm text-purple-700 mt-1">
                        {lesson.workflow_template_name || `Workflow ID: ${lesson.workflow_template_id}`}
                      </p>
                      <p className="text-sm text-gray-600 mt-2">
                        This lesson includes a workflow exercise. Use the AI Tutor to work through the workflow steps and complete the exercise.
                      </p>
                    </div>
                  </div>
                </div>
              )}
            </div>
            
            <div className="mt-6 p-4 bg-indigo-50 border border-indigo-200 rounded-lg">
              <p className="text-sm text-indigo-800">
                <strong>Tip:</strong> Click "Ask AI Tutor" above to interact with the linked resources and get help with this lesson.
              </p>
            </div>
          </div>
        ) : (
          <div className="text-center py-12 text-gray-600">
            <p>No content available for this lesson yet.</p>
            {lesson.description && (
              <div className="mt-4 prose max-w-none text-left">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>
                  {lesson.description}
                </ReactMarkdown>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Navigation */}
      <div className="flex items-center justify-between bg-white rounded-lg border border-gray-200 p-4">
        <button
          onClick={() => previousLesson && onNextLesson && onNextLesson({ ...previousLesson, module, course })}
          disabled={!previousLesson}
          className="flex items-center gap-2 px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <ChevronLeft className="w-4 h-4" />
          Previous Lesson
        </button>

        <div className="text-sm text-gray-600">
          Lesson {lesson.lesson_order} of {module?.lessons?.length || 0}
        </div>

        <button
          onClick={() => nextLesson && onNextLesson && onNextLesson({ ...nextLesson, module, course })}
          disabled={!nextLesson}
          className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Next Lesson
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}

