-- Enable RLS on all public tables
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.instagram_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.instagram_media ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.oauth_pending_states ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.otp_codes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.feature_flags ENABLE ROW LEVEL SECURITY;

-- Revoke default public access
REVOKE ALL ON public.profiles FROM public;
REVOKE ALL ON public.instagram_accounts FROM public;
REVOKE ALL ON public.instagram_media FROM public;
REVOKE ALL ON public.oauth_pending_states FROM public;
REVOKE ALL ON public.otp_codes FROM public;
REVOKE ALL ON public.audit_logs FROM public;
REVOKE ALL ON public.user_sessions FROM public;
REVOKE ALL ON public.feature_flags FROM public;

-- Verify RLS is enabled
SELECT tablename, rowsecurity
FROM pg_tables
WHERE schemaname = 'public'
ORDER BY tablename;
