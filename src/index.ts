import { spawn } from "node:child_process";
import type { Plugin } from "@opencode-ai/plugin";
import type { TuiDialogSelectOption, TuiPlugin, TuiPluginApi } from "@opencode-ai/plugin/tui";
import {
  authFileExists,
  getActiveOpenAIProfile,
  listOpenAIProfiles,
  openProfilesFolder,
  saveActiveOpenAIProfile,
  switchActiveOpenAIProfile,
  type SavedProfile,
} from "./auth-store.js";
import { getOpenCodeAuthPaths } from "./paths.js";

const PLUGIN_ID = "opencode-openai-account-switcher";
const TUI_COMMAND_NAME = "openai-account.open";
const COMMAND_NAME = "openai-account";
const COMMAND_ALIAS = "oa";
const FALLBACK_COMMAND_NAME = "openai-account-cli";
const RESTART_MESSAGE = "Restart opencode for the change to take effect.";
const OPENAI_BROWSER_LOGIN_METHOD_LABEL = "ChatGPT Pro/Plus (browser)";

type MainAction = "switch" | "save" | "login" | "show-active" | "open-folder";
type TuiCommandLayerApi = TuiPluginApi & {
  keymap: {
    registerLayer(layer: {
      commands: Array<{
        name: string;
        title: string;
        description?: string;
        category?: string;
        namespace: "palette";
        slashName?: string;
        slashAliases?: string[];
        run: () => void | Promise<void>;
      }>;
      bindings?: Array<{ key: string; cmd: string; desc?: string }>;
    }): () => void;
  };
};

export const id = PLUGIN_ID;

export const OpenAIAccountSwitcherPlugin: Plugin = async (ctx) => {
  return {
    "command.execute.before": async (input, output) => {
      if (input.command !== COMMAND_NAME && input.command !== FALLBACK_COMMAND_NAME) {
        return;
      }

      const message = await handleServerCommand(ctx, input.arguments);
      output.parts.splice(0, output.parts.length, {
        type: "text",
        text: `OpenAI account command handled locally. Report this result to the user exactly: ${message}`,
      } as never);
    },
  };
};

export default OpenAIAccountSwitcherPlugin;

