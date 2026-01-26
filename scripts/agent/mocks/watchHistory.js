
export function normalizeActorKey(key) {
  if (typeof key !== 'string') return '';
  // simple hex check or return as is for mocking
  return key.toLowerCase().trim();
}
