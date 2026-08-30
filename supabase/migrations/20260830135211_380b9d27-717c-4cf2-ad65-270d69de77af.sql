CREATE TYPE public.app_role AS ENUM ('admin', 'user');

CREATE TABLE public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email text,
  name text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own profile read" ON public.profiles FOR SELECT TO authenticated USING (auth.uid() = id);
CREATE POLICY "own profile write" ON public.profiles FOR UPDATE TO authenticated USING (auth.uid() = id) WITH CHECK (auth.uid() = id);

CREATE TABLE public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  UNIQUE (user_id, role)
);
GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "read own roles" ON public.user_roles FOR SELECT TO authenticated USING (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role)
$$;

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (id, email, name)
  VALUES (NEW.id, NEW.email, COALESCE(NEW.raw_user_meta_data->>'name', NEW.email));
  INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'admin') ON CONFLICT DO NOTHING;
  RETURN NEW;
END;
$$;
CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

CREATE TABLE public.units (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  description text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.units TO authenticated;
GRANT ALL ON public.units TO service_role;
ALTER TABLE public.units ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admins manage units" ON public.units FOR ALL TO authenticated
USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE TABLE public.participants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  unit_id uuid NOT NULL REFERENCES public.units(id) ON DELETE CASCADE,
  callsign text NOT NULL,
  device_token text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX participants_unit_callsign_idx ON public.participants (unit_id, lower(callsign));
CREATE INDEX participants_unit_idx ON public.participants (unit_id);
CREATE UNIQUE INDEX participants_device_token_idx ON public.participants (device_token) WHERE device_token IS NOT NULL;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.participants TO authenticated;
GRANT ALL ON public.participants TO service_role;
ALTER TABLE public.participants ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admins manage participants" ON public.participants FOR ALL TO authenticated
USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE TABLE public.quizzes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  description text,
  is_published boolean NOT NULL DEFAULT false,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.quizzes TO authenticated;
GRANT ALL ON public.quizzes TO service_role;
ALTER TABLE public.quizzes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admins manage quizzes" ON public.quizzes FOR ALL TO authenticated
USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE TRIGGER quizzes_updated_at BEFORE UPDATE ON public.quizzes FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.questions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  quiz_id uuid NOT NULL REFERENCES public.quizzes(id) ON DELETE CASCADE,
  text text NOT NULL,
  media_url text,
  media_type text CHECK (media_type IN ('image','video')),
  position integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX questions_quiz_idx ON public.questions (quiz_id, position);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.questions TO authenticated;
GRANT ALL ON public.questions TO service_role;
ALTER TABLE public.questions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admins manage questions" ON public.questions FOR ALL TO authenticated
USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE TABLE public.answers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  question_id uuid NOT NULL REFERENCES public.questions(id) ON DELETE CASCADE,
  text text NOT NULL,
  is_correct boolean NOT NULL DEFAULT false,
  position integer NOT NULL DEFAULT 0
);
CREATE INDEX answers_question_idx ON public.answers (question_id, position);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.answers TO authenticated;
GRANT ALL ON public.answers TO service_role;
ALTER TABLE public.answers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admins manage answers" ON public.answers FOR ALL TO authenticated
USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE TABLE public.attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  participant_id uuid NOT NULL REFERENCES public.participants(id) ON DELETE CASCADE,
  quiz_id uuid NOT NULL REFERENCES public.quizzes(id) ON DELETE CASCADE,
  start_time timestamptz NOT NULL DEFAULT now(),
  end_time timestamptz,
  score integer NOT NULL DEFAULT 0,
  UNIQUE (participant_id, quiz_id)
);
CREATE INDEX attempts_quiz_idx ON public.attempts (quiz_id);
CREATE INDEX attempts_participant_idx ON public.attempts (participant_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.attempts TO authenticated;
GRANT ALL ON public.attempts TO service_role;
ALTER TABLE public.attempts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admins manage attempts" ON public.attempts FOR ALL TO authenticated
USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE TABLE public.responses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  attempt_id uuid NOT NULL REFERENCES public.attempts(id) ON DELETE CASCADE,
  question_id uuid NOT NULL REFERENCES public.questions(id) ON DELETE CASCADE,
  answer_id uuid REFERENCES public.answers(id) ON DELETE SET NULL,
  is_correct boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (attempt_id, question_id)
);
CREATE INDEX responses_attempt_idx ON public.responses (attempt_id);
CREATE INDEX responses_question_idx ON public.responses (question_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.responses TO authenticated;
GRANT ALL ON public.responses TO service_role;
ALTER TABLE public.responses ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admins manage responses" ON public.responses FOR ALL TO authenticated
USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

ALTER PUBLICATION supabase_realtime ADD TABLE public.attempts;
ALTER PUBLICATION supabase_realtime ADD TABLE public.responses;

CREATE POLICY "admins read quiz media" ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'quiz-media' AND public.has_role(auth.uid(), 'admin'));
CREATE POLICY "admins upload quiz media" ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'quiz-media' AND public.has_role(auth.uid(), 'admin'));
CREATE POLICY "admins update quiz media" ON storage.objects FOR UPDATE TO authenticated
USING (bucket_id = 'quiz-media' AND public.has_role(auth.uid(), 'admin'));
CREATE POLICY "admins delete quiz media" ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'quiz-media' AND public.has_role(auth.uid(), 'admin'));

INSERT INTO public.units (id, name, description) VALUES
  ('11111111-1111-1111-1111-111111111111', '1-й батальйон', 'Перший окремий батальйон'),
  ('22222222-2222-2222-2222-222222222222', '2-й батальйон', 'Другий окремий батальйон');

INSERT INTO public.participants (id, unit_id, callsign) VALUES
  ('aaaaaaaa-0000-0000-0000-000000000010', '11111111-1111-1111-1111-111111111111', 'ALPHA'),
  ('aaaaaaaa-0000-0000-0000-000000000011', '22222222-2222-2222-2222-222222222222', 'ALPHA');

INSERT INTO public.quizzes (id, title, description, is_published) VALUES
  ('33333333-3333-3333-3333-333333333333', 'Історичні події', 'Базовий квіз з історії', true),
  ('44444444-4444-4444-4444-444444444444', 'Технічні навички', 'Перевірка технічних знань', true);

INSERT INTO public.questions (id, quiz_id, text, position) VALUES
  ('55555555-0000-0000-0000-000000000001', '33333333-3333-3333-3333-333333333333', 'У якому році проголошено Незалежність України?', 1),
  ('55555555-0000-0000-0000-000000000002', '33333333-3333-3333-3333-333333333333', 'Хто був першим Президентом України?', 2),
  ('66666666-0000-0000-0000-000000000001', '44444444-4444-4444-4444-444444444444', 'Що означає абревіатура РЕБ?', 1);

INSERT INTO public.answers (question_id, text, is_correct, position) VALUES
  ('55555555-0000-0000-0000-000000000001', '1991', true, 1),
  ('55555555-0000-0000-0000-000000000001', '1996', false, 2),
  ('55555555-0000-0000-0000-000000000001', '1918', false, 3),
  ('55555555-0000-0000-0000-000000000002', 'Леонід Кравчук', true, 1),
  ('55555555-0000-0000-0000-000000000002', 'Леонід Кучма', false, 2),
  ('66666666-0000-0000-0000-000000000001', 'Радіоелектронна боротьба', true, 1),
  ('66666666-0000-0000-0000-000000000001', 'Резервний енергоблок', false, 2);