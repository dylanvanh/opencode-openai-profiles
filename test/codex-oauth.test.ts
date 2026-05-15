import { describe, expect, test } from "vitest";
import { extractAuthorizationCode } from "../src/codex-oauth.js";

const EXPECTED_STATE = "expected-state";
const AUTHORIZATION_CODE = "authorization-code";

describe("codex-oauth", () => {
  test("should extract authorization code from callback URL", () => {
    // given
    const callbackUrl = `http://localhost:1455/auth/callback?code=${AUTHORIZATION_CODE}&state=${EXPECTED_STATE}`;

    // when
    const code = extractAuthorizationCode(callbackUrl, EXPECTED_STATE);

    // then
    expect(code).toBe(AUTHORIZATION_CODE);
  });

  test("should reject callback URL with mismatched state", () => {
    // given
    const callbackUrl = `http://localhost:1455/auth/callback?code=${AUTHORIZATION_CODE}&state=wrong-state`;

    // when
    const action = () => extractAuthorizationCode(callbackUrl, EXPECTED_STATE);

    // then
    expect(action).toThrow("Callback URL state does not match this login attempt");
  });

  test("should accept raw authorization code", () => {
    // given
    const rawCode = AUTHORIZATION_CODE;

    // when
    const code = extractAuthorizationCode(rawCode, EXPECTED_STATE);

    // then
    expect(code).toBe(AUTHORIZATION_CODE);
  });
});
