import { timingSafeEqual } from "node:crypto";

export type HttpSecurityOptions = {
  authToken?: string;
  allowedOrigins?: readonly string[];
};

export type RequestHeaders = {
  authorization?: string;
  method?: string;
  origin?: string;
};

export type SecurityDecision =
  | { ok: true; origin?: string }
  | { ok: false; status: 401 | 403; error: "Unauthorized" | "Origin not allowed" };

export type HttpSecurityPolicy = {
  check(headers: RequestHeaders): SecurityDecision;
  corsHeaders(origin: string | undefined): Record<string, string>;
};

const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
  "Access-Control-Allow-Headers":
    "Accept, Authorization, Content-Type, Mcp-Protocol-Version, Mcp-Session-Id",
  "Access-Control-Expose-Headers": "Mcp-Session-Id",
  Vary: "Origin",
};

export function normalizeOrigin(value: string): string {
  const url = new URL(value);
  if (!["http:", "https:"].includes(url.protocol)) {
    throw new Error(`Unsupported origin protocol: ${url.protocol}`);
  }
  if (url.username || url.password || url.pathname !== "/" || url.search || url.hash) {
    throw new Error("Allowed origins must contain only a scheme, host, and optional port.");
  }
  return url.origin;
}

export function createHttpSecurity(options: HttpSecurityOptions = {}): HttpSecurityPolicy {
  if (options.authToken !== undefined && options.authToken.length === 0) {
    throw new Error("The HTTP authentication token must not be empty.");
  }

  const allowedOrigins = new Set((options.allowedOrigins ?? []).map(normalizeOrigin));

  return {
    check(headers) {
      const origin = headers.origin === undefined ? undefined : parseRequestOrigin(headers.origin);
      if (headers.origin !== undefined && (!origin || !allowedOrigins.has(origin))) {
        return { ok: false, status: 403, error: "Origin not allowed" };
      }
      if (
        headers.method !== "OPTIONS" &&
        options.authToken !== undefined &&
        !hasBearerToken(headers.authorization, options.authToken)
      ) {
        return { ok: false, status: 401, error: "Unauthorized" };
      }
      return origin ? { ok: true, origin } : { ok: true };
    },
    corsHeaders(origin) {
      if (!origin || !allowedOrigins.has(origin)) {
        return {};
      }
      return { ...CORS_HEADERS, "Access-Control-Allow-Origin": origin };
    },
  };
}

function parseRequestOrigin(value: string): string | undefined {
  try {
    return normalizeOrigin(value.trim());
  } catch {
    return undefined;
  }
}

function hasBearerToken(authorization: string | undefined, expected: string): boolean {
  const prefix = "Bearer ";
  if (!authorization?.startsWith(prefix)) {
    return false;
  }
  const received = Buffer.from(authorization.slice(prefix.length));
  const expectedBytes = Buffer.from(expected);
  return received.length === expectedBytes.length && timingSafeEqual(received, expectedBytes);
}
