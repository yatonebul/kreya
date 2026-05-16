'use client';

import { useEffect, useRef, useState, useCallback, use } from 'react';
import type { KreyaTimeline, VideoTrack, ColorGrade, KenBurnsStyle } from '@/lib/timeline-schema';

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
  natural: 'Natural', warm: 'Warm', cool: 'Cool',
  cinematic: 'Cinematic', moody: 'Moody', vintage: 'Vintage', vibrant: 'Vibrant',
};

const MOTION_STYLES: { key: KenBurnsStyle; label: string; icon: string }[] = [
  { key: 'elegant',    label: 'Elegant',   icon: '✦' },
  { key: 'cinematic',  label: 'Cinematic', icon: '🎬' },
  { key: 'float',      label: 'Float',     icon: '🌊' },
  { key: 'quick-zoom', label: 'Snappy',    icon: '⚡' },
  { key: 'focus-zoom', label: 'Focus',     icon: '🎯' },
];

const MUSIC_PREFS = [
  { key: 'auto',     label: '✨ Auto',    desc: 'Best match' },
  { key: 'trending', label: '🔥 Trending', desc: 'Hot audio' },
  { key: 'calm',     label: '😌 Calm',    desc: 'Chill vibes' },
  { key: 'none',     label: '🔇 Silent',  desc: 'No music' },
];

interface PageProps {
  params:       Promise<{ postId: string }>;
  searchParams: Promise<{ t?: string; phone?: string }>;
}

