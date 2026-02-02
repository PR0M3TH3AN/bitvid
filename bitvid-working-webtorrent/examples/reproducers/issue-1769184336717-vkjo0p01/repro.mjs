
import { buildWatchHistoryEvent } from '../../../js/nostrEventSchemas.js';

const args = [
  {
    "content": {}
  }
];

console.log('Running reproduction for buildWatchHistoryEvent...');
try {
  buildWatchHistoryEvent(...args);
  console.log('No crash reproduced.');
} catch (error) {
  console.log('Crash reproduced:');
  console.error(error);
}
