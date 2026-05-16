import type { MediaItem } from './video-worker';
import type {
  KreyaTimeline,
  VideoTrack,
  AudioTrack,
  CaptionTrack,
  AspectRatio,
  RenderResolution,
  CaptionPlatform,
  KenBurnsStyle,
} from './timeline-schema';

const KEN_BURNS_CYCLE: KenBurnsStyle[] = ['elegant', 'cinematic', 'float'];

export interface BufferOpts {
  aspectRatio?: AspectRatio
  resolution?: RenderResolution
  captionText?: string
  captionPlatform?: CaptionPlatform
  musicUrl?: string
  colorGrade?: KreyaTimeline['colorGrade']
  bgStyle?: KreyaTimeline['bgStyle']
}

export function buildAtomicTimeline(
  mediaItems: MediaItem[],
  opts: BufferOpts = {},
): KreyaTimeline {
  if (!mediaItems.length) throw new Error('buildAtomicTimeline: no media items');

  const {
    aspectRatio    = '9:16',
    resolution     = 'preview',
    captionText,
    captionPlatform = 'ig-reels',
    musicUrl,
    colorGrade,
    bgStyle        = 'blur',
  } = opts;

  const clipDuration = Math.max(1.5, 5 / mediaItems.length);
  const totalDuration = clipDuration * mediaItems.length;

  let startTime = 0;
  const videoTracks: VideoTrack[] = mediaItems.map((item, i) => {
    const track: VideoTrack = {
      src:       item.url,
      type:      item.type,
      startTime,
      duration:  clipDuration,
      transition: i === 0 ? 'cut' : 'fade',
    };

    if (item.type === 'image') {
      track.effect = {
        type:      'ken-burns',
        style:     KEN_BURNS_CYCLE[i % KEN_BURNS_CYCLE.length],
        zoomStart: 1.0,
        zoomEnd:   1.3,
      };
    } else {
      track.effect = { type: 'static' };
    }

    startTime += clipDuration;
    return track;
  });

  const audio: AudioTrack | undefined = musicUrl
    ? { src: musicUrl, volume: 0.4, fadeOutAt: Math.max(0, totalDuration - 2) }
    : undefined;

  const captions: CaptionTrack[] | undefined = captionText
    ? [{
        text:      captionText,
        startTime: 0,
        duration:  totalDuration,
        position:  'bottom',
        platform:  captionPlatform,
      }]
    : undefined;

  return {
    version:       '1.0',
    aspectRatio,
    resolution,
    totalDuration,
    colorGrade,
    bgStyle,
    tracks: {
      video: videoTracks,
      ...(audio    ? { audio }    : {}),
      ...(captions ? { captions } : {}),
    },
  };
}
