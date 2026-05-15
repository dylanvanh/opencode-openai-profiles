import { spawn } from "node:child_process";
import type { Plugin } from "@opencode-ai/plugin";
import type { TuiDialogSelectOption, TuiPlugin, TuiPluginApi } from "@opencode-ai/plugin/tui";
import {
  authFileExists,
  getActiveOpenAIProfile,
  listOpenAIProfiles,
  openProfilesFolder,
  renameOpenAIProfile,
  saveActiveOpenAIProfile,
  saveActiveOpenAIProfileIfUnsaved,
  setActiveOpenAIProfile,
  switchActiveOpenAIProfile,
  type SavedProfile,
} from "./auth-store.js";
import { completeManualCodexLogin, createManualCodexLogin, type ManualCodexLogin } from "./codex-oauth.js";
import {
  findOpenAIAuthMethodIndex,
  OPENAI_BROWSER_LOGIN_METHOD_LABEL,
  OPENAI_HEADLESS_LOGIN_METHOD_LABEL,
  parseOpenAIAuthMethodPreference,
  type OpenAIAuthMethod,
} from "./openai-auth-method.js";
import { getOpenCodeAuthPaths, OPENAI_PROVIDER_ID } from "./paths.js";

const PLUGIN_ID = "opencode-openai-profiles";
const TUI_COMMAND_NAME = "openai-profiles.open";
const COMMAND_NAME = "openai-profiles";
const COMMAND_ALIAS = "oa";
const FALLBACK_COMMAND_NAME = "openai-account-cli";
const RESTART_MESSAGE = "Restart opencode for the change to take effect.";
const OPENAI_ACCOUNT_TOAST_TITLE = "OpenAI Account";

type MainAction = "switch" | "save" | "rename" | "login" | "show-active" | "open-folder";
type SelectedOpenAIAuthMethod = { index: number; label: string };
type OpenAIAuthAuthorization = { url: string; method: "auto" | "code"; instructions: string };
type ServerProviderClient = {
  provider: {
    auth(parameters?: { directory?: string }): Promise<{ data?: Record<string, OpenAIAuthMethod[]>; error?: unknown }>;
    oauth: {
      authorize(parameters: {
        providerID: string;
        directory?: string;
        method: number;
      }): Promise<{ data?: OpenAIAuthAuthorization; error?: unknown }>;
    };
  };
};
type ServerToastClient = {
  tui?: {
    showToast(parameters?: {
      directory?: string;
      title?: string;
      message?: string;
      variant?: "info" | "success" | "warning" | "error";
    }): Promise<unknown>;
  };
  app: {
    log(parameters?: { level?: "debug" | "info" | "error" | "warn"; message?: string }): Promise<unknown>;
  };
};
type TuiCommandLayer = {
  commands: Array<{
    name: string;
    title: string;
    desc?: string;
    description?: string;
    category?: string;
    namespace: "palette";
    slashName?: string;
    slashAliases?: string[];
    slash?: { name: string; aliases?: string[] };
    run: () => void | Promise<void>;
  }>;
  bindings?: Array<{ key: string; cmd: string; desc?: string }>;
};

type TuiCommandLayerApi = TuiPluginApi & {
  keymap?: {
    registerLayer?: (layer: TuiCommandLayer) => () => void;
  };
};

export const id = PLUGIN_ID;

