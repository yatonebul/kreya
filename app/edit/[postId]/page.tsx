'use client';

import { useEffect, useRef, useState, useCallback, use } from 'react';
import type { KreyaTimeline, VideoTrack, ColorGrade, KenBurnsStyle } from '@/lib/timeline-schema';

// ── CSS filter map for instant (no-server) color grade preview ────────────────

const COLOR_GRADES: Record<ColorGrade, string> = {
  natural:   'none',
  warm:      'sepia(15%) saturate(130%) hue-rotate(8deg)',
  cool:      'saturate(110%) hue-rotate(-18deg) brightness(1.05)',
  cinematic: 'contrast(130%) saturate(65%)',
  moody:     'brightness(0.82) contrast(145%) saturate(78%)',
  vintage:   'sepia(35%) contrast(88%) saturate(75%)',
  vibrant:   'saturate(175%) contrast(112%)',
};

const GRADE_LABELS: Record<ColorGrade, string> = {
  natural:   'Natural',
  warm:      'Warm',
  cool:      'Cool',
  cinematic: 'Cinematic',
  moody:     'Moody',
  vintage:   'Vintage',
  vibrant:   'Vibrant',
};

const MOTION_STYLES: { key: KenBurnsStyle; label: string; icon: string }[] = [
  { key: 'elegant',    label: 'Elegant',   icon: '✦' },
  { key: 'cinematic',  label: 'Cinematic', icon: '🎬' },
  { key: 'float',      label: 'Float',     icon: '🌊' },
  { key: 'quick-zoom', label: 'Snappy',    icon: '⚡' },
  { key: 'focus-zoom', label: 'Focus',     icon: '🎯' },
];

// ── Types ─────────────────────────────────────────────────────────────────────

interface PageProps {
  params: Promise<{ postId: string }>;
  searchParams: Promise<{ t?: string; phone?: string }>;
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function ReelEditor({ params, searchParams }: PageProps) {
  const { postId }         = use(params);
  const { t: token = '', phone = '' } = use(searchParams);

  const [timeline,      setTimeline]      = useState<KreyaTimeline | null>(null);
  const [previewUrl,    setPreviewUrl]    = useState<string>('');
  const [selectedGrade, setSelectedGrade] = useState<ColorGrade>('natural');
  const [motionStyle,   setMotionStyle]   = useState<KenBurnsStyle>('elegant');
  const [captionOn,     setCaptionOn]     = useState(false);
  const [captionText,   setCaptionText]   = useState('');
  const [loading,       setLoading]       = useState(true);
  const [rendering,     setRendering]     = useState(false);
  const [error,         setError]         = useState('');
  const [bgStyle,       setBgStyle]       = useState<'blur' | 'black'>('blur');
  const [noTimeline,    setNoTimeline]    = useState(false);
  const [dragIdx,       setDragIdx]       = useState<number | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);

