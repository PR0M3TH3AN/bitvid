import Application from './js/app.js';
try {
  const app = new Application();
  console.log('Application initialized successfully');
} catch (e) {
  console.error('Failed to initialize Application:', e);
  process.exit(1);
}