export const OpenAIAccountSwitcherPlugin: Plugin = async (ctx) => {
  return {
    "command.execute.before": async (input, output) => {
      if (input.command !== FALLBACK_COMMAND_NAME) {
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

  function showToast(variant: "info" | "success" | "warning" | "error", message: string, title = OPENAI_ACCOUNT_TOAST_TITLE): void {
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
        description: "Use saved profile",
      },
      {
        title: "Save Current Profile",
        value: "save",
        description: "Save active account",
      },
      {
        title: "Rename Profile",
        value: "rename",
        description: "Edit profile name",
      },
      {
        title: "Login to OpenAI",
        value: "login",
        description: "Add another account",
      },
      {
        title: "Show Active Account",
        value: "show-active",
        description: "Current account ID",
      },
      {
        title: "Open Profiles Folder",
        value: "open-folder",
        description: "Saved profile files",
      },
    ];

    api.ui.dialog.replace(() =>
      api.ui.DialogSelect({
        title: OPENAI_ACCOUNT_TOAST_TITLE,
        options,
        onSelect: (option) => {
          api.ui.dialog.clear();

          if (option.value === "switch") {
            void runSafely(showSwitchProfileDialog);
            return;
          }

          if (option.value === "save") {
            void runSafely(showSaveProfileDialog);
            return;
          }

          if (option.value === "rename") {
            void runSafely(showRenameProfileDialog);
            return;
          }

          if (option.value === "login") {
            void runSafely(showLoginMethodDialog);
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
          description: formatTuiAccountIdDescription(profile.accountId),
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

  async function showSaveProfileDialog(): Promise<void> {
    const placeholder = await getNextProfileNamePlaceholder();

    api.ui.dialog.replace(() =>
      api.ui.DialogPrompt({
        title: "Save Current OpenAI Profile",
        placeholder,
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

  async function showRenameProfileDialog(): Promise<void> {
    const savedProfiles = await listOpenAIProfiles(paths);

    if (savedProfiles.length === 0) {
      showToast("warning", "No saved OpenAI profiles found.");
      return;
    }

    api.ui.dialog.replace(() =>
      api.ui.DialogSelect({
        title: "Rename OpenAI Profile",
        options: savedProfiles.map((profile) => ({
          title: profile.name,
          value: profile,
          description: formatTuiAccountIdDescription(profile.accountId),
        })),
        onSelect: (option) => {
          showRenameProfilePrompt(option.value);
        },
      }),
    );
  }

  function showRenameProfilePrompt(profile: SavedProfile): void {
    api.ui.dialog.replace(() =>
      api.ui.DialogPrompt({
        title: `Rename ${profile.name}`,
        placeholder: profile.name,
        onConfirm: (nextName) => {
          api.ui.dialog.clear();
          void runSafely(async () => {
            const renamedProfile = await renameOpenAIProfile(paths, profile.name, nextName);
            showToast("success", `Renamed ${profile.name} to ${renamedProfile.name}.`);
          });
        },
        onCancel: () => {
          api.ui.dialog.clear();
        },
      }),
    );
  }

  async function getNextProfileNamePlaceholder(): Promise<string> {
    const savedProfiles = await listOpenAIProfiles(paths);
    const usedProfileNames = new Set(savedProfiles.map((profile) => profile.name));
    let nextProfileIndex = 1;

    while (usedProfileNames.has(`account-${nextProfileIndex}`)) {
      nextProfileIndex += 1;
    }

    return `account-${nextProfileIndex}`;
  }

  async function showActiveAccount(): Promise<void> {
    if (!(await authFileExists(paths))) {
      showToast("warning", "No opencode auth.json found. Log in to OpenAI first.");
      return;
    }

    const activeProfile = await getActiveOpenAIProfile(paths);
    const savedProfileDescription = await getSavedProfileDescription(paths, activeProfile.accountId);

    showToast("info", `${savedProfileDescription}\n${formatAccountIdDescription(activeProfile.accountId)}`);
  }

  async function showLoginMethodDialog(): Promise<void> {
    await saveCurrentProfileBeforeLogin();

    const authMethodsResult = await api.client.provider.auth({
      directory: api.state.path.directory,
    });

    if (authMethodsResult.error || !authMethodsResult.data) {
      throw new Error("Unable to load OpenAI login methods");
    }

    const openAIAuthMethods = authMethodsResult.data[OPENAI_PROVIDER_ID] ?? [];

    if (openAIAuthMethods.length === 0) {
      throw new Error("No OpenAI login methods found");
    }

    api.ui.dialog.replace(() =>
      api.ui.DialogSelect({
        title: "OpenAI Login Method",
        options: openAIAuthMethods.map((method, index) => {
          const option: TuiDialogSelectOption<SelectedOpenAIAuthMethod> = {
            title: method.label,
            value: { index, label: method.label },
          };

          if (method.label === OPENAI_HEADLESS_LOGIN_METHOD_LABEL) {
            option.description = "For account mixups";
          }

          return option;
        }),
        onSelect: (option) => {
          api.ui.dialog.clear();
          void runSafely(async () => startOpenAILogin(option.value));
        },
      }),
    );
  }

  async function saveCurrentProfileBeforeLogin(): Promise<void> {
    const savedProfile = await saveActiveOpenAIProfileIfUnsaved(paths);

    if (savedProfile) {
      showToast("success", `Saved current profile as ${savedProfile.name} before login.`);
    }
  }

  async function startOpenAILogin(method: SelectedOpenAIAuthMethod): Promise<void> {
    if (method.label === OPENAI_HEADLESS_LOGIN_METHOD_LABEL) {
      const login = await createManualCodexLogin();
      showManualCallbackLoginDialog(login);
      return;
    }

    const authorizationResult = await api.client.provider.oauth.authorize({
      providerID: OPENAI_PROVIDER_ID,
      directory: api.state.path.directory,
      method: method.index,
    });

    if (authorizationResult.error || !authorizationResult.data) {
      throw new Error("Unable to start OpenAI login");
    }

    if (authorizationResult.data.method === "code" || method.label === OPENAI_HEADLESS_LOGIN_METHOD_LABEL) {
      showHeadlessLoginInstructions(method.label, authorizationResult.data);
      void runSafely(async () => completeOpenAILogin(method.index));
      return;
    }

    openPathOrUrl(authorizationResult.data.url);
    showToast("info", "Opened OpenAI login. Keep opencode open until login completes.");
    void runSafely(async () => completeOpenAILogin(method.index));
  }

  function showManualCallbackLoginDialog(login: ManualCodexLogin): void {
    api.ui.dialog.replace(() =>
      api.ui.DialogAlert({
        title: "Headless OpenAI Login",
        message: `Open this URL in the browser account you want to save:\n\n${login.url}\n\nAfter ChatGPT redirects to localhost, copy the full URL from the browser address bar and press OK.`,
        onConfirm: () => showManualCallbackPrompt(login),
      }),
    );
  }

  function showManualCallbackPrompt(login: ManualCodexLogin): void {
    api.ui.dialog.replace(() =>
      api.ui.DialogPrompt({
        title: "Paste OpenAI Callback URL",
        placeholder: "http://localhost:1455/auth/callback?code=...",
        onConfirm: (callbackUrlOrCode) => {
          api.ui.dialog.clear();
          void runSafely(async () => {
            const activeProfile = await completeManualCodexLogin(login, callbackUrlOrCode);
            await setActiveOpenAIProfile(paths, activeProfile);
            showToast("success", "OpenAI login complete.");
            await showSaveProfileDialog();
          });
        },
        onCancel: () => {
          api.ui.dialog.clear();
        },
      }),
    );
  }

  async function completeOpenAILogin(methodIndex: number): Promise<void> {
    const callbackResult = await api.client.provider.oauth.callback({
      providerID: OPENAI_PROVIDER_ID,
      method: methodIndex,
    });

    if (callbackResult.error) {
      throw new Error("OpenAI login did not complete");
    }

    showToast("success", "OpenAI login complete.");
    await showSaveProfileDialog();
  }

  function showHeadlessLoginInstructions(methodLabel: string, authorization: OpenAIAuthAuthorization): void {
    api.ui.dialog.replace(() =>
      api.ui.DialogAlert({
        title: methodLabel,
        message: `${authorization.url}\n\n${authorization.instructions}\n\nWaiting for authorization...\n\nKeep opencode open until login completes. You will be prompted to save the profile.`,
      }),
    );
  }

  async function openProfileDirectory(): Promise<void> {
    await openProfilesFolder(paths);
    openPathOrUrl(paths.profileDirectoryPath);
    showToast("info", paths.profileDirectoryPath);
  }

  const unregisterCallbacks: Array<() => void> = [];
  const commandLayer: TuiCommandLayer = {
    commands: [
      {
        name: TUI_COMMAND_NAME,
        title: OPENAI_ACCOUNT_TOAST_TITLE,
        desc: "Switch saved OpenAI ChatGPT account profiles",
        description: "Switch saved OpenAI ChatGPT account profiles",
        category: "OpenAI",
        namespace: "palette",
        slashName: COMMAND_NAME,
        slashAliases: [COMMAND_ALIAS],
        slash: {
          name: COMMAND_NAME,
          aliases: [COMMAND_ALIAS],
        },
        run: showMainDialog,
      },
    ],
  };

  const unregisterCommandLayer = api.keymap?.registerLayer?.(commandLayer);

  if (unregisterCommandLayer) {
    unregisterCallbacks.push(unregisterCommandLayer);
  }

  const unregisterLegacyCommand = api.command?.register(() => [
    {
      title: OPENAI_ACCOUNT_TOAST_TITLE,
      value: TUI_COMMAND_NAME,
      description: "Switch saved OpenAI ChatGPT account profiles",
      category: "OpenAI",
      slash: {
        name: COMMAND_NAME,
        aliases: [COMMAND_ALIAS],
      },
      onSelect: showMainDialog,
    },
  ]);

  if (unregisterLegacyCommand) {
    unregisterCallbacks.push(unregisterLegacyCommand);
  }

  api.lifecycle.onDispose(() => {
    for (const unregisterCallback of unregisterCallbacks) {
      unregisterCallback();
    }
  });
};

function isTuiPluginApi(api: TuiPluginApi | Record<string, unknown>): api is TuiCommandLayerApi {
  return "ui" in api && "lifecycle" in api;
}

const _typecheckTuiPlugin: TuiPlugin = tui as TuiPlugin;
void _typecheckTuiPlugin;

function formatAccountIdDescription(accountId: string | undefined): string {
  return accountId ? `Account ID: ${accountId}` : "Account ID unavailable";
}

function formatTuiAccountIdDescription(accountId: string | undefined): string {
  if (!accountId) {
    return "ID unavailable";
  }

  if (accountId.length <= 18) {
    return `ID: ${accountId}`;
  }

  return `ID: ${accountId.slice(0, 8)}...${accountId.slice(-6)}`;
}

async function getSavedProfileDescription(paths: ReturnType<typeof getOpenCodeAuthPaths>, accountId: string | undefined): Promise<string> {
  const matchingProfileNames = await getMatchingSavedProfileNames(paths, accountId);

  return formatSavedProfileDescription(matchingProfileNames);
}

async function getMatchingSavedProfileNames(paths: ReturnType<typeof getOpenCodeAuthPaths>, accountId: string | undefined): Promise<string[]> {
  if (!accountId) {
    return [];
  }

  const savedProfiles = await listOpenAIProfiles(paths);

  return savedProfiles.filter((profile) => profile.accountId === accountId).map((profile) => profile.name);
}

function formatSavedProfileDescription(profileNames: string[]): string {
  if (profileNames.length === 0) {
    return "Saved profile: unsaved";
  }

  if (profileNames.length === 1) {
    return `Saved profile: ${profileNames[0]}`;
  }

  return `Saved profiles: ${profileNames.join(", ")}`;
}

async function handleServerCommand(ctx: Parameters<Plugin>[0], rawArguments: string): Promise<string> {
  const paths = getOpenCodeAuthPaths();
  const [action, ...actionArguments] = rawArguments.trim().split(/\s+/).filter((argument) => argument.length > 0);
  const argument = actionArguments[0];

  try {
    if (!action || action === "help") {
      const message = `Usage: /${FALLBACK_COMMAND_NAME} save <name> | switch <name> | rename <old> <new> | list | active | login [browser|headless]`;
      await showServerToast(ctx, "info", message);
      return message;
    }

    if (action === "save") {
      if (!argument) {
        throw new Error(`Usage: /${FALLBACK_COMMAND_NAME} save <name>`);
      }

      const savedProfile = await saveActiveOpenAIProfile(paths, argument);
      const message = `Saved ${savedProfile.name}.`;
      await showServerToast(ctx, "success", message);
      return message;
    }

    if (action === "switch") {
      if (!argument) {
        throw new Error(`Usage: /${FALLBACK_COMMAND_NAME} switch <name>`);
      }

      const switchedProfile = await switchActiveOpenAIProfile(paths, argument);
      const message = `Switched to ${switchedProfile.name}. ${RESTART_MESSAGE}`;
      await showServerToast(ctx, "success", message);
      return message;
    }

    if (action === "rename") {
      const [currentName, nextName] = actionArguments;

      if (!currentName || !nextName) {
        throw new Error(`Usage: /${FALLBACK_COMMAND_NAME} rename <old> <new>`);
      }

      const renamedProfile = await renameOpenAIProfile(paths, currentName, nextName);
      const message = `Renamed ${currentName} to ${renamedProfile.name}.`;
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
      const savedProfileDescription = await getSavedProfileDescription(paths, activeProfile.accountId);
      const message = `${savedProfileDescription}\n${formatAccountIdDescription(activeProfile.accountId)}`;
      await showServerToast(ctx, "info", message);
      return message;
    }

    if (action === "login") {
      return await startServerOpenAILogin(ctx, argument);
    }

    throw new Error(`Unknown action: ${action}`);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    await showServerToast(ctx, "error", message);
    return message;
  }
}

async function startServerOpenAILogin(ctx: Parameters<Plugin>[0], methodPreference: string | undefined): Promise<string> {
  const client = ctx.client as unknown as ServerProviderClient;
  const parsedMethodPreference = parseOpenAIAuthMethodPreference(methodPreference);
  const savedProfile = await saveActiveOpenAIProfileIfUnsaved(getOpenCodeAuthPaths());
  const authMethodsResult = await client.provider.auth({ directory: ctx.directory });

  if (authMethodsResult.error || !authMethodsResult.data) {
    throw new Error("Unable to load OpenAI login methods");
  }

  const openAIAuthMethods = authMethodsResult.data[OPENAI_PROVIDER_ID] ?? [];
  const methodIndex = findOpenAIAuthMethodIndex(openAIAuthMethods, parsedMethodPreference);

  if (methodIndex === undefined) {
    const availableMethods = openAIAuthMethods.map((method) => method.label).join(", ") || "none";

    throw new Error(`OpenAI login method not found. Available: ${availableMethods}`);
  }

  const authorizationResult = await client.provider.oauth.authorize({
    providerID: OPENAI_PROVIDER_ID,
    directory: ctx.directory,
    method: methodIndex,
  });

  if (authorizationResult.error || !authorizationResult.data) {
    throw new Error("Unable to start OpenAI login");
  }

  const shouldOpenLoginUrl = authorizationResult.data.method !== "code" && openAIAuthMethods[methodIndex]?.label !== OPENAI_HEADLESS_LOGIN_METHOD_LABEL;

  if (shouldOpenLoginUrl) {
    openPathOrUrl(authorizationResult.data.url);
  }

  const loginMessage = shouldOpenLoginUrl
    ? `Opened OpenAI login. After login completes, run /${FALLBACK_COMMAND_NAME} save <name>.`
    : `${authorizationResult.data.url} ${authorizationResult.data.instructions} Waiting for authorization. After login completes, restart opencode and run /${FALLBACK_COMMAND_NAME} save <name>.`;
  const message = savedProfile ? `Saved current profile as ${savedProfile.name} before login. ${loginMessage}` : loginMessage;
  await showServerToast(ctx, "info", message);
  return message;
}

async function showServerToast(
  ctx: Parameters<Plugin>[0],
  variant: "info" | "success" | "warning" | "error",
  message: string,
): Promise<void> {
  const client = ctx.client as unknown as ServerToastClient;

  if (client.tui) {
    await client.tui.showToast({
      directory: ctx.directory,
      title: OPENAI_ACCOUNT_TOAST_TITLE,
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
