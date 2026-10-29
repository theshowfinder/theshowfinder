-- Track whether the paid advertiser confirmation email has been sent.
alter table public.advertiser_applications
  add column if not exists confirmation_email_sent_at timestamptz;