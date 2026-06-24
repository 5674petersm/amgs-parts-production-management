import type { Request } from "mssql";
import sql from "mssql";

/** Bind parameters without explicit mssql types (avoids webpack type identity issues). */
export function bindInt(request: Request, name: string, value: number): Request {
  return request.input(name, Math.trunc(value));
}

export function bindNVarChar(
  request: Request,
  name: string,
  value: string,
  maxLength = 4000,
): Request {
  const trimmed = value.trim();
  return request.input(name, trimmed.slice(0, maxLength));
}

export function bindDateTime2(request: Request, name: string, value: string): Request {
  return request.input(name, sql.DateTime2(0), value);
}

export function bindDecimal(request: Request, name: string, value: number): Request {
  return request.input(name, Number(value));
}