export const tui = async (inputApi: TuiPluginApi | Record<string, unknown>): Promise<void> => {
  if (!isTuiPluginApi(inputApi)) {
    return;
  }

  const api = inputApi;
  const paths = getOpenCodeAuthPaths();

  function showToast(variant: "info" | "success" | "warning" | "error", message: string, title = "OpenAI Account"): void {
    api.ui.toast({
      variant,
      title,
      message,
    });
  }

  function showError(error: unknown): void {
    showToast("error", error instanceof Error ? error.message : "Unknown error");
  }

  async function runSafely(action: () => Promise<void>): Promise<void> {
    try {
      await action();
    } catch (error) {
      showError(error);
    }
  }

  function showMainDialog(): void {
    const options: TuiDialogSelectOption<MainAction>[] = [
      {
        title: "Switch Profile",
        value: "switch",
        description: "Activate a saved OpenAI account profile",
      },
      {
        title: "Save Current Profile",
        value: "save",
        description: "Save the currently active OpenAI account",
      },
      {
        title: "Login to OpenAI",
        value: "login",
        description: "Start OpenCode's ChatGPT Pro/Plus browser login",
      },
      {
        title: "Show Active Account",
        value: "show-active",
        description: "Show the active OpenAI account ID",
      },
      {
        title: "Open Profiles Folder",
        value: "open-folder",
        description: "Open the local folder containing saved profiles",
      },
    ];

    api.ui.dialog.replace(() =>
      api.ui.DialogSelect({
        title: "OpenAI Account",
        options,
        onSelect: (option) => {
          api.ui.dialog.clear();

          if (option.value === "switch") {
            void runSafely(showSwitchProfileDialog);
            return;
          }

          if (option.value === "save") {
            showSaveProfileDialog();
            return;
          }

          if (option.value === "login") {
            void runSafely(startOpenAIBrowserLogin);
            return;
          }

          if (option.value === "show-active") {
            void runSafely(showActiveAccount);
            return;
          }

          void runSafely(openProfileDirectory);
        },
      }),
    );
  }

  async function showSwitchProfileDialog(): Promise<void> {
    const savedProfiles = await listOpenAIProfiles(paths);

    if (savedProfiles.length === 0) {
      showToast("warning", "No saved OpenAI profiles found. Save the current profile first.");
      return;
    }

    api.ui.dialog.replace(() =>
      api.ui.DialogSelect({
        title: "Switch OpenAI Profile",
        options: savedProfiles.map((profile) => ({
          title: profile.name,
          value: profile,
          description: formatAccountIdDescription(profile.accountId),
        })),
        onSelect: (option) => {
          api.ui.dialog.clear();
          void runSafely(async () => {
            const switchedProfile = await switchActiveOpenAIProfile(paths, option.value.name);
            showToast("success", `Switched to ${switchedProfile.name}. ${RESTART_MESSAGE}`);
          });
        },
      }),
    );
  }

  function showSaveProfileDialog(): void {
    api.ui.dialog.replace(() =>
      api.ui.DialogPrompt({
        title: "Save Current OpenAI Profile",
        placeholder: "work",
        onConfirm: (profileName) => {
          api.ui.dialog.clear();
          void runSafely(async () => {
            const savedProfile = await saveActiveOpenAIProfile(paths, profileName);
            showToast("success", `Saved ${savedProfile.name}.`);
          });
        },
        onCancel: () => {
          api.ui.dialog.clear();
        },
      }),
    );
  }

  async function showActiveAccount(): Promise<void> {
    if (!(await authFileExists(paths))) {
      showToast("warning", "No opencode auth.json found. Log in to OpenAI first.");
      return;
    }

    const activeProfile = await getActiveOpenAIProfile(paths);
    showToast("info", formatAccountIdDescription(activeProfile.accountId));
  }

  async function startOpenAIBrowserLogin(): Promise<void> {
    const authMethodsResult = await api.client.provider.auth({
      directory: api.state.path.directory,
    });

    if (authMethodsResult.error || !authMethodsResult.data) {
      throw new Error("Unable to load OpenAI login methods");
    }

    const openAIAuthMethods = authMethodsResult.data.openai ?? [];
    const browserMethodIndex = openAIAuthMethods.findIndex((method) => method.label === OPENAI_BROWSER_LOGIN_METHOD_LABEL);

    if (browserMethodIndex === -1) {
      const availableMethods = openAIAuthMethods.map((method) => method.label).join(", ") || "none";

      throw new Error(`OpenAI browser login method not found. Available: ${availableMethods}`);
    }

    const authorizationResult = await api.client.provider.oauth.authorize({
      providerID: "openai",
      directory: api.state.path.directory,
      method: browserMethodIndex,
    });

    if (authorizationResult.error) {
      throw new Error("Unable to start OpenAI login");
    }

    openPathOrUrl(authorizationResult.data.url);
    showToast("info", "Opened OpenAI login. After login completes, save the current profile as personal.");
  }

  async function openProfileDirectory(): Promise<void> {
    await openProfilesFolder(paths);
    openPathOrUrl(paths.profileDirectoryPath);
    showToast("info", paths.profileDirectoryPath);
  }

  const unregisterCommandLayer = api.keymap.registerLayer({
    commands: [
      {
        name: TUI_COMMAND_NAME,
        title: "OpenAI Account",
        description: "Switch saved OpenAI ChatGPT account profiles",
        category: "OpenAI",
        namespace: "palette",
        slashName: COMMAND_NAME,
        slashAliases: [COMMAND_ALIAS],
        run: showMainDialog,
      },
    ],
  });

  api.lifecycle.onDispose(unregisterCommandLayer);
};

function isTuiPluginApi(api: TuiPluginApi | Record<string, unknown>): api is TuiCommandLayerApi {
  if (!("keymap" in api) || typeof api.keymap !== "object" || api.keymap === null) {
    return false;
  }

  return "registerLayer" in api.keymap && typeof api.keymap.registerLayer === "function";
}

const _typecheckTuiPlugin: TuiPlugin = tui as TuiPlugin;
void _typecheckTuiPlugin;

function formatAccountIdDescription(accountId: string | undefined): string {
  return accountId ? `Account ID: ${accountId}` : "Account ID unavailable";
}

