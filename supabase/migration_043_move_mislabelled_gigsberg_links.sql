-- Older Gigsberg-created pages could accidentally store their marketplace URL
-- in own_ticket_url, which made the public page label it "Buy Direct".
-- Move those URLs to the provider-specific affiliate column instead.
UPDATE public.events
SET
  gigsberg_affiliate_url = COALESCE(gigsberg_affiliate_url, own_ticket_url),
  own_ticket_url = NULL
WHERE own_ticket_url ~* '(^|:)//([^/]+\.)?gigsberg\.com(/|$)';
