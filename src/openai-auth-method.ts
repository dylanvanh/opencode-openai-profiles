export const OPENAI_BROWSER_LOGIN_METHOD_LABEL = "ChatGPT Pro/Plus (browser)";
export const OPENAI_HEADLESS_LOGIN_METHOD_LABEL = "ChatGPT Pro/Plus (headless)";

const OPENAI_BROWSER_METHOD_PREFERENCE = "browser";
const OPENAI_HEADLESS_METHOD_PREFERENCE = "headless";
const NOT_FOUND_INDEX = -1;

export type OpenAIAuthMethod = { label: string };
export type OpenAIAuthMethodPreference =
  | typeof OPENAI_BROWSER_METHOD_PREFERENCE
  | typeof OPENAI_HEADLESS_METHOD_PREFERENCE;

export function parseOpenAIAuthMethodPreference(methodPreference: string | undefined): OpenAIAuthMethodPreference {
  const trimmedMethodPreference = methodPreference?.trim();

  if (!trimmedMethodPreference || trimmedMethodPreference === OPENAI_BROWSER_METHOD_PREFERENCE) {
    return OPENAI_BROWSER_METHOD_PREFERENCE;
  }

  if (trimmedMethodPreference === OPENAI_HEADLESS_METHOD_PREFERENCE) {
    return OPENAI_HEADLESS_METHOD_PREFERENCE;
  }

  throw new Error("Use browser or headless for OpenAI login method");
}

export function findOpenAIAuthMethodIndex(
  openAIAuthMethods: OpenAIAuthMethod[],
  methodPreference: OpenAIAuthMethodPreference,
): number | undefined {
  const preferredMethodLabel = getOpenAIAuthMethodLabel(methodPreference);
  const methodIndex = openAIAuthMethods.findIndex((method) => method.label === preferredMethodLabel);

  if (methodIndex === NOT_FOUND_INDEX) {
    return undefined;
  }

  return methodIndex;
}

function getOpenAIAuthMethodLabel(methodPreference: OpenAIAuthMethodPreference): string {
  if (methodPreference === OPENAI_HEADLESS_METHOD_PREFERENCE) {
    return OPENAI_HEADLESS_LOGIN_METHOD_LABEL;
  }

  return OPENAI_BROWSER_LOGIN_METHOD_LABEL;
}
