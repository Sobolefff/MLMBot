const config = require('../config');

const BASE_URL = `http://localhost:${config.port}/api/v1`;

async function request(path, { method = 'GET', body, token } = {}) {
  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.error || `Request failed with status ${res.status}`);
    err.status = res.status;
    throw err;
  }
  return data;
}

/**
 * Like `request`, but sends a raw binary body (e.g. an uploaded file) instead
 * of JSON-encoding it. Used for the PDF catalog import, where base64-in-JSON
 * would inflate a multi-megabyte file by another third for no benefit.
 */
async function requestRaw(path, { method = 'POST', body, token, contentType } = {}) {
  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers: {
      'Content-Type': contentType,
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.error || `Request failed with status ${res.status}`);
    err.status = res.status;
    throw err;
  }
  return data;
}

module.exports = { request, requestRaw };