async function handleServerCommand(ctx: Parameters<Plugin>[0], rawArguments: string): Promise<string> {
  const paths = getOpenCodeAuthPaths();
  const [action, profileName] = rawArguments.trim().split(/\s+/, 2);

  try {
    if (!action || action === "help") {
      const message = "Usage: /openai-account save <name> | switch <name> | list | active | login";
      await showServerToast(ctx, "info", message);
      return message;
    }

    if (action === "save") {
      if (!profileName) {
        throw new Error("Usage: /openai-account save <name>");
      }

      const savedProfile = await saveActiveOpenAIProfile(paths, profileName);
      const message = `Saved ${savedProfile.name}.`;
      await showServerToast(ctx, "success", message);
      return message;
    }

    if (action === "switch") {
      if (!profileName) {
        throw new Error("Usage: /openai-account switch <name>");
      }

      const switchedProfile = await switchActiveOpenAIProfile(paths, profileName);
      const message = `Switched to ${switchedProfile.name}. ${RESTART_MESSAGE}`;
      await showServerToast(ctx, "success", message);
      return message;
    }

    if (action === "list") {
      const profiles = await listOpenAIProfiles(paths);
      const profileNames = profiles.map((profile) => profile.name).join(", ") || "none";
      const message = `Saved profiles: ${profileNames}`;
      await showServerToast(ctx, "info", message);
      return message;
    }

    if (action === "active") {
      const activeProfile = await getActiveOpenAIProfile(paths);
      const message = formatAccountIdDescription(activeProfile.accountId);
      await showServerToast(ctx, "info", message);
      return message;
    }

    if (action === "login") {
      return await startServerOpenAIBrowserLogin(ctx);
    }

    throw new Error(`Unknown action: ${action}`);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    await showServerToast(ctx, "error", message);
    return message;
  }
}

async function startServerOpenAIBrowserLogin(ctx: Parameters<Plugin>[0]): Promise<string> {
  const client = ctx.client as unknown as {
    provider: {
      auth(parameters?: { directory?: string }): Promise<{ data?: Record<string, Array<{ label: string }>>; error?: unknown }>;
      oauth: {
        authorize(parameters: { providerID: string; directory?: string; method: number }): Promise<{ data?: { url: string }; error?: unknown }>;
      };
    };
  };
  const authMethodsResult = await client.provider.auth({ directory: ctx.directory });

  if (authMethodsResult.error || !authMethodsResult.data) {
    throw new Error("Unable to load OpenAI login methods");
  }

  const openAIAuthMethods = authMethodsResult.data.openai ?? [];
  const browserMethodIndex = openAIAuthMethods.findIndex((method) => method.label === OPENAI_BROWSER_LOGIN_METHOD_LABEL);

  if (browserMethodIndex === -1) {
    const availableMethods = openAIAuthMethods.map((method) => method.label).join(", ") || "none";

    throw new Error(`OpenAI browser login method not found. Available: ${availableMethods}`);
  }

  const authorizationResult = await client.provider.oauth.authorize({
    providerID: "openai",
    directory: ctx.directory,
    method: browserMethodIndex,
  });

  if (authorizationResult.error || !authorizationResult.data) {
    throw new Error("Unable to start OpenAI login");
  }

  openPathOrUrl(authorizationResult.data.url);
  const message = "Opened OpenAI login. After login completes, run /openai-account save personal.";
  await showServerToast(ctx, "info", message);
  return message;
}

async function showServerToast(
  ctx: Parameters<Plugin>[0],
  variant: "info" | "success" | "warning" | "error",
  message: string,
): Promise<void> {
  const client = ctx.client as unknown as {
    tui?: {
      showToast(parameters?: { directory?: string; title?: string; message?: string; variant?: "info" | "success" | "warning" | "error" }): Promise<unknown>;
    };
    app: {
      log(parameters?: { level?: "debug" | "info" | "error" | "warn"; message?: string }): Promise<unknown>;
    };
  };

  if (client.tui) {
    await client.tui.showToast({
      directory: ctx.directory,
      title: "OpenAI Account",
      message,
      variant,
    });
    return;
  }

  await client.app.log({
    level: variant === "error" ? "error" : "info",
    message,
  });
}

function openPathOrUrl(pathOrUrl: string): void {
  const command = getOpenCommand(pathOrUrl);
  const childProcess = spawn(command.executable, command.args, {
    detached: true,
    stdio: "ignore",
  });

  childProcess.on("error", () => undefined);
  childProcess.unref();
}

function getOpenCommand(pathOrUrl: string): { executable: string; args: string[] } {
  if (process.platform === "darwin") {
    return {
      executable: "open",
      args: [pathOrUrl],
    };
  }

  if (process.platform === "win32") {
    return {
      executable: "explorer",
      args: [pathOrUrl],
    };
  }

  return {
    executable: "xdg-open",
    args: [pathOrUrl],
  };
}
