-- Create plans table
CREATE TABLE IF NOT EXISTS public.plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  price decimal(10,2) NOT NULL,
  search_limit integer NOT NULL,
  duration_days integer,
  verification_type text DEFAULT 'auto' CHECK (verification_type IN ('auto', 'code', 'both')),
  created_at timestamp with time zone DEFAULT now()
);

-- Enable RLS on plans (public read access)
ALTER TABLE public.plans ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can view plans" ON public.plans;
CREATE POLICY "Anyone can view plans"
  ON public.plans FOR SELECT
  USING (true);

-- Insert default plans (if not exist)
INSERT INTO public.plans (name, price, search_limit, duration_days, verification_type) 
VALUES
  ('Free', 0, 15, NULL, 'auto'),
  ('Pro', 3, 300, 30, 'both'),
  ('Enterprise', 10, -1, 30, 'both')
ON CONFLICT (name) DO NOTHING;

-- Create transactions table
CREATE TABLE IF NOT EXISTS public.transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE,
  plan_id uuid REFERENCES public.plans(id),
  amount decimal(10,2) NOT NULL,
  payment_method text NOT NULL CHECK (payment_method IN ('mpesa', 'paypal', 'bank')),
  transaction_code text,
  status text DEFAULT 'pending' CHECK (status IN ('pending', 'verified', 'failed')),
  created_at timestamp with time zone DEFAULT now(),
  verified_at timestamp with time zone
);

-- Enable RLS on transactions
ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view their own transactions" ON public.transactions;
CREATE POLICY "Users can view their own transactions"
  ON public.transactions FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can create transactions" ON public.transactions;
CREATE POLICY "Users can create transactions"
  ON public.transactions FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Create profile_pics storage bucket (if not exists)
INSERT INTO storage.buckets (id, name, public) 
VALUES ('profile_pics', 'profile_pics', true)
ON CONFLICT (id) DO NOTHING;

-- Storage RLS policies for profile_pics
DROP POLICY IF EXISTS "Users can view all profile pictures" ON storage.objects;
CREATE POLICY "Users can view all profile pictures"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'profile_pics');

DROP POLICY IF EXISTS "Users can upload their own profile picture" ON storage.objects;
CREATE POLICY "Users can upload their own profile picture"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'profile_pics' AND
    auth.uid()::text = (storage.foldername(name))[1]
  );

DROP POLICY IF EXISTS "Users can update their own profile picture" ON storage.objects;
CREATE POLICY "Users can update their own profile picture"
  ON storage.objects FOR UPDATE
  USING (
    bucket_id = 'profile_pics' AND
    auth.uid()::text = (storage.foldername(name))[1]
  );

DROP POLICY IF EXISTS "Users can delete their own profile picture" ON storage.objects;
CREATE POLICY "Users can delete their own profile picture"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'profile_pics' AND
    auth.uid()::text = (storage.foldername(name))[1]
  );

-- Function to reset daily search count
CREATE OR REPLACE FUNCTION public.reset_daily_searches()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
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

-- Update searches table to link with profiles
ALTER TABLE public.searches ADD COLUMN IF NOT EXISTS profile_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL;