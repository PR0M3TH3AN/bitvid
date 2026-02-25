export const PUBLISH_ERROR_CODES = {
  TIMEOUT: 'publish_timeout',
  DNS: 'dns_resolution',
  TCP: 'tcp_connect_timeout',
  TLS: 'tls_handshake',
  WEBSOCKET: 'websocket_open_failure',
  NETWORK: 'network_timeout',
  CONNECTION_RESET: 'connection_reset',
  RELAY_UNAVAILABLE: 'relay_unavailable',
  PERMANENT: 'permanent_validation_error',
};

export const PUBLISH_FAILURE_CATEGORIES = {
  QUORUM_FAILURE: 'relay_publish_quorum_failure',
  NON_RETRYABLE: 'relay_publish_non_retryable',
};

/**
 * Classifies a raw error message into a standardized publication error code.
 * Used to determine if a failure is transient (retryable) or permanent.
 *
 * @param {string|Error} message - The error message or object to classify.
 * @returns {string} One of the PUBLISH_ERROR_CODES constants.
 */
export function classifyPublishError(message) {
  const normalized = String(message || '').toLowerCase();
  if (normalized.includes('publish timed out after') || normalized.includes('publish timeout')) {
    return PUBLISH_ERROR_CODES.TIMEOUT;
  }
  if (
    normalized.includes('enotfound')
    || normalized.includes('eai_again')
    || normalized.includes('getaddrinfo')
    || (normalized.includes('dns') && normalized.includes('websocket'))
  ) {
    return PUBLISH_ERROR_CODES.DNS;
  }
  if (
    normalized.includes('connect etimedout')
    || normalized.includes('tcp connect timed out')
    || normalized.includes('connect timeout')
  ) {
    return PUBLISH_ERROR_CODES.TCP;
  }
  if (
    normalized.includes('tls')
    || normalized.includes('ssl')
    || normalized.includes('certificate')
    || normalized.includes('handshake')
  ) {
    return PUBLISH_ERROR_CODES.TLS;
  }
  if (
    normalized.includes('websocket')
    || normalized.includes('bad response')
    || normalized.includes('unexpected server response')
  ) {
    return PUBLISH_ERROR_CODES.WEBSOCKET;
  }
  if (normalized.includes('timed out') || normalized.includes('timeout') || normalized.includes('etimedout')) {
    return PUBLISH_ERROR_CODES.NETWORK;
  }
  if (normalized.includes('econnreset') || normalized.includes('connection reset') || normalized.includes('socket hang up')) {
    return PUBLISH_ERROR_CODES.CONNECTION_RESET;
  }
  if (
    normalized.includes('unavailable')
    || normalized.includes('offline')
    || normalized.includes('econnrefused')
    || normalized.includes('connection refused')
    || normalized.includes('503')
  ) {
    return PUBLISH_ERROR_CODES.RELAY_UNAVAILABLE;
  }
  return PUBLISH_ERROR_CODES.PERMANENT;
}

export function isTransientPublishCategory(category) {
  return [
    PUBLISH_ERROR_CODES.TIMEOUT,
    PUBLISH_ERROR_CODES.DNS,
    PUBLISH_ERROR_CODES.TCP,
    PUBLISH_ERROR_CODES.TLS,
    PUBLISH_ERROR_CODES.WEBSOCKET,
    PUBLISH_ERROR_CODES.NETWORK,
    PUBLISH_ERROR_CODES.CONNECTION_RESET,
    PUBLISH_ERROR_CODES.RELAY_UNAVAILABLE,
  ].includes(category);
}
