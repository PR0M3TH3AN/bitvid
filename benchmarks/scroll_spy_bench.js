
import { performance } from 'perf_hooks';

// Mock data
const NUM_HEADINGS = 100;
const SCROLL_EVENTS = 10000;

const headings = [];
for (let i = 0; i < NUM_HEADINGS; i++) {
  headings.push({
    id: `heading-${i}`,
    // Mock getBoundingClientRect
    getBoundingClientRect: () => ({
      top: (i * 100) - currentScrollY, // Simple layout simulation
    })
  });
}

let currentScrollY = 0;
let activeId = "";

// The function to benchmark (copied/adapted from js/docsView.js)
const updateActiveFromScroll = () => {
    const offset = 96;
    let nextId = headings[0]?.id || "";

    // In the real code, this runs on every scroll (throttled by rAF)
    // We simulate the logic here.
    for (const heading of headings) {
      const top = heading.getBoundingClientRect().top - offset;
      if (top <= 0) {
        nextId = heading.id;
      } else {
        break;
      }
    }

    if (nextId && nextId !== activeId) {
      activeId = nextId;
      // setActiveSection logic (simplified)
    }
};

console.log(`Benchmarking legacy scroll spy logic...`);
console.log(`Headings: ${NUM_HEADINGS}`);
console.log(`Scroll events simulated: ${SCROLL_EVENTS}`);

const start = performance.now();

for (let i = 0; i < SCROLL_EVENTS; i++) {
  // Simulate scrolling down
  currentScrollY += 5;
  updateActiveFromScroll();
}

const end = performance.now();
const duration = end - start;

console.log(`Total execution time: ${duration.toFixed(2)}ms`);
console.log(`Average time per scroll event: ${(duration / SCROLL_EVENTS).toFixed(4)}ms`);
console.log(`Note: This benchmark only measures JS execution time. Real browser performance is worse due to layout thrashing (getBoundingClientRect).`);
