import { constants } from "node:fs";
import { access, chmod, mkdir, readFile, readdir, rename, stat, unlink, writeFile } from "node:fs/promises";
import { basename, join } from "node:path";
import { randomUUID } from "node:crypto";
import { getProfileFileName, OPENAI_PROVIDER_ID, PROFILE_FILE_EXTENSION, PROFILE_FILE_PREFIX, type OpenCodeAuthPaths } from "./paths.js";
import { parseProfileName } from "./profile-name.js";

const SECRET_FILE_MODE = 0o600;
const SECRET_DIRECTORY_MODE = 0o700;
const JSON_INDENT_SPACES = 2;

export type OpenAIAuthProfile = {
  type: "oauth";
  refresh: string;
  access: string;
  expires: number;
  accountId?: string;
  enterpriseUrl?: string;
  [key: string]: unknown;
};

export type AuthJson = Record<string, unknown> & {
  openai?: unknown;
};

export type SavedProfile = {
  name: string;
  accountId?: string;
};

export async function getActiveOpenAIProfile(paths: OpenCodeAuthPaths): Promise<OpenAIAuthProfile> {
  const authJson = await readAuthJson(paths.authFilePath);

  return parseOpenAIAuthProfile(authJson[OPENAI_PROVIDER_ID]);
}

export async function saveActiveOpenAIProfile(paths: OpenCodeAuthPaths, inputProfileName: string): Promise<SavedProfile> {
  const profileName = parseProfileName(inputProfileName);
  const activeProfile = await getActiveOpenAIProfile(paths);
  const profileFilePath = getProfileFilePath(paths, profileName);

  await ensureProfileDirectory(paths.profileDirectoryPath);
  await writeSecretJsonFile(profileFilePath, activeProfile);

  return createSavedProfile(profileName, activeProfile);
}

export async function switchActiveOpenAIProfile(paths: OpenCodeAuthPaths, inputProfileName: string): Promise<SavedProfile> {
  const profileName = parseProfileName(inputProfileName);
  const selectedProfile = await readOpenAIProfile(paths, profileName);
  const authJson = await readAuthJson(paths.authFilePath);

  authJson[OPENAI_PROVIDER_ID] = selectedProfile;

  await writeAuthJsonAtomically(paths.authFilePath, authJson);

  return createSavedProfile(profileName, selectedProfile);
}

export async function listOpenAIProfiles(paths: OpenCodeAuthPaths): Promise<SavedProfile[]> {
  let profileFileNames: string[];

  try {
    profileFileNames = await readdir(paths.profileDirectoryPath);
  } catch (error) {
    if (isNodeErrorWithCode(error, "ENOENT")) {
      return [];
    }

    throw error;
  }

  const savedProfiles: SavedProfile[] = [];

  for (const profileFileName of profileFileNames) {
    const profileName = parseProfileNameFromFileName(profileFileName);

    if (!profileName) {
      continue;
    }

    const profile = await readOpenAIProfile(paths, profileName);

    savedProfiles.push(createSavedProfile(profileName, profile));
  }

  return savedProfiles.sort((leftProfile, rightProfile) => leftProfile.name.localeCompare(rightProfile.name));
}

export async function openProfilesFolder(paths: OpenCodeAuthPaths): Promise<void> {
  await ensureProfileDirectory(paths.profileDirectoryPath);
}

export function parseOpenAIAuthProfile(value: unknown): OpenAIAuthProfile {
  if (!isRecord(value)) {
    throw new Error("OpenAI auth profile is missing or invalid");
  }

  if (value.type !== "oauth") {
    throw new Error("OpenAI auth profile must be an oauth profile");
  }

  if (typeof value.refresh !== "string" || value.refresh.length === 0) {
    throw new Error("OpenAI auth profile is missing a refresh token");
  }

  if (typeof value.access !== "string" || value.access.length === 0) {
    throw new Error("OpenAI auth profile is missing an access token");
  }

  if (typeof value.expires !== "number" || !Number.isFinite(value.expires)) {
    throw new Error("OpenAI auth profile is missing a valid expiration timestamp");
  }

  return value as OpenAIAuthProfile;
}

