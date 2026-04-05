// src/types/api.ts

export type ApiSuccessResponse<T> = {
  success: true;
  data: T;
};

export type ApiErrorResponse = {
  success: false;
  error: {
    code: string;
    message: string;
    details: unknown;
  };
};

export class ApiError extends Error {
  code: string;
  status: number;
  details: unknown;

  constructor(params: {
    message: string;
    code?: string;
    status?: number;
    details?: unknown;
  }) {
    super(params.message);
    this.name = 'ApiError';
    this.code = params.code ?? 'UNKNOWN_ERROR';
    this.status = params.status ?? 500;
    this.details = params.details ?? null;
  }
}
