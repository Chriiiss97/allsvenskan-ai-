-- ============================================================================
-- 0004: fixture.events_synced_at
-- ============================================================================
-- Matchhändelser (mål/kort/byten) hämtas med ETT API-anrop PER MATCH, till
-- skillnad från lag-/spelarimporten som hämtar flera matcher per anrop. På
-- gratisplanens 100 anrop/dag räcker det inte att hämta alla matchers
-- händelser i en körning för flera säsonger. Den här kolumnen gör
-- händelseimporten återupptagbar över flera körningar/dagar: en match med
-- events_synced_at satt hoppas över nästa körning, oavsett om matchen faktiskt
-- hade några händelser eller inte (en null-null-jämförelse på "finns event-
-- rader?" skulle annars hämta om mål-lösa matcher varje gång).

alter table public.fixture
  add column events_synced_at timestamptz;

create index fixture_events_synced_idx on public.fixture (events_synced_at);
