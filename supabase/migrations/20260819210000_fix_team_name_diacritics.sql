-- API-Football levererar lagnamn utan svenska diakritiska tecken
-- (ö/ä/å), t.ex. "IFK Goteborg" istället för "IFK Göteborg". team.name
-- används överallt i appen (hero-kort, matchresultat, chattens
-- verktygssvar, /data/**), så vi rättar källan en gång här istället för
-- att lappa det i UI:t. resolveTeam() (lib/football/resolve-team.ts)
-- normaliserar bort diakritik vid matchning på båda sidor, så detta
-- påverkar inte lag-uppslagning i chatten.
update public.team set name = 'IFK Göteborg' where name = 'IFK Goteborg';
update public.team set name = 'IFK Värnamo' where name = 'IFK Varnamo';
update public.team set name = 'BK Häcken' where name = 'BK Hacken';
update public.team set name = 'Djurgårdens IF' where name = 'Djurgardens IF';
update public.team set name = 'Malmö FF' where name = 'Malmo FF';
update public.team set name = 'Mjällby AIF' where name = 'Mjallby AIF';
update public.team set name = 'IFK Norrköping' where name = 'IFK Norrkoping';
update public.team set name = 'Västerås SK FK' where name = 'Vasteras SK FK';
