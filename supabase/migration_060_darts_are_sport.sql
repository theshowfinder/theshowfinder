-- Darts listings filed under Concert/Comedy by the feed are sport. (The sync now maps them to
-- 'sports' itself; this fixes rows that already exist.)
update events
set category = 'sports'
where category <> 'sports'
  and (title ~* '(premier\s+league\s+darts|world\s+(darts|matchplay)|darts\s+(masters|grand\s+prix|championship)|night\s+at\s+the\s+darts)'
       or title ~* '^\s*darts\s*$');
