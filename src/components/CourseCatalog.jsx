import { useState, useEffect } from 'react';
import { useAuth0 } from '@auth0/auth0-react';
import { BookOpen, Clock, Users, Search, Filter } from 'lucide-react';
import { listCourses } from '../api';

export default function CourseCatalog({ onOpenCourse }) {
  const { getAccessTokenSilently } = useAuth0();
  const [courses, setCourses] = useState([]);
  const [filteredCourses, setFilteredCourses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [filters, setFilters] = useState({
    category: '',
    difficulty: '',
    is_published: true
  });

  useEffect(() => {
    loadCourses();
  }, []);

  useEffect(() => {
    filterCourses();
  }, [courses, searchQuery, filters]);

  async function loadCourses() {
    try {
      setLoading(true);
      setError(null);
      const accessToken = await getAccessTokenSilently();
      const data = await listCourses({ is_published: true }, accessToken);
      setCourses(data.courses || []);
    } catch (err) {
      console.error('Error loading courses:', err);
      setError(err.message || 'Failed to load courses');
    } finally {
      setLoading(false);
    }
  }

  function filterCourses() {
    let filtered = [...courses];

    // Search filter
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(course =>
        course.title?.toLowerCase().includes(query) ||
        course.description?.toLowerCase().includes(query) ||
        course.category?.toLowerCase().includes(query)
      );
    }

    // Category filter
    if (filters.category) {
      filtered = filtered.filter(course => course.category === filters.category);
    }

    // Difficulty filter
    if (filters.difficulty) {
      filtered = filtered.filter(course => course.difficulty === filters.difficulty);
    }

    setFilteredCourses(filtered);
  }

  const categories = [...new Set(courses.map(c => c.category).filter(Boolean))];
  const difficulties = ['beginner', 'intermediate', 'advanced'];

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-gray-500">Loading courses...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
        <p className="text-red-800">Error: {error}</p>
        <button
          onClick={loadCourses}
          className="mt-2 px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700"
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Search and Filters */}
      <div className="bg-white rounded-lg border border-gray-200 p-4">
        <div className="flex flex-col md:flex-row gap-4">
          {/* Search */}
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
            <input
              type="text"
              placeholder="Search courses..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
            />
          </div>

          {/* Category Filter */}
          <select
            value={filters.category}
            onChange={(e) => setFilters({ ...filters, category: e.target.value })}
            className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
          >
            <option value="">All Categories</option>
            {categories.map(cat => (
              <option key={cat} value={cat}>{cat}</option>
            ))}
          </select>

          {/* Difficulty Filter */}
          <select
            value={filters.difficulty}
            onChange={(e) => setFilters({ ...filters, difficulty: e.target.value })}
            className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
          >
            <option value="">All Levels</option>
            {difficulties.map(diff => (
              <option key={diff} value={diff}>{diff.charAt(0).toUpperCase() + diff.slice(1)}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Results Count */}
      <div className="text-sm text-gray-600">
        Showing {filteredCourses.length} of {courses.length} courses
      </div>

      {/* Course Grid */}
      {filteredCourses.length === 0 ? (
        <div className="text-center py-12 bg-white rounded-lg border border-gray-200">
          <BookOpen className="w-12 h-12 text-gray-400 mx-auto mb-4" />
          <p className="text-gray-600">No courses found matching your criteria.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredCourses.map(course => (
            <CourseCard
              key={course.id}
              course={course}
              onClick={() => onOpenCourse && onOpenCourse(course.id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function CourseCard({ course, onClick }) {
  return (
    <div
      onClick={onClick}
      className="bg-white border border-gray-200 rounded-lg p-6 hover:border-indigo-300 hover:shadow-lg cursor-pointer transition-all"
    >
      {course.thumbnail_url && (
        <img
          src={course.thumbnail_url}
          alt={course.title}
          className="w-full h-40 object-cover rounded-lg mb-4"
        />
      )}
      
      <div className="flex items-start justify-between mb-2">
        <h3 className="text-lg font-semibold text-gray-900 flex-1">{course.title}</h3>
        {course.category && (
          <span className="ml-2 px-2 py-1 text-xs font-medium bg-indigo-100 text-indigo-700 rounded">
            {course.category}
          </span>
        )}
      </div>

      <p className="text-sm text-gray-600 mb-4 line-clamp-2">{course.description}</p>

      <div className="flex items-center gap-4 text-xs text-gray-500">
        <div className="flex items-center gap-1">
          <Clock className="w-4 h-4" />
          {course.estimated_hours ? `${course.estimated_hours} hours` : 'N/A'}
        </div>
        <div className="flex items-center gap-1">
          <BookOpen className="w-4 h-4" />
          {course.module_count || 0} modules
        </div>
        {course.difficulty && (
          <span className="capitalize px-2 py-1 bg-gray-100 rounded">
            {course.difficulty}
          </span>
        )}
      </div>
    </div>
  );
}

