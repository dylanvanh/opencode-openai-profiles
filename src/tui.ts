import type { TuiPluginModule } from "@opencode-ai/plugin/tui";
import { id, tui } from "./index.js";

const plugin: TuiPluginModule & { id: string } = {
	id,
	tui,
};

export default plugin;
