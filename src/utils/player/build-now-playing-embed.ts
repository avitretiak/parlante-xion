import { ActionRow, Button } from 'seyfert';
import { ButtonStyle } from 'seyfert/lib/types';
import type { KazagumoPlayer } from 'kazagumo';
import messages from '#parlante/utils/constants/messages';
import getProgressBar from '#parlante/utils/player/get-progress-bar';
import { prettyTime } from '#parlante/utils/general/time';
import { truncate } from '#parlante/utils/general/string';

type Embed = {
  color: number;
  title: string;
  description: string;
  thumbnail?: { url: string };
  timestamp: string;
  footer: { text: string };
};

const getMaxSongTitleLength = (title: string) => {
  // biome-ignore lint/suspicious/noControlCharactersInRegex: needed for non-ASCII character detection
  const nonASCII = /[^\x00-\x7F]+/;
  return nonASCII.test(title) ? 28 : 48;
};

const getPlayerUI = (kPlayer: KazagumoPlayer): string => {
  const current = kPlayer.queue.current;
  if (!current) return '';

  const position = kPlayer.position;
  const length = current.length ?? 0;
  const isStream = current.isStream;

  const statusEmoji = kPlayer.paused ? '▶️' : '⏸️';

  const progress = length > 0 && !isStream ? position / length : 0;
  const progressBar = getProgressBar(20, progress);

  const elapsedTime = isStream
    ? messages.player.live
    : `${prettyTime(Math.floor(position / 1000))}/${prettyTime(Math.floor(length / 1000))}`;

  const loopEmoji = kPlayer.loop === 'track' ? '🔂' : kPlayer.loop === 'queue' ? '🔁' : '';

  return `${statusEmoji} ${progressBar} \`[${elapsedTime}]\` ${loopEmoji}`.trimEnd();
};

export const buildNowPlayingEmbed = (
  kPlayer: KazagumoPlayer,
): { embed: Embed; components: ActionRow<Button>[] } => {
  const current = kPlayer.queue.current;
  if (!current) {
    return {
      embed: {
        color: 0x0f0f0f,
        title: messages.player.endedTitle,
        description: messages.error.nothingPlaying,
        timestamp: new Date().toISOString(),
        footer: { text: `${messages.embeds.queue.sourcePrefix}unknown` },
      },
      components: [],
    };
  }

  const isPaused = kPlayer.paused;
  const title = current.title ?? 'Unknown Track';
  const author = current.author ?? 'Unknown Artist';

  const linkedTitle =
    current.uri && current.uri.startsWith('http') ? `[${title}](${current.uri})` : title;

  const playerUI = getPlayerUI(kPlayer);

  let description = `\n**${linkedTitle}**\n\n${messages.embeds.artist}: ${author}\n\n${playerUI}`;

  const MAX_VISIBLE_SONGS = 9;
  const queueSize = kPlayer.queue.size;
  if (queueSize > 0) {
    const nextSongs = [...kPlayer.queue].slice(0, MAX_VISIBLE_SONGS);
    description += `\n\n**${messages.embeds.upNext}:**`;
    nextSongs.forEach((song, index) => {
      const songTitle = song.title ?? 'Unknown';
      const dur = song.isStream
        ? messages.player.live
        : prettyTime(Math.floor((song.length ?? 0) / 1000));
      description += `\n\`${index + 1}.\` ${truncate(songTitle, getMaxSongTitleLength(songTitle))} \`[${dur}]\``;
    });

    const remainingCount = queueSize - MAX_VISIBLE_SONGS;
    if (remainingCount > 0) {
      description += `\n\n*${messages.embeds.andMore(remainingCount)}*`;
    }
  }

  const embed: Embed = {
    color: isPaused ? 0xff9500 : 0x1db954,
    title: isPaused ? messages.player.pausedTitle : messages.player.nowPlaying,
    description,
    timestamp: new Date().toISOString(),
    footer: { text: `${messages.embeds.queue.sourcePrefix}${current.sourceName ?? 'unknown'}` },
  };

  if (current.thumbnail) {
    embed.thumbnail = { url: current.thumbnail };
  }

  const hasQueue = kPlayer.queue.size > 0;
  const hasCurrent = !!kPlayer.queue.current;

  const row = new ActionRow<Button>().addComponents(
    new Button()
      .setCustomId('player_toggle_play_pause')
      .setEmoji(isPaused ? '▶️' : '⏸️')
      .setStyle(isPaused ? ButtonStyle.Success : ButtonStyle.Secondary),
    new Button()
      .setCustomId('player_skip')
      .setEmoji('⏭️')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(!hasQueue),
    new Button()
      .setCustomId('player_stop')
      .setEmoji('⏹️')
      .setStyle(ButtonStyle.Danger)
      .setDisabled(!hasCurrent),
  );

  return { embed, components: [row] };
};
