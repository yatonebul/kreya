-- Add animation columns to pending_posts table for Ken Burns reel animation
ALTER TABLE pending_posts
ADD COLUMN IF NOT EXISTS animation_style TEXT DEFAULT 'auto',
ADD COLUMN IF NOT EXISTS animation_duration INTEGER DEFAULT 5,
ADD COLUMN IF NOT EXISTS animation_zoom NUMERIC DEFAULT 1.5,
ADD COLUMN IF NOT EXISTS music_selection TEXT DEFAULT 'auto';
