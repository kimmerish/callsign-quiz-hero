ALTER TABLE public.quizzes
  ADD COLUMN IF NOT EXISTS draw_date timestamptz,
  ADD COLUMN IF NOT EXISTS prize text,
  ADD COLUMN IF NOT EXISTS rules text;

CREATE TABLE IF NOT EXISTS public.app_settings (
  id boolean PRIMARY KEY DEFAULT true CHECK (id),
  system_name text NOT NULL DEFAULT 'КВІЗ-СИСТЕМА',
  logo_url text,
  color_background text NOT NULL DEFAULT '220 12% 5%',
  color_surface text NOT NULL DEFAULT '220 10% 9%',
  color_surface_2 text NOT NULL DEFAULT '220 8% 13%',
  color_foreground text NOT NULL DEFAULT '40 20% 92%',
  color_accent text NOT NULL DEFAULT '38 78% 55%',
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.app_settings TO anon;
GRANT SELECT, INSERT, UPDATE ON public.app_settings TO authenticated;
GRANT ALL ON public.app_settings TO service_role;

ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "app settings readable by everyone" ON public.app_settings;
CREATE POLICY "app settings readable by everyone" ON public.app_settings FOR SELECT USING (true);

DROP POLICY IF EXISTS "admins manage app settings" ON public.app_settings;
CREATE POLICY "admins manage app settings" ON public.app_settings FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

INSERT INTO public.app_settings (id) VALUES (true) ON CONFLICT (id) DO NOTHING;

DROP TRIGGER IF EXISTS app_settings_updated_at ON public.app_settings;
CREATE TRIGGER app_settings_updated_at BEFORE UPDATE ON public.app_settings
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();