export function replaceOpenAIAuthProfile(authJson: AuthJson, selectedProfile: OpenAIAuthProfile): AuthJson {
  return {
    ...authJson,
    [OPENAI_PROVIDER_ID]: selectedProfile,
  };
}

function createSavedProfile(profileName: string, profile: OpenAIAuthProfile): SavedProfile {
  if (profile.accountId) {
    return {
      name: profileName,
      accountId: profile.accountId,
    };
  }

  return {
    name: profileName,
  };
}

async function readOpenAIProfile(paths: OpenCodeAuthPaths, profileName: string): Promise<OpenAIAuthProfile> {
  const profileFilePath = getProfileFilePath(paths, profileName);
  const profileJson = await readJsonFile(profileFilePath);

  return parseOpenAIAuthProfile(profileJson);
}

async function readAuthJson(authFilePath: string): Promise<AuthJson> {
  const authJson = await readJsonFile(authFilePath);

  if (!isRecord(authJson)) {
    throw new Error("opencode auth.json must contain a JSON object");
  }

  return authJson as AuthJson;
}

async function readJsonFile(filePath: string): Promise<unknown> {
  const fileContents = await readFile(filePath, "utf8");

  return JSON.parse(fileContents) as unknown;
}

async function writeAuthJsonAtomically(authFilePath: string, authJson: AuthJson): Promise<void> {
  const temporaryFilePath = `${authFilePath}.tmp-${randomUUID()}`;
  const fileMode = await getExistingFileMode(authFilePath);

  try {
    await writeFile(temporaryFilePath, `${JSON.stringify(authJson, null, JSON_INDENT_SPACES)}\n`, { mode: fileMode });
    await chmod(temporaryFilePath, fileMode);
    await rename(temporaryFilePath, authFilePath);
  } catch (error) {
    await unlinkIfExists(temporaryFilePath);
    throw error;
  }
}

async function writeSecretJsonFile(filePath: string, value: unknown): Promise<void> {
  await writeFile(filePath, `${JSON.stringify(value, null, JSON_INDENT_SPACES)}\n`, { mode: SECRET_FILE_MODE });
  await chmod(filePath, SECRET_FILE_MODE);
}

async function ensureProfileDirectory(profileDirectoryPath: string): Promise<void> {
  await mkdir(profileDirectoryPath, { recursive: true, mode: SECRET_DIRECTORY_MODE });
  await chmod(profileDirectoryPath, SECRET_DIRECTORY_MODE);
}

async function getExistingFileMode(filePath: string): Promise<number> {
  try {
    const fileStats = await stat(filePath);

    return fileStats.mode & 0o777;
  } catch (error) {
    if (isNodeErrorWithCode(error, "ENOENT")) {
      return SECRET_FILE_MODE;
    }

    throw error;
  }
}

async function unlinkIfExists(filePath: string): Promise<void> {
  try {
    await unlink(filePath);
  } catch (error) {
    if (!isNodeErrorWithCode(error, "ENOENT")) {
      throw error;
    }
  }
}

function getProfileFilePath(paths: OpenCodeAuthPaths, profileName: string): string {
  return join(paths.profileDirectoryPath, getProfileFileName(profileName));
}

function parseProfileNameFromFileName(profileFileName: string): string | undefined {
  const safeFileName = basename(profileFileName);

  if (!safeFileName.startsWith(PROFILE_FILE_PREFIX) || !safeFileName.endsWith(PROFILE_FILE_EXTENSION)) {
    return undefined;
  }

  const profileName = safeFileName.slice(PROFILE_FILE_PREFIX.length, -PROFILE_FILE_EXTENSION.length);

  try {
    return parseProfileName(profileName);
  } catch {
    return undefined;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNodeErrorWithCode(error: unknown, code: string): boolean {
  return error instanceof Error && "code" in error && error.code === code;
}

export async function authFileExists(paths: OpenCodeAuthPaths): Promise<boolean> {
  try {
    await access(paths.authFilePath, constants.R_OK);

    return true;
  } catch (error) {
    if (isNodeErrorWithCode(error, "ENOENT")) {
      return false;
    }

    throw error;
  }
}
