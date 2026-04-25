export function authorizeAdminRequest(
  request: Request,
  token: string
): { ok: true } | { ok: false; status: number; error: string } {
  if (!token) return { ok: false, status: 503, error: "manual trigger disabled" };
  const auth = request.headers.get("authorization") ?? "";
  return auth === `Bearer ${token}` ? { ok: true } : { ok: false, status: 401, error: "unauthorized" };
}
