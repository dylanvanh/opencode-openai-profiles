# opencode-openai-profiles

OpenCode TUI plugin for switching between saved OpenAI ChatGPT Pro/Plus OAuth profiles.

OpenCode has one active `openai` auth slot. This plugin saves named copies of that auth object and swaps one into `auth.json` when you switch profiles.

## Status

Early local-first plugin. Restart OpenCode after switching profiles.

## Install

Build from this repo:

```bash
pnpm install
pnpm build
```

Install the local plugin:

```bash
opencode plugin "$PWD" --global --force
```

The command adds the package to OpenCode's server and TUI plugin configs when OpenCode exposes both targets.

After publishing, add the package to your OpenCode config:

```json
{
  "plugin": ["opencode-openai-profiles"]
}
```

For OpenCode versions with external TUI plugin targets, add the TUI target:

```json
{
  "plugin": ["opencode-openai-profiles/tui"]
}
```

## Usage

Open the account picker:

```text
/openai-profiles
```

Short alias:

```text
/oa
```

If the TUI target is unavailable, use the CLI fallback:

```text
/openai-account-cli save <name>
/openai-account-cli switch <name>
/openai-account-cli rename <old> <new>
/openai-account-cli list
/openai-account-cli active
/openai-account-cli login [browser|headless]
```

## First Setup

Save your current OpenAI account:

```text
/openai-profiles
```

Choose `Save Current Profile`, then enter `account-1` or another name.

If you skip this step, the plugin saves the active unsaved account as `account-1` before starting a new OpenAI login.

Log in to another account:

```text
/openai-profiles
```

Choose `Login to OpenAI`. Select `ChatGPT Pro/Plus (headless)` if you want to paste the final callback URL by hand.

CLI fallback:

```text
/openai-account-cli login browser
/openai-account-cli login headless
```

Restart OpenCode, then save the new active account:

```text
/openai-profiles
```

Choose `Save Current Profile`, then enter `account-2` or another name.

Switch profiles:

```text
/openai-profiles
```

Choose `Switch Profile`, then select a saved profile.

CLI fallback:

```text
/openai-account-cli switch account-1
/openai-account-cli switch account-2
```

Restart OpenCode after switching.

## Storage

OpenCode stores the active auth file here:

```text
~/.local/share/opencode/auth.json
```

This plugin stores saved OpenAI profiles here:

```text
~/.local/share/opencode/auth-profiles/
```

Example files:

```text
openai-account-1.json
openai-account-2.json
```

Each profile file contains only the `openai` OAuth object. The plugin preserves other providers in `auth.json`.

## Security

Profile files contain OAuth tokens. Treat them as secrets.

Do not commit `auth.json` or `auth-profiles`.

The plugin never displays token values. It only shows the OpenAI `accountId` when available.
