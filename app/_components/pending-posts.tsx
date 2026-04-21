'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

type Post = {
  id: string;
  caption: string;
  image_url: string | null;
  is_video: boolean | null;
  state: string;
};

function PostCard({ post, onDone }: { post: Post; onDone: (id: string) => void }) {
  const [busy,           setBusy]           = useState<'approve' | 'discard' | null>(null);
  const [editingCaption, setEditingCaption] = useState(false);
  const [captionDraft,   setCaptionDraft]   = useState(post.caption);
  const [savedCaption,   setSavedCaption]   = useState(post.caption);
  const [savingCaption,  setSavingCaption]  = useState(false);
  const [error,          setError]          = useState('');

  async function act(action: 'approve' | 'discard') {
    setBusy(action);
    setError('');
    const res  = await fetch(`/api/posts/${post.id}/${action}`, { method: 'POST' });
    const data = await res.json();
    if (!res.ok) { setError(data.error ?? 'Failed'); setBusy(null); return; }
    onDone(post.id);
  }

  async function saveCaption() {
    const trimmed = captionDraft.trim();
    if (!trimmed || trimmed === savedCaption) { setEditingCaption(false); return; }
    setSavingCaption(true);
    const res = await fetch(`/api/posts/${post.id}`, {
      method:  'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ caption: trimmed }),
    });
    setSavingCaption(false);
    if (res.ok) {
      setSavedCaption(trimmed);
      setEditingCaption(false);
    } else {
      setError('Could not save caption.');
    }
  }

  return (
    <div className="rounded-2xl overflow-hidden flex flex-col" style={{ background: 'var(--surf3)' }}>
      {/* Image */}
      <div className="relative w-full" style={{ paddingBottom: '75%', background: 'var(--surf)' }}>
        {post.image_url && !post.is_video ? (
          <img src={post.image_url} alt="" className="absolute inset-0 w-full h-full object-cover" />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center text-3xl">
            {post.is_video ? '🎬' : '🖼️'}
          </div>
        )}
        <div className="absolute top-2 left-2">
          <span className="text-xs px-2 py-0.5 rounded-full" style={{ fontFamily: 'var(--font-space-mono)', background: 'rgba(11,9,24,0.8)', color: post.state === 'pending_approval' ? 'var(--gold)' : 'var(--violet)', border: `1px solid ${post.state === 'pending_approval' ? 'var(--gold)' : 'var(--violet)'}` }}>
            {post.state === 'pending_approval' ? 'needs approval' : 'in edit'}
          </span>
        </div>
      </div>

      {/* Caption */}
      <div className="px-4 pt-3 pb-2">
        {editingCaption ? (
          <div className="flex flex-col gap-2">
            <textarea
              value={captionDraft}
              onChange={e => setCaptionDraft(e.target.value)}
              rows={4}
              autoFocus
              className="w-full text-sm rounded-xl px-3 py-2 outline-none resize-none"
              style={{ background: 'var(--surf2)', color: 'var(--white)', fontFamily: 'var(--font-dm-sans)', border: '1px solid var(--coral)', caretColor: 'var(--coral)' }}
            />
            <div className="flex gap-2">
              <button
                onClick={saveCaption}
                disabled={savingCaption}
                className="text-xs px-3 py-1.5 rounded-full font-medium"
                style={{ background: 'var(--coral)', color: '#fff', fontFamily: 'var(--font-dm-sans)', opacity: savingCaption ? 0.6 : 1 }}
              >
                {savingCaption ? 'Saving…' : 'Save'}
              </button>
              <button
                onClick={() => { setEditingCaption(false); setCaptionDraft(savedCaption); }}
                className="text-xs px-3 py-1.5 rounded-full"
                style={{ background: 'var(--surf2)', color: 'var(--muted)', fontFamily: 'var(--font-dm-sans)' }}
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <div className="flex items-start justify-between gap-2">
            <p className="text-sm leading-relaxed line-clamp-3 flex-1" style={{ color: 'var(--muted)', fontFamily: 'var(--font-dm-sans)' }}>
              {savedCaption}
            </p>
            <button
              onClick={() => setEditingCaption(true)}
              className="text-xs flex-shrink-0 px-2 py-1 rounded-lg transition-opacity hover:opacity-80"
              style={{ color: 'var(--muted2)', fontFamily: 'var(--font-space-mono)', background: 'var(--surf2)' }}
            >
              edit
            </button>
          </div>
        )}
      </div>

      {/* Actions — only for pending_approval */}
      {post.state === 'pending_approval' && !editingCaption && (
        <div className="flex gap-2 px-4 pb-4 pt-2">
          <button
            onClick={() => act('approve')}
            disabled={busy !== null}
            className="flex-1 py-2.5 rounded-full text-sm font-semibold transition-opacity hover:opacity-90"
            style={{ background: 'var(--coral)', color: '#fff', fontFamily: 'var(--font-dm-sans)', opacity: busy ? 0.5 : 1 }}
          >
            {busy === 'approve' ? 'Publishing…' : 'Post now ↗'}
          </button>
          <button
            onClick={() => act('discard')}
            disabled={busy !== null}
            className="px-4 py-2.5 rounded-full text-sm font-medium transition-opacity hover:opacity-80"
            style={{ background: 'var(--surf2)', color: 'var(--muted)', fontFamily: 'var(--font-dm-sans)', opacity: busy ? 0.5 : 1 }}
          >
            {busy === 'discard' ? '…' : 'Discard'}
          </button>
        </div>
      )}

      {error && (
        <p className="px-4 pb-3 text-xs" style={{ color: 'var(--coral)', fontFamily: 'var(--font-dm-sans)' }}>{error}</p>
      )}
    </div>
  );
}

export function PendingPosts({ initial }: { initial: Post[] }) {
  const router = useRouter();
  const [posts, setPosts] = useState(initial);

  function onDone(id: string) {
    setPosts(p => p.filter(x => x.id !== id));
    router.refresh();
  }

  if (posts.length === 0) return null;

  return (
    <section className="flex flex-col gap-4">
      <div className="flex items-center gap-2">
        <h2 className="text-base font-semibold" style={{ fontFamily: 'var(--font-syne)' }}>Waiting for you</h2>
        <span className="text-xs px-2 py-0.5 rounded-full" style={{ fontFamily: 'var(--font-space-mono)', color: 'var(--gold)', background: 'rgba(255,209,102,0.12)', border: '1px solid var(--gold)' }}>
          {posts.length}
        </span>
      </div>
      <div className="flex flex-col gap-4">
        {posts.map(post => (
          <PostCard key={post.id} post={post} onDone={onDone} />
        ))}
      </div>
    </section>
  );
}
