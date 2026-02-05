# Test Environment Isolation & Dockerized Testing

**Problem:**
Debugging visual test failures was difficult without access to the live browser UI or artifacts. The reproduction script failed due to environment restrictions on launching browsers.

**Suggestion:**
Running tests in a consistent Docker container with Xvfb properly configured would help reproduce environment-specific failures locally.
