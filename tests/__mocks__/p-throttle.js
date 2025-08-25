// Mock for p-throttle to avoid ES module issues in tests
module.exports = function pThrottle(options) {
  // Return a function that just executes the function immediately
  // This removes throttling in tests for faster execution
  return function throttled(fn) {
    return fn();
  };
};

// Also export as default for ES module compatibility
module.exports.default = module.exports;