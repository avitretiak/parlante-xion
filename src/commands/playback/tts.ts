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
import { buildNodeConfig } from '#parlante/structures/kazagumo';
import { debug, warn } from '#parlante/utils/system/logger';

const TTS_VOICE = 'Mateo';
const TTS_MIX_VOLUME = 1.0;

function buildNodeLinkRestUrl(): { baseUrl: string; auth: string } {
  const cfg = buildNodeConfig();
  const protocol = cfg.secure ? 'https' : 'http';
  return { baseUrl: `${protocol}://${cfg.url}`, auth: cfg.auth };
}

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
@Middlewares(['commandQueue', 'voiceGuard'])
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

    const { baseUrl, auth } = buildNodeLinkRestUrl();
    const mixUrl = `${baseUrl}/v4/sessions/${node.sessionId}/players/${guildId}/mix`;

    let response: Response;
    try {
      response = await fetch(mixUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: auth,
        },
        body: JSON.stringify({
          track: { encoded: result.data.encoded },
          volume: TTS_MIX_VOLUME,
        }),
      });
    } catch (err) {
      warn(`[${guildId}] NodeLink mixer request failed`, err);
      await ctx.editOrReply({
        content: messages.error.commandFailed,
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    if (!response.ok) {
      warn(`[${guildId}] NodeLink mixer returned ${response.status}`);
      await ctx.editOrReply({
        content: messages.error.commandFailed,
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    debug(`[${guildId}] TTS mix layer added over current track`);
    await ctx.editOrReply({
      content: messages.commands.tts.speaking(message),
      flags: MessageFlags.Ephemeral,
    });
  }
}
