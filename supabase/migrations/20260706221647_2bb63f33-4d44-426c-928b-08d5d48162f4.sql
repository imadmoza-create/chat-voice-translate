-- Account number + phone on profiles
CREATE SEQUENCE IF NOT EXISTS public.account_number_seq START 1001;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS account_number bigint;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS phone text;
UPDATE public.profiles SET account_number = nextval('public.account_number_seq') WHERE account_number IS NULL;
ALTER TABLE public.profiles ALTER COLUMN account_number SET DEFAULT nextval('public.account_number_seq');
ALTER TABLE public.profiles ALTER COLUMN account_number SET NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS profiles_account_number_key ON public.profiles(account_number);

-- Update new-user trigger to capture phone
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  INSERT INTO public.profiles (id, display_name, phone)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data ->> 'display_name', NEW.raw_user_meta_data ->> 'full_name', split_part(NEW.email, '@', 1)),
    NEW.raw_user_meta_data ->> 'phone'
  );
  RETURN NEW;
END;
$$;

-- Community chat messages (one shared room per language)
CREATE TABLE public.community_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lang text NOT NULL,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name text,
  account_number bigint,
  content text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.community_messages TO authenticated;
GRANT ALL ON public.community_messages TO service_role;
ALTER TABLE public.community_messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated can read community messages" ON public.community_messages
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Users insert own community messages" ON public.community_messages
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

-- Bans (managed by server via service role)
CREATE TABLE public.user_bans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  until timestamptz NOT NULL,
  reason text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.user_bans TO authenticated;
GRANT ALL ON public.user_bans TO service_role;
ALTER TABLE public.user_bans ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users read own bans" ON public.user_bans
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

-- Strike counter for auto-moderation
CREATE TABLE public.user_strikes (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  count int NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.user_strikes TO authenticated;
GRANT ALL ON public.user_strikes TO service_role;
ALTER TABLE public.user_strikes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users read own strikes" ON public.user_strikes
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

-- Realtime for the shared chat
ALTER PUBLICATION supabase_realtime ADD TABLE public.community_messages;