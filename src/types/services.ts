export interface SoundCloudTrackMetadata {
  title: string;
  artist: string;
  url: string;
  duration: number; // Duration in seconds
  thumbnailUrl: string | null;
}

export interface SoundCloudPlaylistMetadata {
  title: string;
  tracks: SoundCloudTrackMetadata[];
}
