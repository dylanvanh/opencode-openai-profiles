import { homedir } from "node:os";
import { join } from "node:path";

export const OPENAI_PROVIDER_ID = "openai";
export const PROFILE_FILE_PREFIX = `${OPENAI_PROVIDER_ID}-`;
export const PROFILE_FILE_EXTENSION = ".json";

export type OpenCodeAuthPaths = {
	authFilePath: string;
	profileDirectoryPath: string;
};

export function getOpenCodeAuthPaths(
	environment: NodeJS.ProcessEnv = process.env,
): OpenCodeAuthPaths {
	const xdgDataHome = environment.XDG_DATA_HOME?.trim();
	const dataHomePath =
		xdgDataHome && xdgDataHome.length > 0
			? xdgDataHome
			: join(homedir(), ".local", "share");
	const opencodeDataPath = join(dataHomePath, "opencode");

	return {
		authFilePath: join(opencodeDataPath, "auth.json"),
		profileDirectoryPath: join(opencodeDataPath, "auth-profiles"),
	};
}

export function getProfileFileName(profileName: string): string {
	return `${PROFILE_FILE_PREFIX}${profileName}${PROFILE_FILE_EXTENSION}`;
}
