import {
  Declare,
  Command,
  type CommandContext,
  Options,
  createStringOption,
  Middlewares,
} from 'seyfert';
import { MessageFlags } from 'seyfert/lib/types/payloads/channel';
import { LoadType } from 'shoukaku';
import messages from '#parlante/utils/constants/messages';
import { playersManager } from '#parlante/managers/players';

const TTS_VOICE = 'Mateo';
const TTS_MIX_VOLUME = 1.0;
const TTS_MIN_TIMEOUT_MS = 5_000;
const TTS_MAX_TIMEOUT_MS = 30_000;
const TTS_TIMEOUT_BUFFER_MS = 4_000;

const ttsOptions = {
  message: createStringOption({
    description: messages.commands.tts.message,
    required: true as const,
  }),
};

@Declare({
  name: 'tts',
  description: messages.commands.tts.description,
})
@Options(ttsOptions)
@Middlewares(['voiceGuard', 'commandQueue'])
export default class TtsCommand extends Command {
  async run(ctx: CommandContext<typeof ttsOptions>) {
    await ctx.deferReply(true);

    const { message } = ctx.options;
    const guildId = ctx.guildId!;
    const kazagumo = ctx.client.kazagumo;

    const kPlayer = kazagumo.players.get(guildId);
    if (!kPlayer?.playing) {
      await ctx.editOrReply({
        content: messages.commands.tts.mustBePlaying,
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const node = kazagumo.shoukaku.options.nodeResolver(kazagumo.shoukaku.nodes);
    if (!node?.sessionId) {
      await ctx.editOrReply({
        content: messages.error.noNodelinkNode,
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const identifier = `ftts://${encodeURIComponent(message)}?voice=${TTS_VOICE}`;
    const result = await node.rest.resolve(identifier);
    if (!result || result.loadType !== LoadType.TRACK) {
      await ctx.editOrReply({
        content: messages.error.noSongsFound,
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const parlantePlayer = playersManager.get(guildId);
    if (!parlantePlayer) {
      await ctx.editOrReply({
        content: messages.error.commandFailed,
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const ttsLengthMs =
      (result.data as { info?: { length?: number } }).info?.length ?? TTS_MIN_TIMEOUT_MS;
    const timeoutMs = Math.min(
      TTS_MAX_TIMEOUT_MS,
      Math.max(TTS_MIN_TIMEOUT_MS, ttsLengthMs + TTS_TIMEOUT_BUFFER_MS),
    );

    const success = await parlantePlayer.addMixLayer(
      result.data.encoded,
      TTS_MIX_VOLUME,
      timeoutMs,
    );
    if (!success) {
      await ctx.editOrReply({
        content: messages.error.commandFailed,
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    await ctx.editOrReply({
      content: messages.commands.tts.speaking(message),
      flags: MessageFlags.Ephemeral,
    });
  }
}
