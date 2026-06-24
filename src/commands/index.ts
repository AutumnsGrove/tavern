/**
 * Command setup. Registers all static commands into the registry.
 * Adding a new command = create a file, add one call here.
 */

import { CommandRegistry } from "../gateway/commands";
import type { GameStore } from "../state/store";
import type { SrdLoader } from "../srd/loader";

import { helpCommand } from "./help";
import { rollCommand } from "./roll";
import { sheetCommand } from "./sheet";
import { inventoryCommand } from "./inventory";
import { worldCommand } from "./world";
import { abilitiesCommand } from "./abilities";
import { conciseCommand, verboseCommand, tracesCommand } from "./mode";
import { newCommand } from "./new";

export function registerCommands(
  registry: CommandRegistry,
  store: GameStore,
  srd: SrdLoader,
): void {
  registry.register(helpCommand);
  registry.register(rollCommand);
  registry.register(newCommand(store, srd));
  registry.register(sheetCommand(store));
  registry.register(inventoryCommand(store));
  registry.register(worldCommand(store));
  registry.register(abilitiesCommand(store, srd));
  registry.register(conciseCommand(store));
  registry.register(verboseCommand(store));
  registry.register(tracesCommand(store));
}
