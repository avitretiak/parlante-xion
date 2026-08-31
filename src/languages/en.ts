export default {
  error: {
    nothingPlaying: 'There is no song currently playing.',
    cannotSeekLivestream: 'Seeking is not supported in livestreams.',
    missingSeekValue: 'Please provide a seek value.',
    invalidLimit: 'The provided limit is invalid.',
    notInVoiceChannel: 'You must be in a voice channel to use this command.',
    notInDirectMessage: 'This bot cannot be used in direct messages.',
    itemNotFound: 'The requested item does not exist.',
    noSongsFound: 'No songs were found for your query.',
    notConnected: 'Not connected to a voice channel.',
    noSongToSkip: 'No song to skip to.',
    noSongToGoBack: 'No song to go back to.',
    moveIndexOutOfRange: 'Move index is outside the range of the queue.',
    seekOutOfRange: 'Seek position is outside the range of the song.',
    invalidSeekPosition: 'Seek position must be a valid number.',
    negativeSeekPosition: 'Seek position cannot be negative.',
    alreadyPlaying: 'Already playing. Please provide a song name.',
    cantReplayLivestream: 'Cannot replay a livestream.',
    notEnoughSongsToShuffle: 'Not enough songs in the queue to shuffle.',
    noPlayersToDisconnect: 'There are no players to disconnect.',
    noNodelinkNode: 'No NodeLink node available.',
    missingPermissions: (permissions: string[]) =>
      `You are missing the following permissions: \`${permissions.join(', ')}\``,
    botMissingPermissions: (permissions: string[]) =>
      `I am missing the following permissions: \`${permissions.join(', ')}\``,
    optionsError: (message: string) => `There was an error with the options: \`${message}\``,
    commandFailed: 'An error occurred while running this command.',
  },
  queue: {
    addSuccess: (title: string, front: boolean, skip: boolean, extra: string) =>
      `**${title}** was added to the${front ? ' front of the' : ''} queue${skip ? ' and the current track was skipped' : ''}${extra}`,
    addMultipleSuccess: (title: string, count: number, skip: boolean, extra: string) =>
      `**${title}** and ${count} other song${count === 1 ? '' : 's'} were added to the queue${skip ? ' and the current track was skipped' : ''}${extra}`,
    movedBack: 'Moved back to the previous song in the queue.',
    disconnected: 'Disconnected from the voice channel.',
    stopped: 'Playback stopped and disconnected from the voice channel.',
    skipped: 'Skipped to the next song.',
    skippedTrack: (title: string) => `Skipped \`${title}\``,
    shuffled: 'Queue shuffled.',
    moved: (title: string, to: number) => `Moved **${title}** to position **${to}**`,
    cleared: 'Queue cleared.',
    removePrompt: 'Select a song to remove from the queue:',
    removeButton: 'Remove',
    removePromptLimited: (count: number) =>
      `Only the first 25 songs are shown (${count} more in the queue). Use /remove with its queue position.`,
    removeSelectPlaceholder: 'Choose a song to remove',
    removedTrack: (title: string) => `Removed **${title}** from the queue.`,
    removeStale:
      'The queue changed — nothing was removed. Open Remove Queued Song again to refresh.',
    removeRequester: (requester: string) => `Requested by ${requester}`,
    loopedQueue: 'Queue looping enabled.',
    stoppedLoopingQueue: 'Queue looping disabled.',
    loopedSong: 'Song looping enabled.',
    stoppedLoopingSong: 'Song looping disabled.',
  },
  player: {
    seeked: (time: string) => `Seeked to ${time}.`,
    paused: 'Playback paused.',
    replayed: 'Replayed the current song.',
    volumeSet: (level: number) => `Set volume to ${level}%`,
    nowPlaying: '▶️ Now Playing',
    pausedTitle: '⏸️ Paused',
    live: 'live',
    resumed: 'Playback resumed.',
    endedTitle: 'Song Ended',
    ended: 'Song ended',
    trackLoadFailed: (title: string) => `⚠️ Could not load **${title}** — skipping.`,
    unknownArtist: 'Unknown Artist',
  },
  favorites: {
    created: 'Favorite created.',
    removed: 'Favorite removed.',
    none: 'There are no favorites yet.',
    alreadyExists: 'A favorite with that name already exists.',
    onlyRemoveOwn: 'You can only remove your own favorites.',
    notFound: 'No favorite with that name exists.',
    create: {
      description: 'Create a new favorite',
      name: 'Name for the new favorite',
      query: 'Any input you would normally give to the play command',
      invalidName: 'Favorite name must be 1-100 characters.',
      invalidQuery: 'Favorite query must be 1-6000 characters.',
    },
    remove: {
      description: 'Remove a favorite',
      name: 'Name of favorite',
    },
    use: {
      description: 'Use a favorite',
      name: 'Name of favorite',
    },
    list: {
      description: 'List all favorites',
    },
  },
  config: {
    updated: {
      playlistLimit: 'Playlist limit updated.',
      waitDelay: 'Wait delay updated.',
      leaveSetting: 'Leave setting updated.',
      defaultVolume: 'Default volume updated.',
      defaultQueuePageSize: 'Default queue page size updated.',
      reportChannel: 'Report channel updated.',
    },
    labels: {
      title: 'Configuration',
      playlistLimit: 'Playlist Limit',
      waitBeforeLeaving: 'Wait before leaving after queue is empty',
      leaveIfNoListeners: 'Leave if there are no listeners',
      defaultVolume: 'Default Volume',
      defaultQueuePageSize: 'Default queue page size',
      reportChannel: 'Report Channel',
      notSet: 'Not set',
      neverLeave: 'Never leave',
      yes: 'Yes',
      no: 'No',
    },
  },
  embeds: {
    artist: 'Artist',
    requestedBy: 'Requested by',
    upNext: 'Up next',
    andMore: (count: number) =>
      count === 1 ? `...and ${count} more song` : `...and ${count} more songs`,
    queueInfo: (count: number) => (count === 1 ? '1 song' : `${count} songs`),
    queue: {
      nowPlaying: 'Now Playing',
      paused: 'Paused',
      page: (page: number, max: number) => `Page ${page} out of ${max}`,
      sourcePrefix: 'Source: ',
    },
  },
  commands: {
    play: {
      description: 'Play a song',
      query: 'Song name, URL, or search query (YouTube, Spotify, SoundCloud)',
      addToFront: 'Add track to the front of the queue',
      shuffle: "Shuffle the input if you're adding multiple tracks",
      skip: 'Skip the currently playing track',
    },
    pause: {
      description: 'Pause or resume the current song',
    },
    resume: {
      description: 'Resume playback',
    },
    stop: {
      description: 'Stop playback, disconnect, and clear all songs in the queue',
    },
    skip: {
      description: 'Skip the next songs',
      number: 'Number of songs to skip [default: 1]',
    },
    shuffle: {
      description: 'Shuffle the current queue',
    },
    move: {
      description: 'Move songs within the queue',
      from: 'Position of the song to move',
      to: 'Position to move the song to',
    },
    remove: {
      description: 'Remove a queued song',
      position: 'Queue position to remove',
    },
    queue: {
      description: 'Show the current queue',
      page: 'Page of queue to show [default: 1]',
      pageSize: 'How many items to display per page [default: 10, max: 30]',
    },
    nowPlaying: {
      description: 'Show the currently played song',
      nothingPlaying: 'There is no song currently playing.',
    },
    loop: {
      description: 'Toggle looping the current song',
    },
    loopQueue: {
      description: 'Toggle looping the entire queue',
    },
    fseek: {
      description: 'Seek forward or backward in the current song',
      time: 'Relative offset — seconds, units or MM:SS (90, 1m30s, -30s, +1:30)',
    },
    seek: {
      description: 'Seek to a position from beginning of song',
      time: 'Target position — seconds, units, MM:SS or HH:MM:SS (90, 1m30s, 1:30, 1:02:03)',
    },
    favorites: {
      description: 'Add a song to your favorites',
      immediate: 'Add track to the front of the queue',
      shuffle: "Shuffle the input if you're adding multiple tracks",
      skip: 'Skip the currently playing track',
    },
    config: {
      description: 'Configure bot settings',
      get: 'Show all settings',
      setPlaylistLimit: {
        description: 'Set the maximum number of tracks that can be added from a playlist',
        limit: 'Maximum number of tracks',
      },
      setWaitAfterQueueEmpties: {
        description: 'Set the time to wait before leaving the voice channel when queue empties',
        delay: 'Delay in seconds (set to 0 to never leave)',
      },
      setLeaveIfNoListeners: {
        description: 'Set whether to leave when all other participants leave',
        value: 'Whether to leave when everyone else leaves',
      },
      setDefaultVolume: {
        description: 'Set default volume used when entering the voice channel',
        level: 'Volume percentage (0 is muted, 100 is max & default)',
      },
      setDefaultQueuePageSize: {
        description: 'Set the default page size of the /queue command',
        pageSize: 'Page size of the /queue command',
      },
      setReportChannel: {
        description: 'Set the channel where now playing and status messages are posted',
        channel: 'Channel to post now playing messages in',
      },
    },
    clear: {
      description: 'Clear all songs in queue except currently playing song',
    },
    unskip: {
      description: 'Go back in the queue by one song',
    },
    disconnect: {
      description: 'Stop and disconnect the player',
    },
    cleanup: {
      description: 'Delete bot messages across all servers',
      success: (count: number) =>
        `Deleted ${count} bot message${count === 1 ? '' : 's'} across all servers.`,
      noMessages: 'No bot messages found across all servers.',
    },
    volume: {
      description: 'Set current player volume level',
      level: 'Volume percentage (0 is muted, 100 is max & default)',
    },
    replay: {
      description: 'Replay the current song',
    },
    next: {
      description: 'Skip to the next song',
    },
    tts: {
      description: 'Play text-to-speech in Spanish (Uruguay)',
      message: 'Text to speak',
      speaking: (text: string) => `Speaking: "${text}"`,
      mustBePlaying: 'You need to have music playing to use TTS.',
      queueFull: 'The TTS queue is full. Wait for the current message to finish and try again.',
      tooLong: (max: number) => `The TTS message is too long. Maximum length is ${max} characters.`,
    },
  },
  debug: {
    creatingDataDir: '📁 Creating data directory...',
    unknownCommand: 'Unknown command',
    runWithHelpToSeeCommands: 'Run with --help to see available commands',
    initializingMusicSystem: '🎵 Initializing music system...',
    nodeLinkConnected: (name: string) => `NodeLink connected: ${name}`,
    nodeLinkError: (name: string) => `NodeLink error [${name}]`,
    nodeLinkClosed: (name: string, code: number, reason: string) =>
      `NodeLink closed [${name}]: ${code} ${reason}`,
    nodeLinkDisconnected: (name: string) => `NodeLink disconnected [${name}]`,
    botReadyAs: (username: string, guildCount: number) =>
      `Bot ready as ${username}, serving ${guildCount} guilds`,
    registeringCommands: 'Registering slash commands to all guilds...',
    commandsRegistered: 'Slash commands registered.',
    guildJoined: (name: string, id: string) => `Joined guild: ${name} (${id})`,
  },
  spinner: {
    connectingToDiscord: '📡 Connecting to Discord...',
    syncingDatabaseSchema: 'Syncing database schema...',
    databaseSchemaSynced: 'Database schema synced successfully.',
    databaseSchemaSyncError: 'Error syncing database schema:',
  },
  banner: {
    madeWith: 'Made with 🎶 by avitretiak',
    version: (version: string) => `Version: ${version}`,
    buildDate: (date: string) => `Build date: ${date}`,
    commit: (commit: string) => `Commit: ${commit}`,
  },
  cli: {
    help: {
      usage: 'Usage: bun run src/index.ts <command>',
      commands: 'Commands:',
    },
    start: {
      description: 'Start bot (without database schema synchronization)',
    },
    migrate: {
      description: 'Sync database schema only',
    },
    migrateAndStart: {
      description: 'Sync database schema and start bot',
    },
    dev: {
      description:
        'Development mode: set environment variables, start bot, without database schema synchronization',
    },
  },
  events: {
    autocomplete: {
      noTracks: 'No tracks found',
    },
  },
};
