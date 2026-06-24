/**
 * Command registry. Maps /commands to handler functions.
 * Adding a command = register it here with a handler.
 */

import type { OutboundMsg } from "./types";

export interface CommandContext {
  chatId: string;
  saveId: string | null;
  args: string;
}

export type CommandHandler = (ctx: CommandContext) => Promise<OutboundMsg>;

export interface CommandDef {
  name: string;
  description: string;
  /** If true, this command requires an active save. */
  requiresSave: boolean;
  handler: CommandHandler;
}

export class CommandRegistry {
  private commands = new Map<string, CommandDef>();

  register(def: CommandDef): void {
    this.commands.set(def.name, def);
  }

  get(name: string): CommandDef | undefined {
    return this.commands.get(name);
  }

  has(name: string): boolean {
    return this.commands.has(name);
  }

  all(): CommandDef[] {
    return Array.from(this.commands.values());
  }

  /**
   * Parse a message into a command name and args.
   * Returns null if the message isn't a command.
   */
  parse(text: string): { name: string; args: string } | null {
    const trimmed = text.trim();
    if (!trimmed.startsWith("/")) return null;

    const spaceIdx = trimmed.indexOf(" ");
    if (spaceIdx === -1) {
      return { name: trimmed.slice(1).toLowerCase(), args: "" };
    }
    return {
      name: trimmed.slice(1, spaceIdx).toLowerCase(),
      args: trimmed.slice(spaceIdx + 1).trim(),
    };
  }
}
