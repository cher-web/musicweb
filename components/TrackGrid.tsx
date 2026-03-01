"use client";

import { SpotifyTrack } from "@/types/spotify";
import Image from "next/image";

interface Props {
  tracks: SpotifyTrack[];
  onTrackSelect: (track: SpotifyTrack) => void;
}

export default function TrackGrid({ tracks, onTrackSelect }: Props) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-4 max-w-4xl mx-auto px-6 pb-12">
      {tracks.map((track) => (
        <button
          key={track.id}
          onClick={() => onTrackSelect(track)}
          className="group text-left rounded-lg overflow-hidden bg-white/5 hover:bg-white/10 cursor-pointer transition-colors"
        >
          <div className="relative aspect-square">
            <Image
              src={track.album.images[0]?.url}
              alt={track.name}
              fill
              sizes="(max-width: 640px) 50vw, (max-width: 768px) 33vw, 20vw"
              className="object-cover"
            />
          </div>
          <div className="p-3">
            <p className="text-sm font-medium text-white truncate">
              {track.name}
            </p>
            <p className="text-xs text-white/60 truncate">
              {track.artists.map((a) => a.name).join(", ")}
            </p>
          </div>
        </button>
      ))}
    </div>
  );
}
