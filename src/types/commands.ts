import type {
  AutocompleteInteraction,
  ButtonInteraction,
  ChatInputCommandInteraction,
} from 'seyfert';

/**
 * Metadata about a command
 */
export interface CommandMetadata {
  /** Name of the command */
  name: string;
  /** Description of the command */
  description: string;
  /** Whether the command requires voice channel */
  requiresVC?: boolean;
}

/**
 * Command interface for Discord bot commands
 */
export default interface Command {
  /** Button IDs that this command handles */
  readonly handledButtonIds?: readonly string[];
  /** Whether this command requires voice channel (can be dynamic) */
  readonly requiresVC?: boolean | ((interaction: ChatInputCommandInteraction) => boolean);
  /** Execute handler for slash commands */
  execute?: (interaction: ChatInputCommandInteraction) => Promise<void>;
  /** Handler for button interactions */
  handleButtonInteraction?: (interaction: ButtonInteraction) => Promise<void>;
  /** Handler for autocomplete interactions */
  handleAutocompleteInteraction?: (interaction: AutocompleteInteraction) => Promise<void>;
}
