-- Monthly Kling AI video credit tracking for Pro/Agency users.
-- Mirrors the daily_pro_gen_count pattern already on user_profiles.
-- monthly_video_credits: consumed Ultra-Gen credits this month (resets YYYY-MM).
-- last_video_credits_reset: YYYY-MM string used as the reset sentinel.

alter table user_profiles
  add column if not exists monthly_video_credits    integer not null default 0,
  add column if not exists last_video_credits_reset text    not null default '';
