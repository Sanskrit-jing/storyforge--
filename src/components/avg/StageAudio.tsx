import { useEffect, useRef } from "react";
export default function StageAudio({
  src,
  volume,
  loop,
  channel,
}: {
  src: string;
  volume: number;
  loop: boolean;
  channel: string;
}) {
  const ref = useRef<HTMLAudioElement>(null);
  useEffect(() => {
    if (ref.current) ref.current.volume = Math.max(0, Math.min(1, volume));
  }, [volume, src]);
  return (
    <audio
      ref={ref}
      src={src}
      autoPlay
      loop={loop}
      data-channel={channel}
      onLoadedMetadata={() => {
        if (ref.current) ref.current.volume = Math.max(0, Math.min(1, volume));
      }}
    />
  );
}
