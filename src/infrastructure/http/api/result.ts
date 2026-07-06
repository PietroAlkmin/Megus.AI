import type { Response } from "express";
import { randomUUID } from "node:crypto";

/**
 * Envelope de resposta — MESMO contrato que os services do front esperam
 * (envelope de resposta padrão). O front lê { success, data, message, ... }.
 *
 *   ResultResponse<T> = { success, data, message, errors, correlationId, statusCode }
 */
export interface ResultResponse<T> {
  success: boolean;
  data: T | null;
  message: string | null;
  errors: string[] | null;
  correlationId: string | null;
  statusCode: number;
}

export function ok<T>(res: Response, data: T, message?: string, statusCode = 200): void {
  const body: ResultResponse<T> = {
    success: true,
    data,
    message: message ?? null,
    errors: null,
    correlationId: null,
    statusCode,
  };
  res.status(statusCode).json(body);
}

export function fail(res: Response, message: string, statusCode = 400, code?: string): void {
  const body: ResultResponse<null> = {
    success: false,
    data: null,
    message,
    errors: [code ?? message],
    correlationId: "err-" + randomUUID().slice(0, 8),
    statusCode,
  };
  res.status(statusCode).json(body);
}