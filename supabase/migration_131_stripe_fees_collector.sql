-- Migration 131: organisers' Stripe accounts are Accounts v2 with Stripe carrying the losses (Managed Risk).
-- Who pays the card fee on their sales: 'application' (TheShowFinder, out of the booking fee) or 'stripe' (taken from
-- the sale by Stripe; our application fee is reduced to match). Safe to re-run.
alter table public.organisers add column if not exists stripe_fees_collector text;
