# opencode-openai-profiles

OpenCode TUI plugin for switching between saved OpenAI ChatGPT Pro/Plus OAuth profiles.

OpenCode has one active `openai` auth slot. This plugin saves named copies of that auth object and swaps one into `auth.json` when you switch profiles.

## Status

Early local-first plugin. Profile switches apply live when your OpenCode version supports runtime auth updates.

## Install

Package: [opencode-openai-profiles](https://www.npmjs.com/package/opencode-openai-profiles)

Install globally:

```bash
opencode plugin opencode-openai-profiles@latest --global
```

This installs the package and adds it to OpenCode's server and TUI plugin configs when OpenCode exposes both targets.

Manual config alternative:

```json
{
  "plugin": ["opencode-openai-profiles@latest"]
}
```

For local development, build from this repo:

```bash
pnpm install
pnpm build
```

Install the local plugin:

```bash
opencode plugin "$PWD" --global --force
```

## Usage

Open the account picker:

```text
/openai-profiles
```

For direct commands, use `/openai-profiles-cli`:

```text
/openai-profiles-cli save <name>
/openai-profiles-cli switch <name>
/openai-profiles-cli rename <old> <new>
/openai-profiles-cli list
/openai-profiles-cli active
/openai-profiles-cli login [browser|headless]
/openai-profiles-cli complete <callback-url-or-code>
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

Direct command:

```text
/openai-profiles-cli login browser
/openai-profiles-cli login headless
```

For direct headless login, open the returned URL, copy the final callback URL from the browser address bar, then run:

```text
/openai-profiles-cli complete <callback-url-or-code>
```

If OpenCode prompts you to restart after login, restart it before saving the new active account:

```text
/openai-profiles
```

Choose `Save Current Profile`, then enter `account-2` or another name.

Switch profiles:

```text
/openai-profiles
```

Choose `Switch Profile`, then select a saved profile.

If OpenCode cannot apply the switch live, the plugin will tell you to restart.

Direct command:

```text
/openai-profiles-cli switch account-1
/openai-profiles-cli switch account-2
```

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
