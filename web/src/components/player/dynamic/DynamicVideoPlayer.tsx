import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import TimelineEventOverlay from "../../overlay/TimelineDataOverlay";
import { useApiHost } from "@/api";
import useSWR from "swr";
import { FrigateConfig } from "@/types/frigateConfig";
import { Recording } from "@/types/record";
import { Preview } from "@/types/preview";
import PreviewPlayer, { PreviewController } from "../PreviewPlayer";
import { DynamicVideoController } from "./DynamicVideoController";
import HlsVideoPlayer from "../HlsVideoPlayer";

/**
 * Dynamically switches between video playback and scrubbing preview player.
 */
type DynamicVideoPlayerProps = {
  className?: string;
  camera: string;
  timeRange: { start: number; end: number };
  cameraPreviews: Preview[];
  startTimestamp?: number;
  isScrubbing: boolean;
  onControllerReady: (controller: DynamicVideoController) => void;
  onTimestampUpdate?: (timestamp: number) => void;
  onClipEnded?: () => void;
};
export default function DynamicVideoPlayer({
  className,
  camera,
  timeRange,
  cameraPreviews,
  startTimestamp,
  isScrubbing,
  onControllerReady,
  onTimestampUpdate,
  onClipEnded,
}: DynamicVideoPlayerProps) {
  const apiHost = useApiHost();
  const { data: config } = useSWR<FrigateConfig>("config");

  // playback behavior

  const grow = useMemo(() => {
    if (!config) {
      return "aspect-video";
    }

    const aspectRatio =
      config.cameras[camera].detect.width /
      config.cameras[camera].detect.height;

    if (aspectRatio > 2) {
      return "";
    } else if (aspectRatio < 16 / 9) {
      return "aspect-tall";
    } else {
      return "aspect-video";
    }
  }, [camera, config]);

  // controlling playback

  const playerRef = useRef<HTMLVideoElement | null>(null);
  const [previewController, setPreviewController] =
    useState<PreviewController | null>(null);
  const [focusedItem, setFocusedItem] = useState<Timeline | undefined>(
    undefined,
  );
  const controller = useMemo(() => {
    if (!config || !playerRef.current || !previewController) {
      return undefined;
    }

    return new DynamicVideoController(
      camera,
      playerRef.current,
      previewController,
      (config.cameras[camera]?.detect?.annotation_offset || 0) / 1000,
      isScrubbing ? "scrubbing" : "playback",
      setFocusedItem,
    );
    // we only want to fire once when players are ready
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [camera, config, playerRef.current, previewController]);

  useEffect(() => {
    if (!controller) {
      return;
    }

    if (controller) {
      onControllerReady(controller);
    }

    // we only want to fire once when players are ready
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [controller]);

  // initial state

  const [isLoading, setIsLoading] = useState(false);
  const [source, setSource] = useState(
    `${apiHost}vod/${camera}/start/${timeRange.start}/end/${timeRange.end}/master.m3u8`,
  );

  // start at correct time

  useEffect(() => {
    if (isScrubbing) {
      setIsLoading(true);
    }
  }, [isScrubbing]);

  const onPlayerLoaded = useCallback(() => {
    if (!controller || !startTimestamp) {
      return;
    }

    controller.seekToTimestamp(startTimestamp, true);
  }, [startTimestamp, controller]);

  const onTimeUpdate = useCallback(
    (time: number) => {
      if (!controller || !onTimestampUpdate || time == 0) {
        return;
      }

      onTimestampUpdate(controller.getProgress(time));
    },
    [controller, onTimestampUpdate],
  );

  // state of playback player

  const recordingParams = useMemo(() => {
    return {
      before: timeRange.end,
      after: timeRange.start,
    };
  }, [timeRange]);
  const { data: recordings } = useSWR<Recording[]>(
    [`${camera}/recordings`, recordingParams],
    { revalidateOnFocus: false },
  );

  useEffect(() => {
    if (!controller || !recordings) {
      return;
    }

    if (playerRef.current) {
      playerRef.current.autoplay = !isScrubbing;
    }

    setSource(
      `${apiHost}vod/${camera}/start/${timeRange.start}/end/${timeRange.end}/master.m3u8`,
    );
    setIsLoading(true);

    controller.newPlayback({
      recordings: recordings ?? [],
    });

    // we only want this to change when recordings update
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [controller, recordings]);

  return (
    <div className={`relative ${className ?? ""} cursor-pointer`}>
      <div
        className={`w-full relative ${isScrubbing || isLoading ? "hidden" : "visible"}`}
      >
        <HlsVideoPlayer
          className={`${grow}`}
          videoRef={playerRef}
          currentSource={source}
          onTimeUpdate={onTimeUpdate}
          onPlayerLoaded={onPlayerLoaded}
          onClipEnded={onClipEnded}
          onPlaying={() => setIsLoading(false)}
        >
          {config && focusedItem && (
            <TimelineEventOverlay
              timeline={focusedItem}
              cameraConfig={config.cameras[camera]}
            />
          )}
        </HlsVideoPlayer>
      </div>
      <PreviewPlayer
        className={`${isScrubbing || isLoading ? "visible" : "hidden"} ${grow}`}
        camera={camera}
        timeRange={timeRange}
        cameraPreviews={cameraPreviews}
        startTime={startTimestamp}
        isScrubbing={isScrubbing}
        onControllerReady={(previewController) => {
          setPreviewController(previewController);
        }}
      />
    </div>
  );
}
