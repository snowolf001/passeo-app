// src/api/apiClient.ts

import {ApiError, ApiErrorResponse, ApiSuccessResponse} from '../../types/api';

// Android emulator: http://10.0.2.2:3000
// iOS simulator: http://localhost:3000
// Physical device: use your computer LAN IP, e.g. http://192.168.1.100:3000
const API_BASE_URL = 'http://10.0.2.2:3000';

type RequestOptions = {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  body?: unknown;
  headers?: Record<string, string>;
};

async function parseJsonSafely(response: Response): Promise<any> {
  const text = await response.text();
  if (!text) {
    return null;
  }
  try {
    return JSON.parse(text);
  } catch (_e) {
    return text;
  }
}

export async function apiRequest<T>(
  path: string,
  options: RequestOptions = {},
): Promise<T> {
  var method = options.method || 'GET';
  var body = options.body;
  var headers = options.headers || {};
  var fullUrl = API_BASE_URL + path;

  console.log('[apiClient] ' + method + ' ' + fullUrl);
  if (body !== undefined) {
    console.log('[apiClient] request body:', JSON.stringify(body));
  }

  var fetchHeaders: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  var keys = Object.keys(headers);
  for (var i = 0; i < keys.length; i++) {
    fetchHeaders[keys[i]] = headers[keys[i]];
  }

  var fetchOptions: RequestInit = {
    method: method,
    headers: fetchHeaders,
  };
  if (body !== undefined) {
    fetchOptions.body = JSON.stringify(body);
  }

  var controller = new AbortController();
  var timeoutId = setTimeout(function () {
    controller.abort();
    console.warn('[apiClient] TIMEOUT (10s) for ' + method + ' ' + fullUrl);
  }, 10000);
  fetchOptions.signal = controller.signal;

  var response: Response | undefined;
  var networkErr: unknown;
  try {
    response = await fetch(fullUrl, fetchOptions);
  } catch (e) {
    networkErr = e;
  } finally {
    clearTimeout(timeoutId);
  }

  if (networkErr !== undefined || response === undefined) {
    var errMsg =
      networkErr instanceof Error ? networkErr.message : String(networkErr);
    console.warn(
      '[apiClient] NETWORK ERROR ' + method + ' ' + fullUrl + ': ' + errMsg,
    );
    throw networkErr;
  }

  console.log('[apiClient] status: ' + response.status + ' for ' + fullUrl);
  var payload = await parseJsonSafely(response);
  console.log(
    '[apiClient] payload:',
    JSON.stringify(payload) ? JSON.stringify(payload).slice(0, 300) : 'null',
  );

  if (!response.ok) {
    var errorPayload = payload as Partial<ApiErrorResponse> | string | null;
    if (
      errorPayload &&
      typeof errorPayload === 'object' &&
      'error' in errorPayload &&
      (errorPayload as any).error
    ) {
      var ep = (errorPayload as ApiErrorResponse).error;
      throw new ApiError({
        status: response.status,
        code: ep.code,
        message: ep.message,
        details: ep.details,
      });
    }
    throw new ApiError({
      status: response.status,
      code: 'HTTP_ERROR',
      message:
        typeof payload === 'string'
          ? payload
          : 'Request failed with status ' + response.status,
      details: payload,
    });
  }

  var successPayload = payload as ApiSuccessResponse<T>;
  if (
    successPayload &&
    typeof successPayload === 'object' &&
    'success' in successPayload &&
    (successPayload as any).success === true &&
    'data' in successPayload
  ) {
    return successPayload.data;
  }

  return payload as T;
}
