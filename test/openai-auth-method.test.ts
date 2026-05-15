import { describe, expect, test } from "vitest";
import {
  findOpenAIAuthMethodIndex,
  OPENAI_BROWSER_LOGIN_METHOD_LABEL,
  OPENAI_HEADLESS_LOGIN_METHOD_LABEL,
  parseOpenAIAuthMethodPreference,
  type OpenAIAuthMethod,
} from "../src/openai-auth-method.js";

describe("openai-auth-method", () => {
  test("should use browser login when preference is omitted", () => {
    // given
    const METHOD_PREFERENCE = undefined;

    // when
    const result = parseOpenAIAuthMethodPreference(METHOD_PREFERENCE);

    // then
    const EXPECTED_METHOD_PREFERENCE = "browser";
    expect(result).toBe(EXPECTED_METHOD_PREFERENCE);
  });

  test("should reject unsupported login method preferences", () => {
    // given
    const METHOD_PREFERENCE = "desktop";

    // when
    const action = () => parseOpenAIAuthMethodPreference(METHOD_PREFERENCE);

    // then
    expect(action).toThrow("Use browser or headless for OpenAI login method");
  });

  test("should find the requested OpenAI auth method index", () => {
    // given
    const OPENAI_AUTH_METHODS: OpenAIAuthMethod[] = [
      { label: OPENAI_BROWSER_LOGIN_METHOD_LABEL },
      { label: OPENAI_HEADLESS_LOGIN_METHOD_LABEL },
    ];
    const METHOD_PREFERENCE = "headless";

    // when
    const result = findOpenAIAuthMethodIndex(OPENAI_AUTH_METHODS, METHOD_PREFERENCE);

    // then
    const EXPECTED_METHOD_INDEX = 1;
    expect(result).toBe(EXPECTED_METHOD_INDEX);
  });

  test("should return undefined when requested OpenAI auth method is unavailable", () => {
    // given
    const OPENAI_AUTH_METHODS: OpenAIAuthMethod[] = [{ label: OPENAI_BROWSER_LOGIN_METHOD_LABEL }];
    const METHOD_PREFERENCE = "headless";

    // when
    const result = findOpenAIAuthMethodIndex(OPENAI_AUTH_METHODS, METHOD_PREFERENCE);

    // then
    expect(result).toBeUndefined();
  });
});
