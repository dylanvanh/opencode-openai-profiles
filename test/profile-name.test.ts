import { describe, expect, test } from "vitest";
import { parseProfileName } from "../src/profile-name.js";

describe("parseProfileName", () => {
  test("should return profile name when it contains safe characters", () => {
    // given
    const PROFILE_NAME = "work_profile-1";

    // when
    const result = parseProfileName(PROFILE_NAME);

    // then
    expect(result).toBe(PROFILE_NAME);
  });

  test("should trim whitespace around safe profile names", () => {
    // given
    const PROFILE_NAME = "personal";
    const INPUT_PROFILE_NAME = `  ${PROFILE_NAME}  `;

    // when
    const result = parseProfileName(INPUT_PROFILE_NAME);

    // then
    expect(result).toBe(PROFILE_NAME);
  });

  test("should reject path traversal profile names", () => {
    // given
    const PROFILE_NAME = "../work";

    // when
    const action = () => parseProfileName(PROFILE_NAME);

    // then
    expect(action).toThrow("Use only letters, numbers, underscores, or hyphens");
  });

  test("should reject empty profile names", () => {
    // given
    const PROFILE_NAME = "   ";

    // when
    const action = () => parseProfileName(PROFILE_NAME);

    // then
    expect(action).toThrow("Profile name is required");
  });
});
