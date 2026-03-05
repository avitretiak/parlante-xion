import type { VoiceChannel } from 'seyfert';

export enum MediaSource {
  Youtube,
  Soundcloud,
  HLS,
}

export interface QueuedPlaylist {
  title: string;
  source: string;
}

export interface SongMetadata {
  title: string;
  artist: string;
  url: string; // For YT, it's the video ID (not the full URI)
  length: number;
  offset: number;
  playlist: QueuedPlaylist | null;
  isLive: boolean;
  thumbnailUrl: string | null;
  source: MediaSource;
}

export interface QueuedSong extends SongMetadata {
  addedInChannelId: string;
  requestedBy: string;
  encodedTrack?: string; // Shoukaku encoded track
}

export enum STATUS {
  PLAYING,
  PAUSED,
  IDLE,
}

export interface PlayerEvents {
  statusChange: (oldStatus: STATUS, newStatus: STATUS) => void;
}

export interface PlayerDependencies {
  guildId: string;
  nodeLinkClient: {
    isInitialized: () => boolean;
    hasAvailableNodes: () => boolean;
    getShoukaku: () => unknown;
    getDiscordClient: () => unknown;
    getNodeStatus: () => Array<{ name: string; state: string }>;
  };
  onDisconnect?: () => void;
}

export interface PlayerModules {
  state: {
    getStatus: () => STATUS;
    setStatus: (status: STATUS) => void;
    isLoopCurrentSong: () => boolean;
    setLoopCurrentSong: (value: boolean) => void;
    isLoopCurrentQueue: () => boolean;
    setLoopCurrentQueue: (value: boolean) => void;
    isStopped: () => boolean;
    setStopped: (value: boolean) => void;
    setDefaultVolume: (volume: number) => void;
    setShoukaku: (shoukaku: unknown) => void;
    getShoukaku: () => unknown;
    setShoukakuPlayer: (player: unknown) => void;
    getShoukakuPlayer: () => unknown;
    setCurrentChannel: (channel: VoiceChannel) => void;
    getDisconnectTimer: () => NodeJS.Timeout | null;
    setDisconnectTimer: (timer: NodeJS.Timeout | null) => void;
    getPosition: () => number;
    setPosition: (position: number) => void;
    getLastUpdatePositionTime: () => number;
    setLastUpdatePositionTime: (time: number) => void;
    getPlayPositionInterval: () => NodeJS.Timeout | undefined;
    setPlayPositionInterval: (interval: NodeJS.Timeout | undefined) => void;
    getVolume: () => number;
    setVolume: (volume: number) => void;
    isPlayingInProgress: () => boolean;
    setPlayingInProgress: (value: boolean) => void;
    isForwardingInProgress: () => boolean;
    setForwardingInProgress: (value: boolean) => void;
    setNowPlaying: (song: QueuedSong | null) => void;
    getNowPlaying: () => QueuedSong | null;
    setLastSongURL: (url: string) => void;
    getLastSongURL: () => string;
  };
  queue: {
    getCurrent: () => QueuedSong | null;
    getQueue: () => QueuedSong[];
    getFullQueueLength: () => number;
    queueSize: () => number;
    isQueueEmpty: () => boolean;
    forward: (skip: number) => QueuedSong | null;
    canGoForward: (skip: number) => boolean;
    add: (song: QueuedSong, options?: { immediate?: boolean }) => void;
    shuffle: () => void;
    clear: () => void;
    clearAll: () => void;
    removeFromQueue: (index: number, amount?: number) => void;
    removeCurrent: () => void;
    getNext: () => QueuedSong | null;
  };
  embeds: {
    clearLastMessage: () => void;
    deleteLastMessage: () => Promise<void>;
    setLastEmbedUpdateTime: (time: number) => void;
    getLastEmbedUpdateTime: () => number;
    updateNowPlayingMessage: (
      client: unknown,
      channelId: string,
      immediate?: boolean,
    ) => Promise<void>;
    updateNowPlayingMessageEnded: (
      client: unknown,
      channelId: string,
      song: QueuedSong,
    ) => Promise<void>;
    setLastNowPlayingMessage: (channelId: string, messageId: string) => void;
    getLastNowPlayingMessage: () => {
      channelId: string;
      messageId: string;
    } | null;
    cleanup: () => void;
  };
}

export interface PlayerStateData {
  status: STATUS;
  volume?: number;
  defaultVolume: number;
  positionInSeconds: number;
  voiceConnection: unknown;
  currentChannel: VoiceChannel | undefined;
  shoukaku: unknown;
  shoukakuPlayer: unknown;
  nowPlaying: QueuedSong | null;
  stopped: boolean;
  loopCurrentSong: boolean;
  loopCurrentQueue: boolean;
  isPlayingInProgress: boolean;
  isForwardingInProgress: boolean;
  lastSongURL: string;
  lastUpdatePosition: number;
  lastUpdatePositionTime: number;
  playPositionInterval: NodeJS.Timeout | undefined;
  disconnectTimer: NodeJS.Timeout | null;
}

export interface ConnectionCallbacks {
  onTrackStart: () => void;
  onTrackEnd: () => void;
  onTrackException: (data: { exception: { message: string; severity: string } }) => void;
  onTrackStuck: (data?: { thresholdMs?: number; reason?: string }) => void;
  onUpdate: (data: { state?: { position?: number } }) => void;
  stopTrackingPosition: () => void;
  getCurrent: () => unknown;
  disconnect: () => Promise<void>;
}

export interface TrackLoaderDependencies {
  nodeLinkClient: {
    isInitialized: () => boolean;
    getShoukaku: () => {
      getIdealNode: () => {
        rest: {
          resolve: (identifier: string) => Promise<{
            loadType: string;
            data?: unknown | unknown[] | { tracks: unknown[] };
          } | null>;
        };
      } | null;
      nodes: { size: number; values: () => IterableIterator<unknown> };
    };
    getNodeStatus: () => Array<{ name: string; state: string }>;
  };
  state: {
    getShoukaku: () => unknown;
    setShoukaku: (shoukaku: unknown) => void;
  };
}

export const DEFAULT_VOLUME = 100;
