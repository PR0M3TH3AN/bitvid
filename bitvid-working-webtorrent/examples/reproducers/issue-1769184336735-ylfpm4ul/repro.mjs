
import { buildSubscriptionListEvent } from '../../../js/nostrEventSchemas.js';

const args = [
  {
    "content": {}
  }
];

console.log('Running reproduction for buildSubscriptionListEvent...');
try {
  buildSubscriptionListEvent(...args);
  console.log('No crash reproduced.');
} catch (error) {
  console.log('Crash reproduced:');
  console.error(error);
}
