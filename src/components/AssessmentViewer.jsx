import { useState, useEffect } from 'react';
import { useAuth0 } from '@auth0/auth0-react';
import { Clock, CheckCircle, XCircle, RotateCcw } from 'lucide-react';
import { getAssessment, submitAssessment } from '../api';

export default function AssessmentViewer({ assessmentId, onComplete }) {
  const { user, getAccessTokenSilently } = useAuth0();
  const [assessment, setAssessment] = useState(null);
  const [answers, setAnswers] = useState({});
  const [timeRemaining, setTimeRemaining] = useState(null);
  const [submitted, setSubmitted] = useState(false);
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    loadAssessment();
  }, [assessmentId]);

  useEffect(() => {
    if (assessment?.time_limit_minutes && !submitted && timeRemaining !== null) {
      const timer = setInterval(() => {
        setTimeRemaining(prev => {
          if (prev <= 0) {
            clearInterval(timer);
            handleAutoSubmit();
            return 0;
          }
          return prev - 1;
        });
      }, 1000);

      return () => clearInterval(timer);
    }
  }, [assessment, submitted, timeRemaining]);

  async function loadAssessment() {
    if (!assessmentId) return;

    try {
      setLoading(true);
      setError(null);
      const accessToken = await getAccessTokenSilently();
      const data = await getAssessment(assessmentId, accessToken);
      setAssessment(data.assessment);
      
      // Initialize timer if time limit exists
      if (data.assessment.time_limit_minutes) {
        setTimeRemaining(data.assessment.time_limit_minutes * 60);
      }

      // Check if already submitted
      if (data.assessment.submissions && data.assessment.submissions.length > 0) {
        const lastSubmission = data.assessment.submissions[0];
        setSubmitted(true);
        setResult({
          score: lastSubmission.score,
          passed: lastSubmission.passed,
          feedback: lastSubmission.feedback_json
        });
      }
    } catch (err) {
      console.error('Error loading assessment:', err);
      setError(err.message || 'Failed to load assessment');
    } finally {
      setLoading(false);
    }
  }

  function handleAnswerChange(questionIndex, answer) {
    setAnswers(prev => ({
      ...prev,
      [questionIndex]: answer
    }));
  }

  async function handleSubmit() {
    if (!assessment || !user?.sub) return;

    try {
      setSubmitting(true);
      setError(null);

      // Convert answers to array format
      const questions = Array.isArray(assessment.questions_json)
        ? assessment.questions_json
        : JSON.parse(assessment.questions_json || '[]');
      
      const answersArray = questions.map((_, index) => answers[index] || null);

      const accessToken = await getAccessTokenSilently();
      const startTime = Date.now();
      const data = await submitAssessment({
        assessment_id: assessmentId,
        answers_json: answersArray,
        time_taken_minutes: assessment.time_limit_minutes 
          ? (assessment.time_limit_minutes * 60 - timeRemaining) / 60 
          : null
      }, accessToken);

      setResult(data);
      setSubmitted(true);

      if (data.passed && onComplete) {
        onComplete(data);
      }
    } catch (err) {
      console.error('Error submitting assessment:', err);
      setError(err.message || 'Failed to submit assessment');
    } finally {
      setSubmitting(false);
    }
  }

  function handleAutoSubmit() {
    if (!submitted) {
      handleSubmit();
    }
  }

  function formatTime(seconds) {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-gray-500">Loading assessment...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
        <p className="text-red-800">Error: {error}</p>
        <button
          onClick={loadAssessment}
          className="mt-2 px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700"
        >
          Retry
        </button>
      </div>
    );
  }

  if (!assessment) {
    return (
      <div className="p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
        <p className="text-yellow-800">Assessment not found</p>
      </div>
    );
  }

  const questions = Array.isArray(assessment.questions_json)
    ? assessment.questions_json
    : JSON.parse(assessment.questions_json || '[]');

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <h1 className="text-2xl font-bold text-gray-900">{assessment.title}</h1>
        {assessment.description && (
          <p className="text-gray-600 mt-2">{assessment.description}</p>
        )}
        <div className="flex items-center gap-4 mt-4 text-sm text-gray-600">
          {assessment.time_limit_minutes && (
            <div className="flex items-center gap-2">
              <Clock className="w-4 h-4" />
              {submitted ? (
                <span>Time limit: {assessment.time_limit_minutes} minutes</span>
              ) : (
                <span className="font-semibold text-red-600">
                  Time remaining: {formatTime(timeRemaining)}
                </span>
              )}
            </div>
          )}
          <span>Passing score: {assessment.passing_score}%</span>
          {assessment.max_attempts > 1 && (
            <span>
              Attempts: {assessment.submissions?.length || 0} / {assessment.max_attempts}
            </span>
          )}
        </div>
      </div>

      {/* Results (if submitted) */}
      {submitted && result && (
        <div className={`rounded-lg border p-6 ${
          result.passed
            ? 'bg-green-50 border-green-200'
            : 'bg-red-50 border-red-200'
        }`}>
          <div className="flex items-center gap-3 mb-4">
            {result.passed ? (
              <CheckCircle className="w-8 h-8 text-green-600" />
            ) : (
              <XCircle className="w-8 h-8 text-red-600" />
            )}
            <div>
              <h2 className="text-xl font-semibold">
                {result.passed ? 'Congratulations! You passed!' : 'Assessment not passed'}
              </h2>
              <p className="text-sm text-gray-600 mt-1">
                Your score: {result.score}% (Required: {assessment.passing_score}%)
              </p>
            </div>
          </div>

          {result.feedback && assessment.show_correct_answers && (
            <div className="mt-4 space-y-4">
              <h3 className="font-semibold">Review Your Answers:</h3>
              {result.feedback.map((item, index) => (
                <div
                  key={index}
                  className={`p-4 rounded-lg border ${
                    item.is_correct
                      ? 'bg-green-50 border-green-200'
                      : 'bg-red-50 border-red-200'
                  }`}
                >
                  <p className="font-medium mb-2">{item.question}</p>
                  <div className="text-sm space-y-1">
                    <p>
                      <span className="font-medium">Your answer:</span> {JSON.stringify(item.user_answer)}
                    </p>
                    {!item.is_correct && (
                      <p>
                        <span className="font-medium">Correct answer:</span> {JSON.stringify(item.correct_answer)}
                      </p>
                    )}
                    {item.explanation && (
                      <p className="mt-2 text-gray-700">{item.explanation}</p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}

          {result.can_retake && (
            <button
              onClick={() => {
                setSubmitted(false);
                setResult(null);
                setAnswers({});
                if (assessment.time_limit_minutes) {
                  setTimeRemaining(assessment.time_limit_minutes * 60);
                }
              }}
              className="mt-4 flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700"
            >
              <RotateCcw className="w-4 h-4" />
              Retake Assessment
            </button>
          )}
        </div>
      )}

      {/* Questions (if not submitted or showing review) */}
      {(!submitted || (submitted && assessment.show_correct_answers && !result.feedback)) && (
        <div className="space-y-6">
          {questions.map((question, index) => (
            <QuestionItem
              key={index}
              question={question}
              questionIndex={index}
              answer={answers[index]}
              onChange={(answer) => handleAnswerChange(index, answer)}
              showCorrectAnswer={submitted && assessment.show_correct_answers && result?.feedback?.[index]}
            />
          ))}

          {!submitted && (
            <div className="flex justify-end">
              <button
                onClick={handleSubmit}
                disabled={submitting || Object.keys(answers).length === 0}
                className="px-6 py-3 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {submitting ? 'Submitting...' : 'Submit Assessment'}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function QuestionItem({ question, questionIndex, answer, onChange, showCorrectAnswer }) {
  const isCorrect = showCorrectAnswer?.is_correct;

  return (
    <div className={`bg-white rounded-lg border p-6 ${
      showCorrectAnswer
        ? isCorrect
          ? 'border-green-200 bg-green-50'
          : 'border-red-200 bg-red-50'
        : 'border-gray-200'
    }`}>
      <div className="flex items-start justify-between mb-4">
        <h3 className="text-lg font-semibold text-gray-900">
          Question {questionIndex + 1}
        </h3>
        {showCorrectAnswer && (
          <div className={`px-3 py-1 rounded text-sm font-medium ${
            isCorrect
              ? 'bg-green-100 text-green-700'
              : 'bg-red-100 text-red-700'
          }`}>
            {isCorrect ? 'Correct' : 'Incorrect'}
          </div>
        )}
      </div>

      <p className="text-gray-900 mb-4">{question.question}</p>

      {question.type === 'multiple_choice' || question.type === 'single_choice' ? (
        <div className="space-y-2">
          {question.options?.map((option, optIndex) => (
            <label
              key={optIndex}
              className={`flex items-center gap-3 p-3 border rounded-lg cursor-pointer transition-all ${
                answer === option
                  ? 'border-indigo-500 bg-indigo-50'
                  : 'border-gray-200 hover:border-gray-300'
              }`}
            >
              <input
                type="radio"
                name={`question-${questionIndex}`}
                value={option}
                checked={answer === option}
                onChange={(e) => onChange(e.target.value)}
                disabled={showCorrectAnswer}
                className="w-4 h-4 text-indigo-600"
              />
              <span>{option}</span>
            </label>
          ))}
        </div>
      ) : question.type === 'true_false' ? (
        <div className="space-y-2">
          {[true, false].map((value) => (
            <label
              key={value}
              className={`flex items-center gap-3 p-3 border rounded-lg cursor-pointer transition-all ${
                answer === value
                  ? 'border-indigo-500 bg-indigo-50'
                  : 'border-gray-200 hover:border-gray-300'
              }`}
            >
              <input
                type="radio"
                name={`question-${questionIndex}`}
                value={value}
                checked={answer === value}
                onChange={(e) => onChange(e.target.value === 'true')}
                disabled={showCorrectAnswer}
                className="w-4 h-4 text-indigo-600"
              />
              <span>{value ? 'True' : 'False'}</span>
            </label>
          ))}
        </div>
      ) : question.type === 'multiple_select' ? (
        <div className="space-y-2">
          {question.options?.map((option, optIndex) => {
            const selected = Array.isArray(answer) && answer.includes(option);
            return (
              <label
                key={optIndex}
                className={`flex items-center gap-3 p-3 border rounded-lg cursor-pointer transition-all ${
                  selected
                    ? 'border-indigo-500 bg-indigo-50'
                    : 'border-gray-200 hover:border-gray-300'
                }`}
              >
                <input
                  type="checkbox"
                  checked={selected}
                  onChange={(e) => {
                    const currentAnswers = Array.isArray(answer) ? answer : [];
                    if (e.target.checked) {
                      onChange([...currentAnswers, option]);
                    } else {
                      onChange(currentAnswers.filter(a => a !== option));
                    }
                  }}
                  disabled={showCorrectAnswer}
                  className="w-4 h-4 text-indigo-600"
                />
                <span>{option}</span>
              </label>
            );
          })}
        </div>
      ) : (
        <textarea
          value={answer || ''}
          onChange={(e) => onChange(e.target.value)}
          disabled={showCorrectAnswer}
          className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
          rows={4}
          placeholder="Type your answer here..."
        />
      )}

      {showCorrectAnswer?.explanation && (
        <div className="mt-4 p-3 bg-blue-50 border border-blue-200 rounded-lg">
          <p className="text-sm text-blue-900">
            <span className="font-medium">Explanation:</span> {showCorrectAnswer.explanation}
          </p>
        </div>
      )}
    </div>
  );
}

