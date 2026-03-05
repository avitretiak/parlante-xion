declare global {
  type Command = import('#parlante/types/commands').default;
  type QueuedSong = import('#parlante/types/player').QueuedSong;
  type QueuedPlaylist = import('#parlante/types/player').QueuedPlaylist;
  type SongMetadata = import('#parlante/types/player').SongMetadata;
  type PlayerDependencies = import('#parlante/types/player').PlayerDependencies;
  type PlayerModules = import('#parlante/types/player').PlayerModules;
  type PlayerStateData = import('#parlante/types/player').PlayerStateData;
  type ConnectionCallbacks = import('#parlante/types/player').ConnectionCallbacks;
  type TrackLoaderDependencies = import('#parlante/types/player').TrackLoaderDependencies;
  type PlayerEvents = import('#parlante/types/player').PlayerEvents;
  type SoundCloudTrackMetadata = import('#parlante/types/services').SoundCloudTrackMetadata;
  type SoundCloudPlaylistMetadata = import('#parlante/types/services').SoundCloudPlaylistMetadata;
  type Setting = import('#parlante/types/db').Setting;
  type FavoriteQuery = import('#parlante/types/db').FavoriteQuery;
  type KeyValueCacheEntry = import('#parlante/types/db').KeyValueCacheEntry;

  type MediaSource = import('#parlante/types/player').MediaSource;
  type STATUS = import('#parlante/types/player').STATUS;
}

export {};
