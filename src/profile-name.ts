const PROFILE_NAME_PATTERN = /^[a-zA-Z0-9_-]+$/;

export function parseProfileName(input: string): string {
	const profileName = input.trim();

	if (profileName.length === 0) {
		throw new Error("Profile name is required");
	}

	if (!PROFILE_NAME_PATTERN.test(profileName)) {
		throw new Error("Use only letters, numbers, underscores, or hyphens");
	}

	return profileName;
}