  // ── Load post data ──────────────────────────────────────────────────────────

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch(`/api/posts/${postId}/timeline?t=${token}&phone=${encodeURIComponent(phone)}`);
        if (!res.ok) { setError('Could not load post.'); return; }
        const data = await res.json();
        setTimeline(data.timeline);
        setPreviewUrl(data.previewUrl ?? '');
        if (!data.timeline) { setNoTimeline(true); return; }
        setSelectedGrade((data.timeline?.colorGrade as ColorGrade) ?? 'natural');
        setBgStyle(data.timeline?.bgStyle ?? 'blur');
        const firstEffect = data.timeline?.tracks?.video?.[0]?.effect;
        if (firstEffect?.type === 'ken-burns') setMotionStyle(firstEffect.style);
        const caption = data.timeline?.tracks?.captions?.[0];
        if (caption) { setCaptionOn(true); setCaptionText(caption.text); }
      } catch {
        setError('Failed to load editor.');
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [postId, token, phone]);

  // ── Build updated timeline from current UI state ────────────────────────────

  const buildUpdatedTimeline = useCallback((): KreyaTimeline | null => {
    if (!timeline) return null;

    const updatedVideo: VideoTrack[] = timeline.tracks.video.map(track => ({
      ...track,
      effect: track.type === 'image'
        ? { type: 'ken-burns' as const, style: motionStyle, zoomStart: 1.0, zoomEnd: 1.3 }
        : { type: 'static' as const },
    }));

    const captions = captionOn && captionText.trim()
      ? [{
          text:      captionText.trim(),
          startTime: 0,
          duration:  timeline.totalDuration,
          position:  'bottom' as const,
          platform:  'ig-reels' as const,
        }]
      : undefined;

    return {
      ...timeline,
      colorGrade: selectedGrade,
      bgStyle,
      tracks: {
        ...timeline.tracks,
        video:    updatedVideo,
        captions: captions ?? undefined,
      },
    };
  }, [timeline, selectedGrade, motionStyle, captionOn, captionText]);

  // ── Apply changes → trigger server re-render ───────────────────────────────

  async function applyChanges() {
    const updated = buildUpdatedTimeline();
    if (!updated) return;
    setRendering(true);
    try {
      const res = await fetch('/api/posts/update-timeline', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ postId, token, phone, timeline: updated }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Render failed');
      setTimeline(updated);
      setPreviewUrl(data.previewUrl);
      if (videoRef.current) {
        videoRef.current.load();
        videoRef.current.play().catch(() => {});
      }
    } catch (e: any) {
      setError(e.message ?? 'Something went wrong');
    } finally {
      setRendering(false);
    }
  }

  // ── Clip drag-to-reorder ───────────────────────────────────────────────────

  function moveClip(fromIdx: number, toIdx: number) {
    if (!timeline) return;
    const clips = [...timeline.tracks.video];
    const [moved] = clips.splice(fromIdx, 1);
    clips.splice(toIdx, 0, moved);

    // Recalculate startTimes
    let t = 0;
    const reordered = clips.map(c => { const next = { ...c, startTime: t }; t += c.duration; return next; });

    setTimeline({ ...timeline, tracks: { ...timeline.tracks, video: reordered } });
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: 'var(--dark,#0B0918)', color: '#fff' }}>
        <div className="animate-pulse text-center">
          <div className="w-16 h-16 rounded-full border-4 border-violet-500 border-t-transparent animate-spin mx-auto mb-4" />
          <p style={{ color: 'rgba(255,255,255,.5)' }}>Loading editor…</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6" style={{ background: '#0B0918', color: '#fff' }}>
        <div className="text-center">
          <p className="text-red-400 mb-4">{error}</p>
          <p style={{ color: 'rgba(255,255,255,.5)', fontSize: '0.875rem' }}>Close this tab and try again from WhatsApp.</p>
        </div>
      </div>
    );
  }

  if (noTimeline || !timeline) {
    return (
      <div className="min-h-screen" style={{ background: '#0B0918', color: '#fff', fontFamily: 'DM Sans, sans-serif' }}>
        <div className="sticky top-0 z-10 px-4 py-3" style={{ background: '#100E22', borderBottom: '1px solid rgba(255,255,255,.08)' }}>
          <span className="font-semibold" style={{ fontSize: '1rem', fontFamily: 'Syne, sans-serif' }}>Reel Preview</span>
        </div>
        {previewUrl && (
          <div className="relative mx-auto mt-4" style={{ maxWidth: 270, aspectRatio: '9/16' }}>
            <video src={previewUrl} autoPlay loop muted playsInline className="w-full h-full rounded-2xl object-cover" />
          </div>
        )}
        <div className="p-6 text-center mt-4">
          <p style={{ color: 'rgba(255,255,255,.6)', fontSize: '0.9rem' }}>
            This reel was rendered by the GPU engine. Edit motion, music, and style via WhatsApp.
          </p>
        </div>
      </div>
    );
  }

  const cssFilter = COLOR_GRADES[selectedGrade];

  return (
    <div className="min-h-screen pb-24" style={{ background: '#0B0918', color: '#fff', fontFamily: 'DM Sans, sans-serif' }}>

      {/* ── Header ── */}
      <div className="sticky top-0 z-10 flex items-center justify-between px-4 py-3" style={{ background: '#100E22', borderBottom: '1px solid rgba(255,255,255,.08)' }}>
        <span className="font-semibold" style={{ fontSize: '1rem', fontFamily: 'Syne, sans-serif' }}>Edit Reel</span>
        <button
          onClick={applyChanges}
          disabled={rendering}
          className="px-4 py-2 rounded-full text-sm font-semibold transition-opacity disabled:opacity-50"
          style={{ background: '#5E35FF', color: '#fff' }}
        >
          {rendering ? 'Rendering…' : 'Apply'}
        </button>
      </div>

      {/* ── Video preview ── */}
      <div className="relative mx-auto mt-4" style={{ maxWidth: 270, aspectRatio: '9/16' }}>
        <video
          ref={videoRef}
          src={previewUrl}
          autoPlay
          loop
          muted
          playsInline
          className="w-full h-full rounded-2xl object-cover"
          style={{ filter: cssFilter === 'none' ? undefined : cssFilter }}
        />
        {rendering && (
          <div className="absolute inset-0 rounded-2xl flex items-center justify-center" style={{ background: 'rgba(11,9,24,.75)' }}>
            <div className="w-10 h-10 rounded-full border-4 border-violet-400 border-t-transparent animate-spin" />
          </div>
        )}
      </div>

      <div className="px-4 mt-6 space-y-6">

        {/* ── Color Grade strip ── */}
        <section>
          <h2 className="text-sm font-semibold mb-3" style={{ color: 'rgba(255,255,255,.5)', letterSpacing: '0.08em', textTransform: 'uppercase', fontFamily: 'Space Mono, monospace' }}>
            Vibe
          </h2>
          <div className="flex gap-3 overflow-x-auto pb-1 -mx-1 px-1">
            {(Object.keys(COLOR_GRADES) as ColorGrade[]).map(grade => (
              <button
                key={grade}
                onClick={() => setSelectedGrade(grade)}
                className="flex-shrink-0 flex flex-col items-center gap-1.5"
              >
                <div
                  className="w-16 h-16 rounded-xl overflow-hidden border-2 transition-all"
                  style={{
                    borderColor: selectedGrade === grade ? '#5E35FF' : 'transparent',
                    boxShadow:   selectedGrade === grade ? '0 0 0 1px #5E35FF' : 'none',
                  }}
                >
                  {previewUrl ? (
                    <video
                      src={previewUrl}
                      muted
                      playsInline
                      className="w-full h-full object-cover"
                      style={{ filter: COLOR_GRADES[grade] === 'none' ? undefined : COLOR_GRADES[grade] }}
                    />
                  ) : (
                    <div className="w-full h-full" style={{ background: '#201D3C' }} />
                  )}
                </div>
                <span className="text-xs" style={{ color: selectedGrade === grade ? '#5E35FF' : 'rgba(255,255,255,.5)', fontFamily: 'Space Mono, monospace' }}>
                  {GRADE_LABELS[grade]}
                </span>
              </button>
            ))}
          </div>
        </section>

        {/* ── Motion style strip ── */}
        <section>
          <h2 className="text-sm font-semibold mb-3" style={{ color: 'rgba(255,255,255,.5)', letterSpacing: '0.08em', textTransform: 'uppercase', fontFamily: 'Space Mono, monospace' }}>
            Motion
          </h2>
          <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1">
            {MOTION_STYLES.map(({ key, label, icon }) => (
              <button
                key={key}
                onClick={() => setMotionStyle(key)}
                className="flex-shrink-0 flex flex-col items-center gap-1 px-3 py-2 rounded-xl text-sm transition-all"
                style={{
                  background:   motionStyle === key ? '#5E35FF' : '#171430',
                  color:        motionStyle === key ? '#fff' : 'rgba(255,255,255,.6)',
                  border:       `1px solid ${motionStyle === key ? '#5E35FF' : 'rgba(255,255,255,.1)'}`,
                  minWidth:     72,
                }}
              >
                <span style={{ fontSize: '1.25rem' }}>{icon}</span>
                <span style={{ fontSize: '0.75rem', fontFamily: 'Space Mono, monospace' }}>{label}</span>
              </button>
            ))}
          </div>
        </section>

        {/* ── Clip order ── */}
        {timeline.tracks.video.length > 1 && (
          <section>
            <h2 className="text-sm font-semibold mb-3" style={{ color: 'rgba(255,255,255,.5)', letterSpacing: '0.08em', textTransform: 'uppercase', fontFamily: 'Space Mono, monospace' }}>
              Clips <span style={{ color: 'rgba(255,255,255,.25)', fontSize: '0.7rem' }}>· hold to drag</span>
            </h2>
            <div className="flex gap-2 overflow-x-auto pb-1">
              {timeline.tracks.video.map((track, idx) => (
                <div
                  key={idx}
                  draggable
                  onDragStart={() => setDragIdx(idx)}
                  onDragOver={e => e.preventDefault()}
                  onDrop={() => { if (dragIdx !== null && dragIdx !== idx) moveClip(dragIdx, idx); setDragIdx(null); }}
                  className="flex-shrink-0 relative rounded-xl overflow-hidden cursor-grab active:cursor-grabbing"
                  style={{
                    width:   64,
                    height:  114,
                    background: '#201D3C',
                    border:  dragIdx === idx ? '2px solid #5E35FF' : '2px solid transparent',
                    opacity: dragIdx === idx ? 0.5 : 1,
                  }}
                >
                  <img
                    src={track.src}
                    alt={`Clip ${idx + 1}`}
                    className="w-full h-full object-cover"
                    onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }}
                  />
                  <div className="absolute bottom-1 left-0 right-0 text-center" style={{ fontSize: '0.65rem', color: 'rgba(255,255,255,.7)', fontFamily: 'Space Mono, monospace' }}>
                    {idx + 1}
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* ── Caption toggle ── */}
        <section>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold" style={{ color: 'rgba(255,255,255,.5)', letterSpacing: '0.08em', textTransform: 'uppercase', fontFamily: 'Space Mono, monospace' }}>
              Caption on video
            </h2>
            <button
              onClick={() => setCaptionOn(v => !v)}
              className="relative inline-flex h-6 w-11 items-center rounded-full transition-colors"
              style={{ background: captionOn ? '#5E35FF' : '#201D3C' }}
            >
              <span
                className="inline-block h-4 w-4 rounded-full bg-white shadow transition-transform"
                style={{ transform: captionOn ? 'translateX(1.375rem)' : 'translateX(0.25rem)' }}
              />
            </button>
          </div>
          {captionOn && (
            <textarea
              value={captionText}
              onChange={e => setCaptionText(e.target.value)}
              placeholder="Caption text burned onto the video…"
              rows={3}
              className="w-full rounded-xl px-3 py-2 text-sm resize-none outline-none"
              style={{ background: '#171430', color: '#fff', border: '1px solid rgba(255,255,255,.1)', fontFamily: 'DM Sans, sans-serif' }}
            />
          )}
        </section>

        {/* ── Background style ── */}
        <section>
          <h2 className="text-sm font-semibold mb-3" style={{ color: 'rgba(255,255,255,.5)', letterSpacing: '0.08em', textTransform: 'uppercase', fontFamily: 'Space Mono, monospace' }}>
            Background
          </h2>
          <div className="flex gap-3">
            {([
              { key: 'blur',  label: '🌫️ Blur fill',  desc: 'Fills frame with blurred clip' },
              { key: 'black', label: '⬛ Black bars', desc: 'Classic letterbox' },
            ] as const).map(({ key, label, desc }) => (
              <button
                key={key}
                onClick={() => setBgStyle(key)}
                className="flex-1 flex flex-col items-start gap-1 px-3 py-3 rounded-xl text-sm transition-all"
                style={{
                  background: bgStyle === key ? '#5E35FF22' : '#171430',
                  border:     `1px solid ${bgStyle === key ? '#5E35FF' : 'rgba(255,255,255,.1)'}`,
                  color:      bgStyle === key ? '#fff' : 'rgba(255,255,255,.6)',
                }}
              >
                <span style={{ fontSize: '0.875rem', fontWeight: 600 }}>{label}</span>
                <span style={{ fontSize: '0.7rem', color: 'rgba(255,255,255,.4)', fontFamily: 'Space Mono, monospace' }}>{desc}</span>
              </button>
            ))}
          </div>
        </section>

      </div>

      {/* ── Sticky bottom Apply bar ── */}
      <div className="fixed bottom-0 left-0 right-0 p-4" style={{ background: 'linear-gradient(to top, #0B0918 70%, transparent)' }}>
        <button
          onClick={applyChanges}
          disabled={rendering}
          className="w-full py-3 rounded-2xl font-semibold text-base transition-opacity disabled:opacity-50"
          style={{ background: 'linear-gradient(135deg,#5E35FF,#FF4F3B)', color: '#fff', fontFamily: 'Syne, sans-serif' }}
        >
          {rendering ? 'Rendering your reel…' : 'Apply Changes'}
        </button>
      </div>

    </div>
  );
}
