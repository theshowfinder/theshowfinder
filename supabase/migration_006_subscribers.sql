-- Newsletter subscribers table
CREATE TABLE IF NOT EXISTS public.subscribers (
  id         uuid        PRIMARY KEY DEFAULT uuid_generate_v4(),
  email      text        NOT NULL UNIQUE,
  confirmed  boolean     NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.subscribers ENABLE ROW LEVEL SECURITY;

-- No public read/write — all access goes through the service-role key in the server action
CREATE POLICY "Admin only"
  ON public.subscribers
  USING (false);

CREATE INDEX subscribers_email_idx ON public.subscribers (email);
