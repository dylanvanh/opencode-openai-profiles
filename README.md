# opencode-openai-account-switcher

OpenCode TUI plugin for switching between saved OpenAI ChatGPT Plus/Pro OAuth profiles.

OpenCode currently has one active `openai` auth slot. This plugin keeps named local copies of that OpenAI auth object and swaps one into the active `auth.json` when selected.

## Status

Early local-first plugin. Restart OpenCode after switching profiles.

## Install

From this repo during development:

```bash
pnpm install
pnpm build
```

For local testing before publishing, build the plugin and place or symlink `dist/index.js` into one of OpenCode's plugin directories:

```text
~/.config/opencode/plugins/
.opencode/plugins/
```

Once published, use the server command fallback:

```json
{
  "plugin": ["opencode-openai-account-switcher"]
}
```

For OpenCode versions that support external TUI plugin targets, the package also exposes:

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
/openai-account-cli login
```

## First-Time Setup

If your current active OpenAI account is work:

```text
/openai-account
```

Then choose `Save Current Profile` and enter `work`.

Then log in to your personal account once from the plugin:

```text
/openai-account
```

Then choose `Login to OpenAI`.

Or use the CLI directly:

```bash
opencode auth login --provider openai --method "ChatGPT Pro/Plus (browser)"
```

Restart OpenCode, then save the personal account:

```text
/openai-account
```

Then choose `Save Current Profile` and enter `personal`.

After that, switch with:

```text
/openai-account
```

Then choose `Switch Profile` and select `work` or `personal`.

If the dialog is unavailable, use:

```text
/openai-account-cli switch work
/openai-account-cli switch personal
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
openai-work.json
openai-personal.json
```

Each profile file contains only the `openai` OAuth object. Other providers in `auth.json` are preserved.

## Security Notes

The profile files contain OAuth tokens. Treat them as secrets.

Do not commit `auth.json` or `auth-profiles`.

This plugin never displays token values. It only shows the OpenAI `accountId` when available.
