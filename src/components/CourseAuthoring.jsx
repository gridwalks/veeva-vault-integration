import { useState, useEffect } from 'react';
import { useAuth0 } from '@auth0/auth0-react';
import { Plus, Trash2, Edit2, Eye, Save, X, GripVertical, FileText, Video, Link as LinkIcon, CheckSquare } from 'lucide-react';
import { listCourses, getCourse, createCourse, updateCourse, updateLesson, listLearningPaths, createModule, updateModule, deleteModule, createLesson, deleteLesson } from '../api';
import { getIndexedCfrRegulations } from '../api';
import { getIndexedDocuments } from '../api';

export default function CourseAuthoring() {
  const { getAccessTokenSilently } = useAuth0();
  const [courses, setCourses] = useState([]);
  const [selectedCourse, setSelectedCourse] = useState(null);
  const [selectedModule, setSelectedModule] = useState(null);
  const [selectedLesson, setSelectedLesson] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [previewMode, setPreviewMode] = useState(false);
  const [showLinkModal, setShowLinkModal] = useState(false);
  const [linkType, setLinkType] = useState(null); // 'cfr', 'document', 'workflow'
  const [availableResources, setAvailableResources] = useState([]);
  const [isCreatingModule, setIsCreatingModule] = useState(false);
  const [isCreatingLesson, setIsCreatingLesson] = useState(false);
  const [editingModule, setEditingModule] = useState(null);
  const [editingLesson, setEditingLesson] = useState(null);
  
  // Course form state
  const [courseForm, setCourseForm] = useState({
    title: '',
    description: '',
    category: '',
    difficulty: 'beginner',
    estimated_hours: null,
    is_published: false
  });
  
  // Module form state
  const [moduleForm, setModuleForm] = useState({
    title: '',
    description: '',
    module_order: 1
  });
  
  // Lesson form state
  const [lessonForm, setLessonForm] = useState({
    title: '',
    description: '',
    content_type: 'text',
    estimated_minutes: null,
    cfr_regulation_id: null,
    document_id: null,
    workflow_template_id: null
  });

  useEffect(() => {
    loadCourses();
  }, []);

  async function loadCourses() {
    try {
      setLoading(true);
      setError(null);
      const accessToken = await getAccessTokenSilently();
      const data = await listCourses({}, accessToken);
      setCourses(data.courses || []);
    } catch (err) {
      console.error('Error loading courses:', err);
      setError(err.message || 'Failed to load courses');
    } finally {
      setLoading(false);
    }
  }

  async function loadCourseDetails(courseId) {
    try {
      setLoading(true);
      setError(null);
      const accessToken = await getAccessTokenSilently();
      const data = await getCourse(courseId, accessToken);
      setSelectedCourse(data.course);
    } catch (err) {
      console.error('Error loading course details:', err);
      setError(err.message || 'Failed to load course details');
    } finally {
      setLoading(false);
    }
  }

  async function handleSaveCourse() {
    try {
      setLoading(true);
      setError(null);
      const accessToken = await getAccessTokenSilently();
      
      if (selectedCourse?.id) {
        await updateCourse(selectedCourse.id, courseForm, accessToken);
      } else {
        const result = await createCourse(courseForm, accessToken);
        setSelectedCourse(result.course);
      }
      
      await loadCourses();
      if (selectedCourse?.id) {
        await loadCourseDetails(selectedCourse.id);
      }
      alert('Course saved successfully!');
    } catch (err) {
      console.error('Error saving course:', err);
      setError(err.message || 'Failed to save course');
    } finally {
      setLoading(false);
    }
  }

  async function handleSaveModule() {
    try {
      if (!selectedCourse?.id) {
        setError('Please select or create a course first');
        return;
      }

      setLoading(true);
      setError(null);
      const accessToken = await getAccessTokenSilently();
      
      if (editingModule) {
        await updateModule(editingModule.id, moduleForm, accessToken);
      } else {
        await createModule(selectedCourse.id, moduleForm, accessToken);
      }
      
      await loadCourseDetails(selectedCourse.id);
      
      // Auto-select the newly created or updated module
      if (!editingModule) {
        // Find the newly created module (it will be the last one or match the form title)
        const updatedCourse = await getCourse(selectedCourse.id, accessToken);
        const newModule = updatedCourse.course.modules?.find(m => m.title === moduleForm.title);
        if (newModule) {
          setSelectedModule(newModule);
        }
      } else {
        // Re-select the updated module
        const updatedCourse = await getCourse(selectedCourse.id, accessToken);
        const updatedModule = updatedCourse.course.modules?.find(m => m.id === editingModule.id);
        if (updatedModule) {
          setSelectedModule(updatedModule);
        }
      }
      
      setIsCreatingModule(false);
      setEditingModule(null);
      setModuleForm({ title: '', description: '', module_order: 1 });
      alert('Module saved successfully!');
    } catch (err) {
      console.error('Error saving module:', err);
      setError(err.message || 'Failed to save module');
    } finally {
      setLoading(false);
    }
  }

  async function handleDeleteModule(moduleId) {
    if (!confirm('Are you sure you want to delete this module? All lessons in this module will also be deleted.')) {
      return;
    }

    try {
      setLoading(true);
      setError(null);
      const accessToken = await getAccessTokenSilently();
      
      await deleteModule(moduleId, accessToken);
      
      if (selectedModule?.id === moduleId) {
        setSelectedModule(null);
        setSelectedLesson(null);
      }
      
      await loadCourseDetails(selectedCourse.id);
      alert('Module deleted successfully!');
    } catch (err) {
      console.error('Error deleting module:', err);
      setError(err.message || 'Failed to delete module');
    } finally {
      setLoading(false);
    }
  }

  async function handleSaveLesson() {
    try {
      if (!selectedModule?.id) {
        setError('Please select or create a module first');
        return;
      }

      setLoading(true);
      setError(null);
      const accessToken = await getAccessTokenSilently();
      
      if (editingLesson) {
        await updateLesson(editingLesson.id, lessonForm, accessToken);
      } else {
        await createLesson(selectedModule.id, lessonForm, accessToken);
      }
      
      await loadCourseDetails(selectedCourse.id);
      
      // Auto-select the newly created or updated lesson
      const updatedCourse = await getCourse(selectedCourse.id, accessToken);
      const updatedModule = updatedCourse.course.modules?.find(m => m.id === selectedModule.id);
      if (updatedModule) {
        setSelectedModule(updatedModule);
        if (!editingLesson) {
          // Find the newly created lesson
          const newLesson = updatedModule.lessons?.find(l => l.title === lessonForm.title);
          if (newLesson) {
            setSelectedLesson(newLesson);
          }
        } else {
          // Re-select the updated lesson
          const updatedLesson = updatedModule.lessons?.find(l => l.id === editingLesson.id);
          if (updatedLesson) {
            setSelectedLesson(updatedLesson);
          }
        }
      }
      
      setIsCreatingLesson(false);
      setEditingLesson(null);
      setLessonForm({
        title: '',
        description: '',
        content_type: 'text',
        estimated_minutes: null,
        cfr_regulation_id: null,
        document_id: null,
        workflow_template_id: null
      });
      alert('Lesson saved successfully!');
    } catch (err) {
      console.error('Error saving lesson:', err);
      setError(err.message || 'Failed to save lesson');
    } finally {
      setLoading(false);
    }
  }

  async function handleDeleteLesson(lessonId) {
    if (!confirm('Are you sure you want to delete this lesson?')) {
      return;
    }

    try {
      setLoading(true);
      setError(null);
      const accessToken = await getAccessTokenSilently();
      
      await deleteLesson(lessonId, accessToken);
      
      if (selectedLesson?.id === lessonId) {
        setSelectedLesson(null);
      }
      
      await loadCourseDetails(selectedCourse.id);
      alert('Lesson deleted successfully!');
    } catch (err) {
      console.error('Error deleting lesson:', err);
      setError(err.message || 'Failed to delete lesson');
    } finally {
      setLoading(false);
    }
  }

  async function handleLinkResource(type) {
    setLinkType(type);
    setShowLinkModal(true);
    
    try {
      const accessToken = await getAccessTokenSilently();
      
      if (type === 'cfr') {
        const data = await getIndexedCfrRegulations();
        setAvailableResources(data.regulations || []);
      } else if (type === 'document') {
        const data = await getIndexedDocuments({ limit: 100 });
        setAvailableResources(data.items || []);
      } else if (type === 'workflow') {
        // TODO: Add workflow list API
        setAvailableResources([]);
      }
    } catch (err) {
      console.error('Error loading resources:', err);
      setError(err.message || 'Failed to load resources');
    }
  }

  async function handleSaveLessonLink(resourceId) {
    try {
      if (!selectedLesson?.id) {
        setError('Please select a lesson first');
        setShowLinkModal(false);
        return;
      }

      if (!resourceId) {
        setError('Invalid resource ID');
        setShowLinkModal(false);
        return;
      }

      setLoading(true);
      setError(null);
      const accessToken = await getAccessTokenSilently();
      
      const updateData = {};
      if (linkType === 'cfr') {
        updateData.cfr_regulation_id = parseInt(resourceId);
      } else if (linkType === 'document') {
        updateData.document_id = parseInt(resourceId);
      } else if (linkType === 'workflow') {
        updateData.workflow_template_id = parseInt(resourceId);
      }
      
      console.log('Linking resource:', { linkType, resourceId, updateData, lessonId: selectedLesson.id });
      
      await updateLesson(selectedLesson.id, updateData, accessToken);
      
      // Reload course details to get updated lesson data
      await loadCourseDetails(selectedCourse.id);
      
      // Update selectedLesson with the refreshed data
      const updatedCourse = await getCourse(selectedCourse.id, accessToken);
      const updatedModule = updatedCourse.course.modules?.find(m => m.id === selectedModule.id);
      if (updatedModule) {
        setSelectedModule(updatedModule);
        const updatedLesson = updatedModule.lessons?.find(l => l.id === selectedLesson.id);
        if (updatedLesson) {
          setSelectedLesson(updatedLesson);
          setLessonForm({
            title: updatedLesson.title,
            description: updatedLesson.description || '',
            content_type: updatedLesson.content_type || 'text',
            estimated_minutes: updatedLesson.estimated_minutes,
            cfr_regulation_id: updatedLesson.cfr_regulation_id,
            document_id: updatedLesson.document_id,
            workflow_template_id: updatedLesson.workflow_template_id
          });
        }
      }
      
      setShowLinkModal(false);
      alert('Resource linked successfully!');
    } catch (err) {
      console.error('Error linking resource:', err);
      setError(err.message || 'Failed to link resource');
      setShowLinkModal(false);
    } finally {
      setLoading(false);
    }
  }

  if (loading && !selectedCourse) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-gray-500">Loading courses...</div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Course Authoring</h1>
          <p className="text-gray-600 mt-1">Create and manage courses, modules, and lessons</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setPreviewMode(!previewMode)}
            className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 flex items-center gap-2"
          >
            <Eye className="w-4 h-4" />
            {previewMode ? 'Edit Mode' : 'Preview Mode'}
          </button>
        </div>
      </div>

      {error && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
          <p className="text-red-800">Error: {error}</p>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Sidebar - Course List */}
        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-lg font-semibold text-gray-900">Courses</h2>
            <button
              onClick={() => {
                setSelectedCourse(null);
                setSelectedModule(null);
                setSelectedLesson(null);
                setCourseForm({
                  title: '',
                  description: '',
                  category: '',
                  difficulty: 'beginner',
                  estimated_hours: null,
                  is_published: false
                });
              }}
              className="p-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700"
            >
              <Plus className="w-4 h-4" />
            </button>
          </div>
          
          <div className="space-y-2 max-h-96 overflow-y-auto">
            {courses.map(course => (
              <button
                key={course.id}
                onClick={() => {
                  loadCourseDetails(course.id);
                  setCourseForm({
                    title: course.title,
                    description: course.description || '',
                    category: course.category || '',
                    difficulty: course.difficulty || 'beginner',
                    estimated_hours: course.estimated_hours,
                    is_published: course.is_published
                  });
                }}
                className={`w-full text-left p-3 rounded-lg border ${
                  selectedCourse?.id === course.id
                    ? 'border-indigo-500 bg-indigo-50'
                    : 'border-gray-200 hover:border-gray-300'
                }`}
              >
                <div className="font-medium text-gray-900">{course.title}</div>
                <div className="text-sm text-gray-500 mt-1">
                  {course.module_count || 0} modules, {course.lesson_count || 0} lessons
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Middle - Course/Module Editor */}
        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <div className="space-y-4">
            <div>
              <h2 className="text-lg font-semibold text-gray-900 mb-4">
                {selectedCourse ? 'Course Details' : 'Create New Course'}
              </h2>
              
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Title *</label>
                  <input
                    type="text"
                    value={courseForm.title}
                    onChange={(e) => setCourseForm({ ...courseForm, title: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                    disabled={previewMode}
                    placeholder="Enter course title"
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
                  <textarea
                    value={courseForm.description}
                    onChange={(e) => setCourseForm({ ...courseForm, description: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                    rows={3}
                    disabled={previewMode}
                    placeholder="Enter course description"
                  />
                </div>
                
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Category</label>
                    <input
                      type="text"
                      value={courseForm.category}
                      onChange={(e) => setCourseForm({ ...courseForm, category: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                      disabled={previewMode}
                      placeholder="e.g., Quality, Regulatory"
                    />
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Difficulty</label>
                    <select
                      value={courseForm.difficulty}
                      onChange={(e) => setCourseForm({ ...courseForm, difficulty: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                      disabled={previewMode}
                    >
                      <option value="beginner">Beginner</option>
                      <option value="intermediate">Intermediate</option>
                      <option value="advanced">Advanced</option>
                    </select>
                  </div>
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Estimated Hours</label>
                  <input
                    type="number"
                    value={courseForm.estimated_hours || ''}
                    onChange={(e) => setCourseForm({ ...courseForm, estimated_hours: e.target.value ? parseFloat(e.target.value) : null })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                    disabled={previewMode}
                    placeholder="e.g., 8"
                    min="0"
                    step="0.5"
                  />
                </div>
                
                <div>
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={courseForm.is_published}
                      onChange={(e) => setCourseForm({ ...courseForm, is_published: e.target.checked })}
                      disabled={previewMode}
                      className="w-4 h-4"
                    />
                    <span className="text-sm font-medium text-gray-700">Published (visible to students)</span>
                  </label>
                </div>
                
                {!previewMode && (
                  <button
                    onClick={handleSaveCourse}
                    disabled={!courseForm.title.trim()}
                    className="w-full px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:bg-gray-400 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                  >
                    <Save className="w-4 h-4" />
                    {selectedCourse ? 'Update Course' : 'Create Course'}
                  </button>
                )}
              </div>
            </div>

            {/* Modules */}
            {selectedCourse && (
              <div>
                <div className="flex justify-between items-center mb-2">
                  <h3 className="text-md font-semibold text-gray-900">Modules</h3>
                  {!previewMode && (
                    <button
                      onClick={() => {
                        setIsCreatingModule(true);
                        setEditingModule(null);
                        setModuleForm({ title: '', description: '', module_order: 1 });
                        setSelectedModule(null);
                        setSelectedLesson(null);
                      }}
                      className="p-1.5 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700"
                    >
                      <Plus className="w-4 h-4" />
                    </button>
                  )}
                </div>

                {isCreatingModule || editingModule ? (
                  <div className="p-4 bg-gray-50 rounded-lg space-y-3 mb-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Module Title *</label>
                      <input
                        type="text"
                        value={moduleForm.title}
                        onChange={(e) => setModuleForm({ ...moduleForm, title: e.target.value })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                        placeholder="Enter module title"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
                      <textarea
                        value={moduleForm.description}
                        onChange={(e) => setModuleForm({ ...moduleForm, description: e.target.value })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                        rows={2}
                        placeholder="Enter module description"
                      />
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={handleSaveModule}
                        disabled={!moduleForm.title.trim()}
                        className="flex-1 px-3 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:bg-gray-400 disabled:cursor-not-allowed flex items-center justify-center gap-2 text-sm"
                      >
                        <Save className="w-4 h-4" />
                        {editingModule ? 'Update' : 'Create'}
                      </button>
                      <button
                        onClick={() => {
                          setIsCreatingModule(false);
                          setEditingModule(null);
                          setModuleForm({ title: '', description: '', module_order: 1 });
                        }}
                        className="px-3 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 flex items-center gap-2 text-sm"
                      >
                        <X className="w-4 h-4" />
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : null}

                {selectedCourse.modules && selectedCourse.modules.length > 0 ? (
                  <div className="space-y-2">
                    {selectedCourse.modules.map(module => (
                      <div
                        key={module.id}
                        className={`p-3 border rounded-lg ${
                          selectedModule?.id === module.id
                            ? 'border-indigo-500 bg-indigo-50'
                            : 'border-gray-200 hover:border-indigo-300'
                        }`}
                      >
                        <div 
                          className="flex items-start justify-between cursor-pointer"
                          onClick={() => {
                            setSelectedModule(module);
                            setSelectedLesson(null);
                            setEditingModule(null);
                            setIsCreatingModule(false);
                          }}
                        >
                          <div className="flex-1">
                            <div className="font-medium text-gray-900">{module.title}</div>
                            <div className="text-sm text-gray-500">
                              {module.lessons?.length || 0} lessons
                            </div>
                          </div>
                          {!previewMode && (
                            <div className="flex gap-1 ml-2" onClick={(e) => e.stopPropagation()}>
                              <button
                                onClick={() => {
                                  setEditingModule(module);
                                  setIsCreatingModule(false);
                                  setModuleForm({
                                    title: module.title,
                                    description: module.description || '',
                                    module_order: module.module_order
                                  });
                                }}
                                className="p-1 text-gray-600 hover:text-indigo-600"
                              >
                                <Edit2 className="w-4 h-4" />
                              </button>
                              <button
                                onClick={() => handleDeleteModule(module.id)}
                                className="p-1 text-gray-600 hover:text-red-600"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  !isCreatingModule && (
                    <div className="text-center text-gray-500 py-4 text-sm">
                      No modules yet. Click the + button to add one.
                    </div>
                  )
                )}
              </div>
            )}
          </div>
        </div>

        {/* Right - Lesson Editor */}
        <div className="bg-white rounded-lg border border-gray-200 p-4">
          {selectedModule ? (
            <div className="space-y-4">
              <div className="flex justify-between items-center">
                <h2 className="text-lg font-semibold text-gray-900">Lessons</h2>
                {!previewMode && (
                  <button
                    onClick={() => {
                      setIsCreatingLesson(true);
                      setEditingLesson(null);
                      setLessonForm({
                        title: '',
                        description: '',
                        content_type: 'text',
                        estimated_minutes: null,
                        cfr_regulation_id: null,
                        document_id: null,
                        workflow_template_id: null
                      });
                      setSelectedLesson(null);
                    }}
                    className="p-1.5 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700"
                  >
                    <Plus className="w-4 h-4" />
                  </button>
                )}
              </div>
              
              {isCreatingLesson || editingLesson ? (
                <div className="p-4 bg-gray-50 rounded-lg space-y-3">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Lesson Title *</label>
                    <input
                      type="text"
                      value={lessonForm.title}
                      onChange={(e) => setLessonForm({ ...lessonForm, title: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                      placeholder="Enter lesson title"
                    />
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
                    <textarea
                      value={lessonForm.description}
                      onChange={(e) => setLessonForm({ ...lessonForm, description: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                      rows={2}
                      placeholder="Enter lesson description"
                    />
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Content Type</label>
                    <select
                      value={lessonForm.content_type}
                      onChange={(e) => setLessonForm({ ...lessonForm, content_type: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                    >
                      <option value="text">Text</option>
                      <option value="video">Video</option>
                      <option value="interactive">Interactive</option>
                      <option value="document">Document</option>
                    </select>
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Estimated Minutes</label>
                    <input
                      type="number"
                      value={lessonForm.estimated_minutes || ''}
                      onChange={(e) => setLessonForm({ ...lessonForm, estimated_minutes: e.target.value ? parseInt(e.target.value) : null })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                      placeholder="e.g., 30"
                      min="0"
                    />
                  </div>
                  
                  <div className="flex gap-2">
                    <button
                      onClick={handleSaveLesson}
                      disabled={!lessonForm.title.trim()}
                      className="flex-1 px-3 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:bg-gray-400 disabled:cursor-not-allowed flex items-center justify-center gap-2 text-sm"
                    >
                      <Save className="w-4 h-4" />
                      {editingLesson ? 'Update' : 'Create'}
                    </button>
                    <button
                      onClick={() => {
                        setIsCreatingLesson(false);
                        setEditingLesson(null);
                        setLessonForm({
                          title: '',
                          description: '',
                          content_type: 'text',
                          estimated_minutes: null,
                          cfr_regulation_id: null,
                          document_id: null,
                          workflow_template_id: null
                        });
                      }}
                      className="px-3 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 flex items-center gap-2 text-sm"
                    >
                      <X className="w-4 h-4" />
                      Cancel
                    </button>
                  </div>
                </div>
              ) : null}

              {selectedModule.lessons && selectedModule.lessons.length > 0 ? (
                <div className="space-y-2">
                  {selectedModule.lessons.map(lesson => (
                    <div
                      key={lesson.id}
                      className={`p-3 border rounded-lg ${
                        selectedLesson?.id === lesson.id
                          ? 'border-indigo-500 bg-indigo-50'
                          : 'border-gray-200 hover:border-indigo-300'
                      }`}
                    >
                      <div 
                        className="flex items-start justify-between cursor-pointer"
                        onClick={() => {
                          setSelectedLesson(lesson);
                          setLessonForm({
                            title: lesson.title,
                            description: lesson.description || '',
                            content_type: lesson.content_type || 'text',
                            estimated_minutes: lesson.estimated_minutes,
                            cfr_regulation_id: lesson.cfr_regulation_id,
                            document_id: lesson.document_id,
                            workflow_template_id: lesson.workflow_template_id
                          });
                          setEditingLesson(null);
                          setIsCreatingLesson(false);
                        }}
                      >
                        <div className="flex-1">
                          <div className="font-medium text-gray-900">{lesson.title}</div>
                          <div className="text-sm text-gray-500 flex items-center gap-2 mt-1">
                            {lesson.cfr_regulation_id && <FileText className="w-3 h-3" />}
                            {lesson.document_id && <LinkIcon className="w-3 h-3" />}
                            {lesson.workflow_template_id && <CheckSquare className="w-3 h-3" />}
                            {lesson.estimated_minutes && (
                              <span>{lesson.estimated_minutes} min</span>
                            )}
                          </div>
                        </div>
                        {!previewMode && (
                          <div className="flex gap-1 ml-2" onClick={(e) => e.stopPropagation()}>
                            <button
                              onClick={() => {
                                setEditingLesson(lesson);
                                setIsCreatingLesson(false);
                                setLessonForm({
                                  title: lesson.title,
                                  description: lesson.description || '',
                                  content_type: lesson.content_type || 'text',
                                  estimated_minutes: lesson.estimated_minutes,
                                  cfr_regulation_id: lesson.cfr_regulation_id,
                                  document_id: lesson.document_id,
                                  workflow_template_id: lesson.workflow_template_id
                                });
                              }}
                              className="p-1 text-gray-600 hover:text-indigo-600"
                            >
                              <Edit2 className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => handleDeleteLesson(lesson.id)}
                              className="p-1 text-gray-600 hover:text-red-600"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                !isCreatingLesson && (
                  <div className="text-center text-gray-500 py-4 text-sm">
                    No lessons yet. Click the + button to add one.
                  </div>
                )
              )}
              
              {selectedLesson && !isCreatingLesson && !editingLesson && (
                <div className="mt-4 p-4 bg-gray-50 rounded-lg space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Lesson Title</label>
                    <input
                      type="text"
                      value={lessonForm.title}
                      onChange={(e) => setLessonForm({ ...lessonForm, title: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                      disabled={previewMode}
                    />
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
                    <textarea
                      value={lessonForm.description}
                      onChange={(e) => setLessonForm({ ...lessonForm, description: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                      rows={2}
                      disabled={previewMode}
                    />
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Content Type</label>
                    <select
                      value={lessonForm.content_type}
                      onChange={(e) => setLessonForm({ ...lessonForm, content_type: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                      disabled={previewMode}
                    >
                      <option value="text">Text</option>
                      <option value="video">Video</option>
                      <option value="interactive">Interactive</option>
                      <option value="document">Document</option>
                    </select>
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Estimated Minutes</label>
                    <input
                      type="number"
                      value={lessonForm.estimated_minutes || ''}
                      onChange={(e) => setLessonForm({ ...lessonForm, estimated_minutes: e.target.value ? parseInt(e.target.value) : null })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                      disabled={previewMode}
                      min="0"
                    />
                  </div>
                  
                  {!previewMode && (
                    <button
                      onClick={async () => {
                        try {
                          setLoading(true);
                          setError(null);
                          const accessToken = await getAccessTokenSilently();
                          await updateLesson(selectedLesson.id, lessonForm, accessToken);
                          await loadCourseDetails(selectedCourse.id);
                          alert('Lesson updated successfully!');
                        } catch (err) {
                          console.error('Error updating lesson:', err);
                          setError(err.message || 'Failed to update lesson');
                        } finally {
                          setLoading(false);
                        }
                      }}
                      className="w-full px-3 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 flex items-center justify-center gap-2 text-sm"
                    >
                      <Save className="w-4 h-4" />
                      Update Lesson
                    </button>
                  )}
                  
                  <div className="space-y-2">
                    <button
                      onClick={() => handleLinkResource('cfr')}
                      className="w-full px-3 py-2 bg-blue-50 text-blue-700 rounded-lg hover:bg-blue-100 flex items-center gap-2 text-sm"
                      disabled={previewMode}
                    >
                      <FileText className="w-4 h-4" />
                      Link CFR Regulation
                    </button>
                    <button
                      onClick={() => handleLinkResource('document')}
                      className="w-full px-3 py-2 bg-green-50 text-green-700 rounded-lg hover:bg-green-100 flex items-center gap-2 text-sm"
                      disabled={previewMode}
                    >
                      <LinkIcon className="w-4 h-4" />
                      Link Document
                    </button>
                    <button
                      onClick={() => handleLinkResource('workflow')}
                      className="w-full px-3 py-2 bg-purple-50 text-purple-700 rounded-lg hover:bg-purple-100 flex items-center gap-2 text-sm"
                      disabled={previewMode}
                    >
                      <CheckSquare className="w-4 h-4" />
                      Link Workflow Exercise
                    </button>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="text-center text-gray-500 py-12">
              Select a module to view lessons
            </div>
          )}
        </div>
      </div>

      {/* Link Resource Modal */}
      {showLinkModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-2xl w-full max-h-96 overflow-y-auto">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-semibold text-gray-900">
                Link {linkType === 'cfr' ? 'CFR Regulation' : linkType === 'document' ? 'Document' : 'Workflow'}
              </h3>
              <button
                onClick={() => setShowLinkModal(false)}
                className="text-gray-400 hover:text-gray-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <div className="space-y-2">
              {availableResources.length === 0 ? (
                <div className="text-center text-gray-500 py-4 text-sm">
                  No resources available
                </div>
              ) : (
                availableResources.map(resource => {
                  // For CFR regulations, use the database id (primary key)
                  // For documents, use the id field
                  const resourceId = linkType === 'cfr' 
                    ? (resource.id || resource.regulationId) 
                    : (resource.id || resource.document_id);
                  
                  return (
                    <button
                      key={resource.id || resource.regulationId || resource.document_id}
                      onClick={() => {
                        if (resourceId) {
                          handleSaveLessonLink(resourceId);
                        } else {
                          setError('Invalid resource ID');
                          setShowLinkModal(false);
                        }
                      }}
                      className="w-full text-left p-3 border border-gray-200 rounded-lg hover:border-indigo-300 hover:bg-indigo-50"
                    >
                      <div className="font-medium text-gray-900">
                        {resource.title || resource.document_name || resource.name}
                      </div>
                      {(resource.regulation_id || resource.regulationId) && (
                        <div className="text-sm text-gray-500">
                          {resource.regulation_id || resource.regulationId}
                        </div>
                      )}
                    </button>
                  );
                })
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

