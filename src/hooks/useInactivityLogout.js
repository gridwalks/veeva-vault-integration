import { useEffect, useRef, useCallback } from 'react';

/**
 * Custom hook that tracks user activity and automatically logs out after a specified period of inactivity
 * @param {Function} logoutFunction - Function to call when logout is triggered
 * @param {number} timeoutMs - Timeout in milliseconds (default: 15 minutes)
 */
export const useInactivityLogout = (logoutFunction, timeoutMs = 15 * 60 * 1000) => {
  const timeoutRef = useRef(null);
  const lastActivityRef = useRef(Date.now());

  // Throttle function to prevent excessive timer resets
  const throttle = useCallback((func, delay) => {
    let timeoutId;
    let lastExecTime = 0;
    return function (...args) {
      const currentTime = Date.now();
      
      if (currentTime - lastExecTime > delay) {
        func.apply(this, args);
        lastExecTime = currentTime;
      } else {
        clearTimeout(timeoutId);
        timeoutId = setTimeout(() => {
          func.apply(this, args);
          lastExecTime = Date.now();
        }, delay - (currentTime - lastExecTime));
      }
    };
  }, []);

  // Reset the inactivity timer
  const resetTimer = useCallback(() => {
    lastActivityRef.current = Date.now();
    
    // Clear existing timeout
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }

    // Set new timeout
    timeoutRef.current = setTimeout(() => {
      const timeSinceLastActivity = Date.now() - lastActivityRef.current;
      
      // Only logout if we've actually been inactive for the full timeout period
      if (timeSinceLastActivity >= timeoutMs) {
        console.log('User inactive for 15 minutes, logging out...');
        logoutFunction();
      }
    }, timeoutMs);
  }, [logoutFunction, timeoutMs]);

  // Throttled reset function to avoid excessive timer resets
  const throttledResetTimer = useCallback(
    throttle(resetTimer, 1000), // Throttle to max once per second
    [resetTimer, throttle]
  );

  useEffect(() => {
    // Activity events to monitor
    const activityEvents = [
      'mousemove',
      'mousedown',
      'keydown',
      'keyup',
      'click',
      'scroll',
      'touchstart',
      'touchmove'
    ];

    // Add event listeners
    activityEvents.forEach(event => {
      document.addEventListener(event, throttledResetTimer, true);
    });

    // Initialize timer
    resetTimer();

    // Cleanup function
    return () => {
      // Remove event listeners
      activityEvents.forEach(event => {
        document.removeEventListener(event, throttledResetTimer, true);
      });

      // Clear timeout
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, [throttledResetTimer, resetTimer]);

  // Return the reset function in case manual reset is needed
  return { resetTimer };
};
