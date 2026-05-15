import { mkdir, mkdtemp, readFile, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import {
	type AuthJson,
	listOpenAIProfiles,
	type OpenAIAuthProfile,
	parseOpenAIAuthProfile,
	renameOpenAIProfile,
	replaceOpenAIAuthProfile,
	saveActiveOpenAIProfile,
	saveActiveOpenAIProfileIfUnsaved,
	switchActiveOpenAIProfile,
} from "../src/auth-store.js";
import type { OpenCodeAuthPaths } from "../src/paths.js";

const WORK_ACCOUNT_ID = "work-account-id";
const PERSONAL_ACCOUNT_ID = "personal-account-id";
const AUTH_FILE_MODE = 0o600;
const PROFILE_DIRECTORY_MODE = 0o700;

describe("auth-store", () => {
	test("should replace only OpenAI auth when switching profiles", async () => {
		// given
		const paths = await createTestPaths();
		const workProfile = createOpenAIProfile(WORK_ACCOUNT_ID);
		const personalProfile = createOpenAIProfile(PERSONAL_ACCOUNT_ID);
		const ANTHROPIC_AUTH = { type: "oauth", refresh: "anthropic-refresh" };
		await writeJson(paths.authFilePath, {
			anthropic: ANTHROPIC_AUTH,
			openai: workProfile,
		});
		await writeJson(
			join(paths.profileDirectoryPath, "openai-personal.json"),
			personalProfile,
		);

		// when
		await switchActiveOpenAIProfile(paths, "personal");

		// then
		const updatedAuthJson = JSON.parse(
			await readFile(paths.authFilePath, "utf8"),
		) as AuthJson;
		expect(updatedAuthJson.openai).toEqual(personalProfile);
		expect(updatedAuthJson.anthropic).toEqual(ANTHROPIC_AUTH);
	});

	test("should save active OpenAI profile with secret file permissions", async () => {
		// given
		const paths = await createTestPaths();
		const workProfile = createOpenAIProfile(WORK_ACCOUNT_ID);
		await writeJson(paths.authFilePath, {
			openai: workProfile,
		});

		// when
		await saveActiveOpenAIProfile(paths, "work");

		// then
		const savedProfilePath = join(
			paths.profileDirectoryPath,
			"openai-work.json",
		);
		const savedProfile = JSON.parse(
			await readFile(savedProfilePath, "utf8"),
		) as OpenAIAuthProfile;
		const savedProfileMode = (await stat(savedProfilePath)).mode & 0o777;
		const profileDirectoryMode =
			(await stat(paths.profileDirectoryPath)).mode & 0o777;
		expect(savedProfile).toEqual(workProfile);
		expect(profileDirectoryMode).toBe(PROFILE_DIRECTORY_MODE);
		expect(savedProfileMode).toBe(AUTH_FILE_MODE);
	});

	test("should save an unsaved active OpenAI profile with the next default account name", async () => {
		// given
		const paths = await createTestPaths();
		const workProfile = createOpenAIProfile(WORK_ACCOUNT_ID);
		await writeJson(paths.authFilePath, {
			openai: workProfile,
		});

		// when
		const savedProfile = await saveActiveOpenAIProfileIfUnsaved(paths);

		// then
		const savedProfilePath = join(
			paths.profileDirectoryPath,
			"openai-account-1.json",
		);
		const savedProfileContents = JSON.parse(
			await readFile(savedProfilePath, "utf8"),
		) as OpenAIAuthProfile;
		expect(savedProfile).toEqual({
			name: "account-1",
			accountId: WORK_ACCOUNT_ID,
		});
		expect(savedProfileContents).toEqual(workProfile);
	});

	test("should use the next available default account name when preserving active OpenAI profile", async () => {
		// given
		const paths = await createTestPaths();
		const personalProfile = createOpenAIProfile(PERSONAL_ACCOUNT_ID);
		await writeJson(paths.authFilePath, {
			openai: personalProfile,
		});
		await writeJson(
			join(paths.profileDirectoryPath, "openai-account-1.json"),
			createOpenAIProfile(WORK_ACCOUNT_ID),
		);

		// when
		const savedProfile = await saveActiveOpenAIProfileIfUnsaved(paths);

		// then
		const savedProfilePath = join(
			paths.profileDirectoryPath,
			"openai-account-2.json",
		);
		const savedProfileContents = JSON.parse(
			await readFile(savedProfilePath, "utf8"),
		) as OpenAIAuthProfile;
		expect(savedProfile).toEqual({
			name: "account-2",
			accountId: PERSONAL_ACCOUNT_ID,
		});
		expect(savedProfileContents).toEqual(personalProfile);
	});

	test("should not duplicate an already saved active OpenAI profile", async () => {
		// given
		const paths = await createTestPaths();
		const workProfile = createOpenAIProfile(WORK_ACCOUNT_ID);
		await writeJson(paths.authFilePath, {
			openai: workProfile,
		});
		await writeJson(
			join(paths.profileDirectoryPath, "openai-work.json"),
			workProfile,
		);

		// when
		const savedProfile = await saveActiveOpenAIProfileIfUnsaved(paths);

		// then
		const profiles = await listOpenAIProfiles(paths);
		expect(savedProfile).toBeUndefined();
		expect(profiles).toEqual([{ name: "work", accountId: WORK_ACCOUNT_ID }]);
	});

	test("should list saved OpenAI profiles sorted by profile name", async () => {
		// given
		const paths = await createTestPaths();
		await writeJson(
			join(paths.profileDirectoryPath, "openai-work.json"),
			createOpenAIProfile(WORK_ACCOUNT_ID),
		);
		await writeJson(
			join(paths.profileDirectoryPath, "openai-personal.json"),
			createOpenAIProfile(PERSONAL_ACCOUNT_ID),
		);
		await writeJson(
			join(paths.profileDirectoryPath, "ignored.json"),
			createOpenAIProfile("ignored-account-id"),
		);

		// when
		const profiles = await listOpenAIProfiles(paths);

		// then
		expect(profiles).toEqual([
			{
				name: "personal",
				accountId: PERSONAL_ACCOUNT_ID,
			},
			{
				name: "work",
				accountId: WORK_ACCOUNT_ID,
			},
		]);
	});

	test("should rename a saved OpenAI profile without changing its contents", async () => {
		// given
		const paths = await createTestPaths();
		const accountProfile = createOpenAIProfile(WORK_ACCOUNT_ID);
		await writeJson(
			join(paths.profileDirectoryPath, "openai-account-1.json"),
			accountProfile,
		);

		// when
		const renamedProfile = await renameOpenAIProfile(
			paths,
			"account-1",
			"account-2",
		);

		// then
		const renamedProfilePath = join(
			paths.profileDirectoryPath,
			"openai-account-2.json",
		);
		const renamedProfileContents = JSON.parse(
			await readFile(renamedProfilePath, "utf8"),
		) as OpenAIAuthProfile;
		const profiles = await listOpenAIProfiles(paths);
		expect(renamedProfile).toEqual({
			name: "account-2",
			accountId: WORK_ACCOUNT_ID,
		});
		expect(renamedProfileContents).toEqual(accountProfile);
		expect(profiles).toEqual([
			{ name: "account-2", accountId: WORK_ACCOUNT_ID },
		]);
	});

	test("should reject renaming over an existing OpenAI profile", async () => {
		// given
		const paths = await createTestPaths();
		await writeJson(
			join(paths.profileDirectoryPath, "openai-account-1.json"),
			createOpenAIProfile(WORK_ACCOUNT_ID),
		);
		await writeJson(
			join(paths.profileDirectoryPath, "openai-account-2.json"),
			createOpenAIProfile(PERSONAL_ACCOUNT_ID),
		);

		// when
		const action = () => renameOpenAIProfile(paths, "account-1", "account-2");

		// then
		await expect(action).rejects.toThrow("Profile already exists: account-2");
	});

	test("should reject malformed OpenAI auth profiles", () => {
		// given
		const malformedProfile = {
			type: "api",
			key: "api-key",
		};

		// when
		const action = () => parseOpenAIAuthProfile(malformedProfile);

		// then
		expect(action).toThrow("OpenAI auth profile must be an oauth profile");
	});

	test("should return a copy with only OpenAI auth replaced", () => {
		// given
		const selectedProfile = createOpenAIProfile(PERSONAL_ACCOUNT_ID);
		const ANTHROPIC_AUTH = { type: "oauth", refresh: "anthropic-refresh" };
		const authJson: AuthJson = {
			anthropic: ANTHROPIC_AUTH,
			openai: createOpenAIProfile(WORK_ACCOUNT_ID),
		};

		// when
		const result = replaceOpenAIAuthProfile(authJson, selectedProfile);

		// then
		expect(result.openai).toEqual(selectedProfile);
		expect(result.anthropic).toEqual(ANTHROPIC_AUTH);
	});
});

async function createTestPaths(): Promise<OpenCodeAuthPaths> {
	const temporaryDirectoryPath = await mkdtemp(
		join(tmpdir(), "opencode-openai-profiles-"),
	);
	const profileDirectoryPath = join(temporaryDirectoryPath, "auth-profiles");
	await mkdir(profileDirectoryPath, { recursive: true });

	return {
		authFilePath: join(temporaryDirectoryPath, "auth.json"),
		profileDirectoryPath,
	};
}

async function writeJson(filePath: string, value: unknown): Promise<void> {
	await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, {
		mode: AUTH_FILE_MODE,
	});
}

function createOpenAIProfile(accountId: string): OpenAIAuthProfile {
	return {
		type: "oauth",
		refresh: `${accountId}-refresh-token`,
		access: `${accountId}-access-token`,
		expires: 1_779_612_587_567,
		accountId,
	};
}
