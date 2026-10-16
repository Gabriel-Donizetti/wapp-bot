let accessToken = "";
export const tokenStorageKey = "wapp.auth.v1";
export function setToken(token: string) {
  accessToken = token;
}
export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public code: string,
    public details?: unknown,
  ) {
    super(message);
  }
}
export async function api<T>(
  path: string,
  options: {
    method?: string;
    body?: unknown;
    signal?: AbortSignal;
    idempotencyKey?: string;
  } = {},
): Promise<T> {
  const response = await fetch(`/api/v1${path}`, {
    method: options.method || "GET",
    signal: options.signal,
    headers: {
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...(options.idempotencyKey
        ? { "Idempotency-Key": options.idempotencyKey }
        : {}),
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  if (response.status === 204) return undefined as T;
  const data = await response.json();
  if (!response.ok) {
    if (response.status === 401 && accessToken && path !== "/auth/login")
      window.dispatchEvent(new Event("wapp:unauthorized"));
    const validation =
      data.details && Array.isArray(data.details)
        ? data.details[0]?.message
        : undefined;
    throw new ApiError(
      validation || data.message || "Não foi possível concluir a operação.",
      response.status,
      data.error,
      data.details,
    );
  }
  return data as T;
}