export default function ReelEditor({ params, searchParams }: PageProps) {
  const { postId }                    = use(params);
  const { t: token = '', phone = '' } = use(searchParams);

  const [timeline,        setTimeline]        = useState<KreyaTimeline | null>(null);
  const [previewUrl,      setPreviewUrl]      = useState('');
  const [selectedGrade,   setSelectedGrade]   = useState<ColorGrade>('natural');
  const [motionStyle,     setMotionStyle]     = useState<KenBurnsStyle>('elegant');
  const [captionOn,       setCaptionOn]       = useState(false);
  const [captionText,     setCaptionText]     = useState('');
  const [captionPosition, setCaptionPosition] = useState<'bottom' | 'center' | 'top'>('bottom');
  const [postCaption,     setPostCaption]     = useState('');
  const [bgStyle,         setBgStyle]         = useState<'blur' | 'black'>('blur');
  const [musicPref,       setMusicPref]       = useState('auto');
  const [loading,         setLoading]         = useState(true);
  const [rendering,       setRendering]       = useState(false);
  const [renderingBg,     setRenderingBg]     = useState(false);
  const [renderDone,      setRenderDone]      = useState(false);
  const [error,           setError]           = useState('');
  const [dragIdx,         setDragIdx]         = useState<number | null>(null);
  const [noTimeline,      setNoTimeline]      = useState(false);

  const videoRef              = useRef<HTMLVideoElement>(null);
  const renderStartUrlRef     = useRef<string>('');
  const pollIntervalRef       = useRef<ReturnType<typeof setInterval> | null>(null);
  const pollTimeoutRef        = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch(`/api/posts/${postId}/timeline?t=${token}&phone=${encodeURIComponent(phone)}`);
        if (!res.ok) { setError(res.status === 404 ? 'Post not found' : 'Could not load post.'); return; }
        const data = await res.json();
        setPreviewUrl(data.previewUrl ?? '');
        setPostCaption(data.caption ?? '');
        if (!data.timeline) {
          setNoTimeline(true);
          setMotionStyle((data.animationStyle as KenBurnsStyle) ?? 'elegant');
          return;
        }
        setTimeline(data.timeline);
        setSelectedGrade((data.timeline?.colorGrade as ColorGrade) ?? 'natural');
        setBgStyle(data.timeline?.bgStyle ?? 'blur');
        const firstEffect = data.timeline?.tracks?.video?.[0]?.effect;
        if (firstEffect?.type === 'ken-burns') setMotionStyle(firstEffect.style);
        const cap = data.timeline?.tracks?.captions?.[0];
        if (cap) { setCaptionOn(true); setCaptionText(cap.text); setCaptionPosition(cap.position ?? 'bottom'); }
        if (!data.timeline?.tracks?.audio) setMusicPref('none');
      } catch { setError('Failed to load editor.'); }
      finally { setLoading(false); }
    }
    load();
  }, [postId, token, phone]);

  // Poll for render completion after a background render starts
  useEffect(() => {
    if (!renderingBg) {
      if (pollIntervalRef.current) { clearInterval(pollIntervalRef.current); pollIntervalRef.current = null; }
      if (pollTimeoutRef.current)  { clearTimeout(pollTimeoutRef.current);   pollTimeoutRef.current  = null; }
      return;
    }
    // Poll every 5s for up to 90s, then surface error
    pollIntervalRef.current = setInterval(async () => {
      try {
        const res = await fetch(`/api/posts/${postId}/timeline?t=${token}&phone=${encodeURIComponent(phone)}`);
        if (!res.ok) return;
        const data = await res.json();
        if (data.previewUrl && data.previewUrl !== renderStartUrlRef.current) {
          setPreviewUrl(data.previewUrl);
          setRenderingBg(false);
          setRenderDone(true);
          if (videoRef.current) { videoRef.current.load(); videoRef.current.play().catch(() => {}); }
          if (pollIntervalRef.current) { clearInterval(pollIntervalRef.current); pollIntervalRef.current = null; }
          if (pollTimeoutRef.current)  { clearTimeout(pollTimeoutRef.current);   pollTimeoutRef.current  = null; }
        }
      } catch {}
    }, 5000);
    // Timeout: if no update after 90s, render has failed
    pollTimeoutRef.current = setTimeout(() => {
      if (pollIntervalRef.current) { clearInterval(pollIntervalRef.current); pollIntervalRef.current = null; }
      setRenderingBg(false);
      setError('Render timed out — check WhatsApp for a retry button, or tap Apply Changes to try again.');
    }, 90_000);
    return () => {
      if (pollIntervalRef.current) { clearInterval(pollIntervalRef.current); pollIntervalRef.current = null; }
      if (pollTimeoutRef.current)  { clearTimeout(pollTimeoutRef.current);   pollTimeoutRef.current  = null; }
    };
  }, [renderingBg, postId, token, phone]);

  const buildUpdatedTimeline = useCallback((): KreyaTimeline | null => {
    if (!timeline) return null;
    const updatedVideo: VideoTrack[] = timeline.tracks.video.map(track => ({
      ...track,
      effect: track.type === 'image'
        ? { type: 'ken-burns' as const, style: motionStyle, zoomStart: 1.0, zoomEnd: 1.3 }
        : { type: 'static' as const },
    }));
    const captions = captionOn && captionText.trim()
      ? [{ text: captionText.trim(), startTime: 0, duration: timeline.totalDuration, position: captionPosition, platform: 'ig-reels' as const }]
      : undefined;
    return { ...timeline, colorGrade: selectedGrade, bgStyle, tracks: { ...timeline.tracks, video: updatedVideo, captions: captions ?? undefined } };
  }, [timeline, selectedGrade, bgStyle, motionStyle, captionOn, captionText, captionPosition]);

  async function applyChanges() {
    setRendering(true);
    setRenderingBg(false);
    setRenderDone(false);
    setError('');
    renderStartUrlRef.current = previewUrl;
    try {
      if (noTimeline || !timeline) {
        const res = await fetch(`/api/posts/${postId}/rerender`, {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify({
            token, phone,
            animationStyle:  motionStyle,
            musicPreference: musicPref,
            colorGrade:      selectedGrade,
            bgStyle,
            captionText:     captionOn ? captionText.trim() : undefined,
            captionPosition: captionOn ? captionPosition : undefined,
            postCaption,
          }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? 'Render failed');
        if (data.status === 'rendering') { setRenderingBg(true); setNoTimeline(false); return; }
        setPreviewUrl(data.previewUrl);
        setNoTimeline(false);
        if (videoRef.current) { videoRef.current.load(); videoRef.current.play().catch(() => {}); }
        return;
      }
      const updated = buildUpdatedTimeline();
      if (!updated) return;
      const res = await fetch('/api/posts/update-timeline', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ postId, token, phone, timeline: updated, musicPreference: musicPref, postCaption }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Render failed');
      if (data.status === 'rendering') { setRenderingBg(true); setTimeline(updated); return; }
      setTimeline(updated);
      setPreviewUrl(data.previewUrl);
      if (videoRef.current) { videoRef.current.load(); videoRef.current.play().catch(() => {}); }
    } catch (e: any) {
      setError(e.message ?? 'Something went wrong');
    } finally {
      setRendering(false);
    }
  }

  function moveClip(fromIdx: number, toIdx: number) {
    if (!timeline) return;
    const clips = [...timeline.tracks.video];
    const [moved] = clips.splice(fromIdx, 1);
    clips.splice(toIdx, 0, moved);
    let t = 0;
    const reordered = clips.map(c => { const next = { ...c, startTime: t }; t += c.duration; return next; });
    setTimeline({ ...timeline, tracks: { ...timeline.tracks, video: reordered } });
  }

  const cssFilter = COLOR_GRADES[selectedGrade];

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: '#0B0918', color: '#fff' }}>
        <div className="text-center">
          <div className="w-16 h-16 rounded-full border-4 border-violet-500 border-t-transparent animate-spin mx-auto mb-4" />
          <p style={{ color: 'rgba(255,255,255,.5)' }}>Loading editor…</p>
        </div>
      </div>
    );
  }

  if (error && !timeline && !noTimeline) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6" style={{ background: '#0B0918', color: '#fff' }}>
        <div className="text-center">
          <p className="text-red-400 mb-4">{error}</p>
          <p style={{ color: 'rgba(255,255,255,.5)', fontSize: '0.875rem' }}>Close this tab and try again from WhatsApp.</p>
        </div>
      </div>
    );
  }

  const hasImage = !!(timeline?.tracks.video.some(t => t.type === 'image') ?? noTimeline);

  return (
    <div className="min-h-screen pb-28" style={{ background: '#0B0918', color: '#fff', fontFamily: 'DM Sans, sans-serif' }}>

      {/* Header */}
      <div className="sticky top-0 z-10 flex items-center justify-between px-4 py-3" style={{ background: '#100E22', borderBottom: '1px solid rgba(255,255,255,.08)' }}>
        <span className="font-semibold" style={{ fontSize: '1rem', fontFamily: 'Syne, sans-serif' }}>Edit Reel</span>
        <button onClick={applyChanges} disabled={rendering}
          className="px-4 py-2 rounded-full text-sm font-semibold transition-opacity disabled:opacity-50"
          style={{ background: '#5E35FF', color: '#fff' }}>
          {rendering ? 'Rendering…' : 'Apply'}
        </button>
      </div>

      {/* Video preview */}
      <div className="relative mx-auto mt-4" style={{ maxWidth: 270, aspectRatio: '9/16' }}>
        {previewUrl ? (
          <video ref={videoRef} src={previewUrl} autoPlay loop muted playsInline
            className="w-full h-full rounded-2xl object-cover"
            style={{ filter: cssFilter === 'none' ? undefined : cssFilter }} />
        ) : (
          <div className="w-full h-full rounded-2xl flex items-center justify-center" style={{ background: '#201D3C' }}>
            <span style={{ color: 'rgba(255,255,255,.3)' }}>No preview</span>
          </div>
        )}
        {(rendering || renderingBg) && (
          <div className="absolute inset-0 rounded-2xl flex flex-col items-center justify-center gap-3" style={{ background: 'rgba(11,9,24,.75)' }}>
            <div className="w-10 h-10 rounded-full border-4 border-violet-400 border-t-transparent animate-spin" />
            {renderingBg && <p className="text-xs text-center px-4" style={{ color: 'rgba(255,255,255,.6)', fontFamily: 'DM Sans, sans-serif' }}>Rendering in background…</p>}
          </div>
        )}
        {captionOn && captionText && (
          <div className={`absolute left-2 right-2 text-center pointer-events-none ${captionPosition === 'top' ? 'top-8' : captionPosition === 'center' ? 'top-1/2 -translate-y-1/2' : 'bottom-8'}`}>
            <span className="text-xs px-2 py-1 rounded" style={{ background: 'rgba(0,0,0,.55)', color: '#fff', fontFamily: 'DM Sans, sans-serif' }}>
              {captionText.slice(0, 60)}{captionText.length > 60 ? '…' : ''}
            </span>
          </div>
        )}
      </div>

      <div className="px-4 mt-6 space-y-6">

        {/* Render status banners */}
        {renderingBg && (
          <div className="rounded-xl px-4 py-3 text-sm text-center" style={{ background: '#171430', border: '1px solid #5E35FF', color: 'rgba(255,255,255,.8)', fontFamily: 'DM Sans, sans-serif' }}>
            ⏳ Rendering in the background — preview will update here and arrive on WhatsApp in ~30s
          </div>
        )}
        {renderDone && !renderingBg && (
          <div className="rounded-xl px-4 py-3 text-sm text-center" style={{ background: '#0a2a1a', border: '1px solid #00E5A0', color: '#00E5A0', fontFamily: 'DM Sans, sans-serif' }}>
            ✅ Preview updated! Check WhatsApp to approve or keep editing.
          </div>
        )}
        {error && <p className="text-red-400 text-sm text-center">{error}</p>}

        {/* Vibe (Color Grade) */}
        <section>
          <h2 className="text-sm font-semibold mb-3" style={{ color: 'rgba(255,255,255,.5)', letterSpacing: '0.08em', textTransform: 'uppercase', fontFamily: 'Space Mono, monospace' }}>Vibe</h2>
          <div className="flex gap-3 overflow-x-auto pb-1 -mx-1 px-1">
            {(Object.keys(COLOR_GRADES) as ColorGrade[]).map(grade => (
              <button key={grade} onClick={() => setSelectedGrade(grade)} className="flex-shrink-0 flex flex-col items-center gap-1.5">
                <div className="w-16 h-16 rounded-xl overflow-hidden border-2 transition-all"
                  style={{ borderColor: selectedGrade === grade ? '#5E35FF' : 'transparent', boxShadow: selectedGrade === grade ? '0 0 0 1px #5E35FF' : 'none' }}>
                  {previewUrl ? (
                    <video src={previewUrl} muted playsInline className="w-full h-full object-cover"
                      style={{ filter: COLOR_GRADES[grade] === 'none' ? undefined : COLOR_GRADES[grade] }} />
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

        {/* Motion */}
        {hasImage && (
          <section>
            <h2 className="text-sm font-semibold mb-3" style={{ color: 'rgba(255,255,255,.5)', letterSpacing: '0.08em', textTransform: 'uppercase', fontFamily: 'Space Mono, monospace' }}>Motion</h2>
            <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1">
              {MOTION_STYLES.map(({ key, label, icon }) => (
                <button key={key} onClick={() => setMotionStyle(key)}
                  className="flex-shrink-0 flex flex-col items-center gap-1 px-3 py-2 rounded-xl text-sm transition-all"
                  style={{ background: motionStyle === key ? '#5E35FF' : '#171430', color: motionStyle === key ? '#fff' : 'rgba(255,255,255,.6)', border: `1px solid ${motionStyle === key ? '#5E35FF' : 'rgba(255,255,255,.1)'}`, minWidth: 72 }}>
                  <span style={{ fontSize: '1.25rem' }}>{icon}</span>
                  <span style={{ fontSize: '0.75rem', fontFamily: 'Space Mono, monospace' }}>{label}</span>
                </button>
              ))}
            </div>
          </section>
        )}

        {/* Background */}
        <section>
          <h2 className="text-sm font-semibold mb-3" style={{ color: 'rgba(255,255,255,.5)', letterSpacing: '0.08em', textTransform: 'uppercase', fontFamily: 'Space Mono, monospace' }}>Background</h2>
          <div className="flex gap-3">
            {([{ key: 'blur', label: '🌫️ Blur fill', desc: 'Fills frame with blurred clip' }, { key: 'black', label: '⬛ Black bars', desc: 'Classic letterbox' }] as const).map(({ key, label, desc }) => (
              <button key={key} onClick={() => setBgStyle(key)}
                className="flex-1 flex flex-col items-start gap-1 px-3 py-3 rounded-xl text-sm transition-all"
                style={{ background: bgStyle === key ? '#5E35FF22' : '#171430', border: `1px solid ${bgStyle === key ? '#5E35FF' : 'rgba(255,255,255,.1)'}`, color: bgStyle === key ? '#fff' : 'rgba(255,255,255,.6)' }}>
                <span style={{ fontWeight: 600 }}>{label}</span>
                <span style={{ fontSize: '0.7rem', color: 'rgba(255,255,255,.4)', fontFamily: 'Space Mono, monospace' }}>{desc}</span>
              </button>
            ))}
          </div>
        </section>

        {/* Music */}
        <section>
          <h2 className="text-sm font-semibold mb-3" style={{ color: 'rgba(255,255,255,.5)', letterSpacing: '0.08em', textTransform: 'uppercase', fontFamily: 'Space Mono, monospace' }}>Music</h2>
          <div className="grid grid-cols-2 gap-2">
            {MUSIC_PREFS.map(({ key, label, desc }) => (
              <button key={key} onClick={() => setMusicPref(key)}
                className="flex flex-col items-start gap-0.5 px-3 py-2 rounded-xl text-sm transition-all"
                style={{ background: musicPref === key ? '#5E35FF22' : '#171430', border: `1px solid ${musicPref === key ? '#5E35FF' : 'rgba(255,255,255,.1)'}`, color: musicPref === key ? '#fff' : 'rgba(255,255,255,.6)' }}>
                <span style={{ fontWeight: 600, fontSize: '0.85rem' }}>{label}</span>
                <span style={{ fontSize: '0.7rem', color: 'rgba(255,255,255,.35)', fontFamily: 'Space Mono, monospace' }}>{desc}</span>
              </button>
            ))}
          </div>
        </section>

        {/* Caption on video */}
        <section>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold" style={{ color: 'rgba(255,255,255,.5)', letterSpacing: '0.08em', textTransform: 'uppercase', fontFamily: 'Space Mono, monospace' }}>Caption on video</h2>
            <button onClick={() => setCaptionOn(v => !v)}
              className="relative inline-flex h-6 w-11 items-center rounded-full transition-colors"
              style={{ background: captionOn ? '#5E35FF' : '#201D3C' }}>
              <span className="inline-block h-4 w-4 rounded-full bg-white shadow transition-transform"
                style={{ transform: captionOn ? 'translateX(1.375rem)' : 'translateX(0.25rem)' }} />
            </button>
          </div>
          {captionOn && (
            <>
              <textarea value={captionText} onChange={e => setCaptionText(e.target.value)}
                placeholder="Text burned onto the video…" rows={3}
                className="w-full rounded-xl px-3 py-2 text-sm resize-none outline-none"
                style={{ background: '#171430', color: '#fff', border: '1px solid rgba(255,255,255,.1)', fontFamily: 'DM Sans, sans-serif' }} />
              <div className="flex gap-2 mt-2">
                {([{ key: 'top', label: '↑ Top' }, { key: 'center', label: '⬛ Center' }, { key: 'bottom', label: '↓ Bottom' }] as const).map(({ key, label }) => (
                  <button key={key} onClick={() => setCaptionPosition(key)}
                    className="flex-1 py-1.5 rounded-lg text-xs font-medium transition-all"
                    style={{ background: captionPosition === key ? '#5E35FF' : '#171430', color: captionPosition === key ? '#fff' : 'rgba(255,255,255,.5)', border: `1px solid ${captionPosition === key ? '#5E35FF' : 'rgba(255,255,255,.1)'}`, fontFamily: 'Space Mono, monospace' }}>
                    {label}
                  </button>
                ))}
              </div>
            </>
          )}
        </section>

        {/* Post caption (Instagram / TikTok text) */}
        <section>
          <h2 className="text-sm font-semibold mb-1" style={{ color: 'rgba(255,255,255,.5)', letterSpacing: '0.08em', textTransform: 'uppercase', fontFamily: 'Space Mono, monospace' }}>Post caption</h2>
          <p className="text-xs mb-2" style={{ color: 'rgba(255,255,255,.3)', fontFamily: 'DM Sans, sans-serif' }}>Text shown on Instagram / TikTok (not burned into the video)</p>
          <textarea value={postCaption} onChange={e => setPostCaption(e.target.value)}
            placeholder="Write your Instagram caption, hashtags…" rows={4}
            className="w-full rounded-xl px-3 py-2 text-sm resize-none outline-none"
            style={{ background: '#171430', color: '#fff', border: '1px solid rgba(255,255,255,.1)', fontFamily: 'DM Sans, sans-serif' }} />
        </section>

        {/* Clip order (multi-clip only) */}
        {!noTimeline && timeline && timeline.tracks.video.length > 1 && (
          <section>
            <h2 className="text-sm font-semibold mb-3" style={{ color: 'rgba(255,255,255,.5)', letterSpacing: '0.08em', textTransform: 'uppercase', fontFamily: 'Space Mono, monospace' }}>
              Clips <span style={{ color: 'rgba(255,255,255,.25)', fontSize: '0.7rem' }}>· drag to reorder</span>
            </h2>
            <div className="flex gap-2 overflow-x-auto pb-1">
              {timeline.tracks.video.map((track, idx) => (
                <div key={idx} draggable
                  onDragStart={() => setDragIdx(idx)}
                  onDragOver={e => e.preventDefault()}
                  onDrop={() => { if (dragIdx !== null && dragIdx !== idx) moveClip(dragIdx, idx); setDragIdx(null); }}
                  className="flex-shrink-0 relative rounded-xl overflow-hidden cursor-grab active:cursor-grabbing"
                  style={{ width: 64, height: 114, background: '#201D3C', border: dragIdx === idx ? '2px solid #5E35FF' : '2px solid transparent', opacity: dragIdx === idx ? 0.5 : 1 }}>
                  <img src={track.src} alt={`Clip ${idx + 1}`} className="w-full h-full object-cover"
                    onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                  <div className="absolute bottom-1 left-0 right-0 text-center" style={{ fontSize: '0.65rem', color: 'rgba(255,255,255,.7)', fontFamily: 'Space Mono, monospace' }}>
                    {idx + 1}
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

      </div>

      {/* Sticky Apply bar */}
      <div className="fixed bottom-0 left-0 right-0 p-4" style={{ background: 'linear-gradient(to top, #0B0918 70%, transparent)' }}>
        <button onClick={applyChanges} disabled={rendering}
          className="w-full py-3 rounded-2xl font-semibold text-base transition-opacity disabled:opacity-50"
          style={{ background: 'linear-gradient(135deg,#5E35FF,#FF4F3B)', color: '#fff', fontFamily: 'Syne, sans-serif' }}>
          {rendering ? 'Rendering your reel…' : 'Apply Changes'}
        </button>
      </div>

    </div>
  );
}
