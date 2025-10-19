-- Fix security warning: Set search_path for reset_daily_searches function
DROP FUNCTION IF EXISTS public.reset_daily_searches();

CREATE OR REPLACE FUNCTION public.reset_daily_searches()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.profiles
  SET 
    daily_searches_used = 0,
    last_search_reset_at = now()
  WHERE 
    last_search_reset_at < now() - interval '1 day';
END;
$$;