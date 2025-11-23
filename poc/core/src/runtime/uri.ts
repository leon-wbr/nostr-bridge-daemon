import { EndpointConfig } from './components.js';

export function parseEndpoint(uri: string): EndpointConfig {
  const [scheme, rest] = uri.split(':', 2);
  if (!scheme || rest === undefined) {
    throw new Error(`Invalid endpoint URI: ${uri}`);
  }

  const [pathPart, queryPart] = rest.split('?', 2);
  const path = decodeURIComponent(pathPart || '');
  const query: Record<string, string | string[]> = {};

  if (queryPart) {
    const params = new URLSearchParams(queryPart);
    params.forEach((value, key) => {
      const decodedKey = decodeURIComponent(key);
      const decodedValue = decodeURIComponent(value);
      const existing = query[decodedKey];
      if (existing === undefined) {
        query[decodedKey] = decodedValue;
      } else if (Array.isArray(existing)) {
        existing.push(decodedValue);
      } else {
        query[decodedKey] = [existing, decodedValue];
      }
    });
  }

  return { scheme, path, query };
}
