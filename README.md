# opencode-openai-account-switcher

OpenCode TUI plugin for switching between saved OpenAI ChatGPT Pro/Plus OAuth profiles.

OpenCode currently has one active `openai` auth slot. This plugin keeps named local copies of that OpenAI auth object and swaps one into the active `auth.json` when selected.

## Status

Early local-first plugin. Restart OpenCode after switching profiles.

## Install

From this repo during development:

```bash
pnpm install
pnpm build
```

For local testing before publishing, install the package with OpenCode:

```bash
opencode plugin "$PWD" --global --force
```

This adds the package to OpenCode's server and TUI plugin configs when both targets are available.

Once published, install the package with OpenCode or configure the server target directly:

```json
{
  "plugin": ["opencode-openai-account-switcher"]
}
```

For OpenCode versions that support external TUI plugin targets, configure the TUI target directly:

```json
{
  "plugin": ["opencode-openai-account-switcher/tui"]
}
```

## Usage

Run the slash command in OpenCode:

```text
/openai-account
```

Alias:

```text
/oa
```

If the TUI plugin target is available, `/openai-account` opens a native picker dialog.

Fallback command syntax:

```text
/openai-account-cli save <name>
/openai-account-cli switch <name>
/openai-account-cli list
/openai-account-cli active
/openai-account-cli login [browser|headless]
```

## First-Time Setup

If your current active OpenAI account is the first account you want to save:

```text
/openai-account
```

Then choose `Save Current Profile` and enter `account-1` or any profile name you prefer.

Then log in to another account once from the plugin:

```text
/openai-account
```

Then choose `Login to OpenAI` and select `ChatGPT Pro/Plus (headless)` if you want to paste the final callback URL manually.

Or use the CLI directly:

```bash
opencode auth login --provider openai --method "ChatGPT Pro/Plus (browser)"
opencode auth login --provider openai --method "ChatGPT Pro/Plus (headless)"
```

Restart OpenCode, then save the newly active account:

```text
/openai-account
```

Then choose `Save Current Profile` and enter `account-2` or any profile name you prefer.

After that, switch with:

```text
/openai-account
```

Then choose `Switch Profile` and select one of your saved profile names.

If the dialog is unavailable, use:

```text
/openai-account-cli switch account-1
/openai-account-cli switch account-2
```

Restart OpenCode after switching.

## Storage

Active OpenCode auth remains here:

```text
~/.local/share/opencode/auth.json
```

Saved OpenAI profiles are stored here:

```text
~/.local/share/opencode/auth-profiles/
```

Example files:

```text
openai-account-1.json
openai-account-2.json
```

Each profile file contains only the `openai` OAuth object. Other providers in `auth.json` are preserved.

## Security Notes

The profile files contain OAuth tokens. Treat them as secrets.

Do not commit `auth.json` or `auth-profiles`.

This plugin never displays token values. It only shows the OpenAI `accountId` when available.
