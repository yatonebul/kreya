export type AspectRatio = '9:16' | '1:1' | '16:9'
// preview: 480p ultrafast — fast WA preview
// hd-fast: 1080p ultrafast no-zoompan — web editor output (publishable quality, fast enough)
// hd: 1080p fast with zoompan — final animated HD (slow, future use)
export type RenderResolution = 'preview' | 'hd-fast' | 'hd'

export type KenBurnsStyle = 'quick-zoom' | 'elegant' | 'cinematic' | 'float' | 'focus-zoom'

export type ColorGrade =
  | 'natural'
  | 'warm'
  | 'cool'
  | 'cinematic'
  | 'moody'
  | 'vintage'
  | 'vibrant'

export interface KenBurnsEffect {
  type: 'ken-burns'
  style: KenBurnsStyle
  zoomStart?: number
  zoomEnd?: number
}

export interface StaticEffect {
  type: 'static'
}

export type ClipEffect = KenBurnsEffect | StaticEffect

export type TransitionType = 'cut' | 'fade'

export type CaptionPlatform = 'tiktok' | 'ig-reels' | 'facebook-reels'

export interface VideoTrack {
  src: string
  type: 'image' | 'video'
  startTime: number
  duration: number
  effect?: ClipEffect
  transition?: TransitionType
}

export interface AudioTrack {
  src: string
  volume?: number     // 0–1, default 0.4
  fadeOutAt?: number  // seconds from timeline start to begin fade
}

export interface CaptionTrack {
  text: string
  startTime: number
  duration: number
  position: 'bottom' | 'center' | 'top'
  platform: CaptionPlatform
  fontSize?: number
}

export interface KreyaTimeline {
  version: '1.0'
  aspectRatio: AspectRatio
  resolution: RenderResolution
  totalDuration: number
  colorGrade?: ColorGrade
  bgStyle?: 'blur' | 'black'
  tracks: {
    video: VideoTrack[]
    audio?: AudioTrack
    captions?: CaptionTrack[]
  }
}
