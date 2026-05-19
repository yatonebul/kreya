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

type RenderStatus = 'idle' | 'submitting' | 'background' | 'done' | 'failed';

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
  const [sourceImageUrl,  setSourceImageUrl]  = useState('');  // original image for CSS-filter previews
  const [loading,         setLoading]         = useState(true);
  const [loadError,       setLoadError]       = useState('');  // full-screen error
  const [renderStatus,    setRenderStatus]    = useState<RenderStatus>('idle');
  const [renderMsg,       setRenderMsg]       = useState('');  // inline status message
  const [dragIdx,         setDragIdx]         = useState<number | null>(null);
  const [noTimeline,      setNoTimeline]      = useState(false);

  const videoRef           = useRef<HTMLVideoElement>(null);
  const renderStartUrlRef  = useRef<string>('');
  const pollIntervalRef    = useRef<ReturnType<typeof setInterval> | null>(null);
  const pollTimeoutRef     = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch(`/api/posts/${postId}/timeline?t=${token}&phone=${encodeURIComponent(phone)}`);
        if (!res.ok) { setLoadError(res.status === 404 ? 'Post not found.' : 'Could not load post.'); return; }
        const data = await res.json();
        setPreviewUrl(data.previewUrl ?? '');
        setSourceImageUrl(data.userImageUrl ?? '');
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
      } catch { setLoadError('Failed to load editor.'); }
      finally { setLoading(false); }
    }
    load();
  }, [postId, token, phone]);

  function stopPolling() {
    if (pollIntervalRef.current) { clearInterval(pollIntervalRef.current); pollIntervalRef.current = null; }
    if (pollTimeoutRef.current)  { clearTimeout(pollTimeoutRef.current);   pollTimeoutRef.current  = null; }
  }

  // Poll for render completion after a background render starts
  useEffect(() => {
    if (renderStatus !== 'background') { stopPolling(); return; }

    pollIntervalRef.current = setInterval(async () => {
      try {
        const res = await fetch(`/api/posts/${postId}/timeline?t=${token}&phone=${encodeURIComponent(phone)}`);
        if (!res.ok) return;
        const data = await res.json();
        if (data.previewUrl && data.previewUrl !== renderStartUrlRef.current) {
          setPreviewUrl(data.previewUrl);
          setRenderStatus('done');
          setRenderMsg('✅ Preview ready! Check WhatsApp to approve or keep editing.');
          stopPolling();
          if (videoRef.current) { videoRef.current.load(); videoRef.current.play().catch(() => {}); }
        }
      } catch {}
    }, 5000);

    // Timeout after 90s — render has failed
    pollTimeoutRef.current = setTimeout(() => {
      stopPolling();
      setRenderStatus('failed');
      setRenderMsg('Render timed out. Check WhatsApp for a retry button, or tap Retry below.');
    }, 90_000);

    return stopPolling;
  }, [renderStatus, postId, token, phone]);

  function toggleCaptionOn() {
    if (!captionOn && !captionText.trim() && postCaption) {
      const noTags = postCaption.replace(/#\S+/g, '').replace(/\s{2,}/g, ' ').trim();
      const firstLine = noTags.split('\n')[0].trim();
      const short = firstLine.length > 60 ? firstLine.slice(0, 60).replace(/\s+\S*$/, '…') : firstLine;
      if (short) setCaptionText(short);
    }
    setCaptionOn(v => !v);
  }

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
    setRenderStatus('submitting');
    setRenderMsg('');
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
        if (!res.ok) { setRenderStatus('failed'); setRenderMsg(data.error ?? 'Render failed.'); return; }
        if (data.status === 'rendering') { setRenderStatus('background'); setNoTimeline(false); return; }
        setPreviewUrl(data.previewUrl);
        setNoTimeline(false);
        setRenderStatus('done');
        setRenderMsg('✅ Preview ready!');
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
      if (!res.ok) { setRenderStatus('failed'); setRenderMsg(data.error ?? 'Render failed.'); return; }
      if (data.status === 'rendering') { setRenderStatus('background'); setTimeline(updated); return; }
      setTimeline(updated);
      setPreviewUrl(data.previewUrl);
      setRenderStatus('done');
      setRenderMsg('✅ Preview ready!');
      if (videoRef.current) { videoRef.current.load(); videoRef.current.play().catch(() => {}); }
    } catch (e: any) {
      setRenderStatus('failed');
      setRenderMsg(e.message ?? 'Something went wrong');
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
  const isRendering = renderStatus === 'submitting' || renderStatus === 'background';

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

  if (loadError) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6" style={{ background: '#0B0918', color: '#fff' }}>
        <div className="text-center">
          <p className="text-red-400 mb-4">{loadError}</p>
          <p style={{ color: 'rgba(255,255,255,.5)', fontSize: '0.875rem' }}>Close this tab and try again from WhatsApp.</p>
        </div>
      </div>
    );
  }

  const hasImage = !!(timeline?.tracks.video.some(t => t.type === 'image') ?? noTimeline);

  // ── Fixed render status bar (visible everywhere while scrolling) ──────────
  function RenderStatusBar() {
    if (renderStatus === 'idle') return null;

    const configs = {
      submitting: { bg: '#100E22', border: '#5E35FF', text: 'rgba(255,255,255,.9)', icon: null,  msg: 'Submitting…' },
      background: { bg: '#100E22', border: '#5E35FF', text: 'rgba(255,255,255,.9)', icon: 'spin', msg: 'Rendering in background — video updates here when done' },
      done:       { bg: '#0a2a1a', border: '#00E5A0', text: '#00E5A0',              icon: '✅',   msg: renderMsg },
      failed:     { bg: '#2a0a0a', border: '#FF4F3B', text: '#FF6B59',              icon: '⚠️',  msg: renderMsg },
    };
    const c = configs[renderStatus];
    return (
      <div className="fixed left-0 right-0 z-40 px-4 py-2.5 flex items-center gap-3"
        style={{ top: 52, background: c.bg, borderBottom: `1px solid ${c.border}` }}>
        {c.icon === 'spin'
          ? <div className="w-4 h-4 rounded-full border-2 border-violet-400 border-t-transparent animate-spin flex-shrink-0" />
          : c.icon ? <span className="flex-shrink-0">{c.icon}</span>
          : <div className="w-4 h-4 rounded-full border-2 border-violet-400 border-t-transparent animate-spin flex-shrink-0" />
        }
        <p className="flex-1 text-xs leading-snug" style={{ color: c.text, fontFamily: 'DM Sans, sans-serif' }}>{c.msg}</p>
        {renderStatus === 'failed' && (
          <button onClick={applyChanges}
            className="flex-shrink-0 px-3 py-1 rounded-full text-xs font-semibold"
            style={{ background: '#FF4F3B', color: '#fff', fontFamily: 'Space Mono, monospace' }}>
            Retry
          </button>
        )}
        {renderStatus === 'done' && (
          <button onClick={() => setRenderStatus('idle')}
            className="flex-shrink-0 text-lg leading-none" style={{ color: 'rgba(255,255,255,.4)' }}>
            ×
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="min-h-screen pb-28" style={{ background: '#0B0918', color: '#fff', fontFamily: 'DM Sans, sans-serif' }}>

      {/* Sticky header */}
      <div className="sticky top-0 z-50 flex items-center justify-between px-4 py-3"
        style={{ background: '#100E22', borderBottom: '1px solid rgba(255,255,255,.08)', height: 52 }}>
        <span className="font-semibold" style={{ fontSize: '1rem', fontFamily: 'Syne, sans-serif' }}>Edit Reel</span>
        <button onClick={applyChanges} disabled={isRendering}
          className="px-4 py-2 rounded-full text-sm font-semibold transition-opacity disabled:opacity-50"
          style={{ background: '#5E35FF', color: '#fff' }}>
          {renderStatus === 'submitting' ? 'Sending…' : isRendering ? 'Rendering…' : 'Apply'}
        </button>
      </div>

      {/* Fixed render status bar — below header, always visible while scrolling */}
      <RenderStatusBar />

      {/* Spacer for the fixed status bar when visible */}
      {renderStatus !== 'idle' && <div style={{ height: 44 }} />}

      {/* Video preview */}
      <div className="relative mx-auto mt-4" style={{ maxWidth: 270, aspectRatio: '9/16' }}>
        {previewUrl ? (
          <video ref={videoRef} src={previewUrl} autoPlay loop muted playsInline
            className="w-full h-full rounded-2xl object-cover"
            style={{ filter: cssFilter === 'none' ? undefined : cssFilter }} />
        ) : (
          <div className="w-full h-full rounded-2xl flex items-center justify-center" style={{ background: '#201D3C' }}>
            <span style={{ color: 'rgba(255,255,255,.3)' }}>No preview yet</span>
          </div>
        )}
        {isRendering && (
          <div className="absolute inset-0 rounded-2xl flex flex-col items-center justify-center gap-3"
            style={{ background: 'rgba(11,9,24,.75)' }}>
            <div className="w-10 h-10 rounded-full border-4 border-violet-400 border-t-transparent animate-spin" />
            {renderStatus === 'background' && (
              <p className="text-xs text-center px-4" style={{ color: 'rgba(255,255,255,.6)' }}>Rendering…</p>
            )}
          </div>
        )}
        {captionOn && captionText && !previewUrl && (
          <div className={`absolute left-2 right-2 text-center pointer-events-none ${captionPosition === 'top' ? 'top-8' : captionPosition === 'center' ? 'top-1/2 -translate-y-1/2' : 'bottom-8'}`}>
            <span className="text-xs px-2 py-1 rounded" style={{ background: 'rgba(0,0,0,.55)', color: '#fff' }}>
              {captionText.slice(0, 60)}{captionText.length > 60 ? '…' : ''}
            </span>
          </div>
        )}
      </div>

      <div className="px-4 mt-6 space-y-6">

        {/* Vibe (Color Grade) */}
        <section>
          <h2 className="text-sm font-semibold mb-3" style={{ color: 'rgba(255,255,255,.5)', letterSpacing: '0.08em', textTransform: 'uppercase', fontFamily: 'Space Mono, monospace' }}>Vibe</h2>
          <div className="flex gap-3 overflow-x-auto pb-1 -mx-1 px-1">
            {(Object.keys(COLOR_GRADES) as ColorGrade[]).map(grade => (
              <button key={grade} onClick={() => setSelectedGrade(grade)} className="flex-shrink-0 flex flex-col items-center gap-1.5">
                <div className="w-16 h-16 rounded-xl overflow-hidden border-2 transition-all"
                  style={{ borderColor: selectedGrade === grade ? '#5E35FF' : 'transparent', boxShadow: selectedGrade === grade ? '0 0 0 1px #5E35FF' : 'none' }}>
                  {sourceImageUrl
                    ? <img src={sourceImageUrl} alt={GRADE_LABELS[grade]} className="w-full h-full object-cover"
                        style={{ filter: COLOR_GRADES[grade] === 'none' ? undefined : COLOR_GRADES[grade] }} />
                    : <div className="w-full h-full" style={{ background: '#201D3C' }} />}
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
            <button onClick={toggleCaptionOn}
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
                style={{ background: '#171430', color: '#fff', border: '1px solid rgba(255,255,255,.1)' }} />
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

        {/* Post caption */}
        <section>
          <h2 className="text-sm font-semibold mb-1" style={{ color: 'rgba(255,255,255,.5)', letterSpacing: '0.08em', textTransform: 'uppercase', fontFamily: 'Space Mono, monospace' }}>Post caption</h2>
          <p className="text-xs mb-2" style={{ color: 'rgba(255,255,255,.3)' }}>Text shown on Instagram / TikTok (not burned into video)</p>
          <textarea value={postCaption} onChange={e => setPostCaption(e.target.value)}
            placeholder="Write your Instagram caption, hashtags…" rows={4}
            className="w-full rounded-xl px-3 py-2 text-sm resize-none outline-none"
            style={{ background: '#171430', color: '#fff', border: '1px solid rgba(255,255,255,.1)' }} />
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
        <button onClick={applyChanges} disabled={isRendering}
          className="w-full py-3 rounded-2xl font-semibold text-base transition-opacity disabled:opacity-50"
          style={{ background: 'linear-gradient(135deg,#5E35FF,#FF4F3B)', color: '#fff', fontFamily: 'Syne, sans-serif' }}>
          {renderStatus === 'submitting' ? 'Sending…' : isRendering ? 'Rendering your reel…' : 'Apply Changes'}
        </button>
      </div>

    </div>
  );
}
