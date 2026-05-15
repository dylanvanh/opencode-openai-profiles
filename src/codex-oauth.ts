import { createHash, randomBytes } from "node:crypto";
import type { OpenAIAuthProfile } from "./auth-store.js";

const CLIENT_ID = "app_EMoamEEZ73f0CkXaXp7hrann";
const ISSUER = "https://auth.openai.com";
const REDIRECT_URI = "http://localhost:1455/auth/callback";
const PKCE_VERIFIER_LENGTH = 43;
const STATE_BYTE_LENGTH = 32;
const OAUTH_TOKEN_PATH = "/oauth/token";

type PkceCodes = {
  verifier: string;
  challenge: string;
};

type TokenResponse = {
  id_token?: string;
  access_token: string;
  refresh_token: string;
  expires_in?: number;
};

type IdTokenClaims = {
  chatgpt_account_id?: string;
  organizations?: Array<{ id: string }>;
  "https://api.openai.com/auth"?: {
    chatgpt_account_id?: string;
  };
};

export type ManualCodexLogin = {
  url: string;
  state: string;
  verifier: string;
};

export async function createManualCodexLogin(): Promise<ManualCodexLogin> {
  const pkce = createPkceCodes();
  const state = createState();

  return {
    url: buildAuthorizeUrl(pkce.challenge, state),
    state,
    verifier: pkce.verifier,
  };
}

export async function completeManualCodexLogin(login: ManualCodexLogin, callbackUrlOrCode: string): Promise<OpenAIAuthProfile> {
  const code = extractAuthorizationCode(callbackUrlOrCode, login.state);
  const tokenResponse = await exchangeCodeForTokens(code, login.verifier);
  const accountId = extractAccountId(tokenResponse);

  return {
    type: "oauth",
    refresh: tokenResponse.refresh_token,
    access: tokenResponse.access_token,
    expires: Date.now() + (tokenResponse.expires_in ?? 3600) * 1000,
    ...(accountId ? { accountId } : {}),
  };
}

export function extractAuthorizationCode(callbackUrlOrCode: string, expectedState: string): string {
  const trimmedInput = callbackUrlOrCode.trim();

  if (trimmedInput.length === 0) {
    throw new Error("Paste the callback URL or authorization code");
  }

  try {
    const callbackUrl = new URL(trimmedInput);
    const callbackError = callbackUrl.searchParams.get("error");

    if (callbackError) {
      throw new Error(callbackUrl.searchParams.get("error_description") ?? callbackError);
    }

    const state = callbackUrl.searchParams.get("state");

    if (state !== expectedState) {
      throw new Error("Callback URL state does not match this login attempt");
    }

    const code = callbackUrl.searchParams.get("code");

    if (!code) {
      throw new Error("Callback URL is missing an authorization code");
    }

    return code;
  } catch (error) {
    if (error instanceof TypeError) {
      return trimmedInput;
    }

    throw error;
  }
}

function createPkceCodes(): PkceCodes {
  const verifier = generateRandomString(PKCE_VERIFIER_LENGTH);
  const challenge = base64UrlEncode(createHash("sha256").update(verifier).digest());

  return { verifier, challenge };
}

function createState(): string {
  return base64UrlEncode(randomBytes(STATE_BYTE_LENGTH));
}

function buildAuthorizeUrl(challenge: string, state: string): string {
  const params = new URLSearchParams({
    response_type: "code",
    client_id: CLIENT_ID,
    redirect_uri: REDIRECT_URI,
    scope: "openid profile email offline_access",
    code_challenge: challenge,
    code_challenge_method: "S256",
    id_token_add_organizations: "true",
    codex_cli_simplified_flow: "true",
    state,
    originator: "opencode",
  });

  return `${ISSUER}/oauth/authorize?${params.toString()}`;
}

async function exchangeCodeForTokens(code: string, verifier: string): Promise<TokenResponse> {
  const response = await fetch(`${ISSUER}${OAUTH_TOKEN_PATH}`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: REDIRECT_URI,
      client_id: CLIENT_ID,
      code_verifier: verifier,
    }).toString(),
  });

  if (!response.ok) {
    throw new Error(`Token exchange failed: ${response.status}`);
  }

  return (await response.json()) as TokenResponse;
}

function extractAccountId(tokenResponse: TokenResponse): string | undefined {
  if (tokenResponse.id_token) {
    return extractAccountIdFromToken(tokenResponse.id_token);
  }

  return extractAccountIdFromToken(tokenResponse.access_token);
}

function extractAccountIdFromToken(token: string): string | undefined {
  const tokenParts = token.split(".");

  if (tokenParts.length !== 3 || !tokenParts[1]) {
    return undefined;
  }

  try {
    const claims = JSON.parse(Buffer.from(tokenParts[1], "base64url").toString()) as IdTokenClaims;

    return claims.chatgpt_account_id ?? claims["https://api.openai.com/auth"]?.chatgpt_account_id ?? claims.organizations?.[0]?.id;
  } catch {
    return undefined;
  }
}

function generateRandomString(length: number): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~";
  const bytes = randomBytes(length);

  return Array.from(bytes, (byte) => chars[byte % chars.length]).join("");
}

function base64UrlEncode(buffer: Buffer): string {
  return buffer.toString("base64url");
}
