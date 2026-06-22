-- Profiles table for Force One
CREATE TABLE public.profiles (
  id UUID NOT NULL PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  username TEXT NOT NULL UNIQUE,
  avatar_color TEXT NOT NULL DEFAULT '#22ddee',
  level INTEGER NOT NULL DEFAULT 1,
  xp INTEGER NOT NULL DEFAULT 0,
  kills INTEGER NOT NULL DEFAULT 0,
  deaths INTEGER NOT NULL DEFAULT 0,
  wins INTEGER NOT NULL DEFAULT 0,
  matches INTEGER NOT NULL DEFAULT 0,
  rank TEXT NOT NULL DEFAULT 'Iron 1',
  favorite_agent TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT ON public.profiles TO anon;
GRANT SELECT, INSERT, UPDATE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Profiles are viewable by everyone"
  ON public.profiles FOR SELECT
  USING (true);

CREATE POLICY "Users can insert their own profile"
  ON public.profiles FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = id);

CREATE POLICY "Users can update their own profile"
  ON public.profiles FOR UPDATE
  TO authenticated
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

-- updated_at trigger
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER profiles_set_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Auto-create profile on user signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  base_name TEXT;
  final_name TEXT;
  attempt INT := 0;
  palette TEXT[] := ARRAY['#22ddee','#ff3ea5','#ffae55','#88c4ff','#a3ff7a','#ffd166','#c084fc','#ff7e5a','#5eead4','#f472b6'];
BEGIN
  base_name := COALESCE(
    NEW.raw_user_meta_data->>'username',
    NEW.raw_user_meta_data->>'name',
    split_part(NEW.email, '@', 1),
    'Operator'
  );
  -- Sanitize and ensure uniqueness
  base_name := regexp_replace(base_name, '[^A-Za-z0-9_]', '', 'g');
  IF length(base_name) < 3 THEN
    base_name := 'Op_' || substr(NEW.id::text, 1, 6);
  END IF;
  final_name := base_name;
  WHILE EXISTS (SELECT 1 FROM public.profiles WHERE username = final_name) LOOP
    attempt := attempt + 1;
    final_name := base_name || attempt::text;
  END LOOP;

  INSERT INTO public.profiles (id, username, avatar_color)
  VALUES (
    NEW.id,
    final_name,
    palette[1 + (abs(hashtext(NEW.id::text)) % array_length(palette, 1))]
  );
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();