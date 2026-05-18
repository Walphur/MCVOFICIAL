-- split
CREATE TABLE IF NOT EXISTS tournaments (
    id SERIAL PRIMARY KEY,
    slug VARCHAR(64) UNIQUE NOT NULL,
    title TEXT NOT NULL,
    description TEXT,
    format_label VARCHAR(32) DEFAULT '5v5',
    max_teams INT NOT NULL DEFAULT 30,
    starts_at TIMESTAMPTZ,
    status VARCHAR(24) NOT NULL DEFAULT 'open',
    winner_registration_id INT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- split
CREATE TABLE IF NOT EXISTS tournament_registrations (
    id SERIAL PRIMARY KEY,
    tournament_id INT NOT NULL REFERENCES tournaments (id) ON DELETE CASCADE,
    team_name TEXT NOT NULL,
    team_tag VARCHAR(32),
    captain_name TEXT NOT NULL,
    roster JSONB NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'pending',
    admin_notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- split
ALTER TABLE tournaments DROP CONSTRAINT IF EXISTS fk_tournaments_winner;

-- split
ALTER TABLE tournaments ADD CONSTRAINT fk_tournaments_winner FOREIGN KEY (winner_registration_id) REFERENCES tournament_registrations (id) ON DELETE SET NULL;

-- split
CREATE TABLE IF NOT EXISTS tournament_matches (
    id SERIAL PRIMARY KEY,
    tournament_id INT NOT NULL REFERENCES tournaments (id) ON DELETE CASCADE,
    round_no INT NOT NULL,
    slot_no INT NOT NULL,
    registration_a_id INT REFERENCES tournament_registrations (id) ON DELETE SET NULL,
    registration_b_id INT REFERENCES tournament_registrations (id) ON DELETE SET NULL,
    winner_registration_id INT REFERENCES tournament_registrations (id) ON DELETE SET NULL,
    UNIQUE (tournament_id, round_no, slot_no)
);

-- split
CREATE INDEX IF NOT EXISTS idx_registrations_tournament ON tournament_registrations (tournament_id);

-- split
CREATE INDEX IF NOT EXISTS idx_registrations_status ON tournament_registrations (tournament_id, status);

-- split
CREATE INDEX IF NOT EXISTS idx_matches_tournament ON tournament_matches (tournament_id, round_no);

-- split
INSERT INTO tournaments (slug, title, description, format_label, max_teams, starts_at, status)
VALUES (
        'last-squad-standing',
        'Last Squad Standing',
        '30 equipos · 5v5 · Rust competitivo',
        '5v5',
        30,
        '2026-05-16T18:00:00+02',
        'open'
    )
ON CONFLICT (slug) DO NOTHING;

-- split
ALTER TABLE tournaments ADD COLUMN IF NOT EXISTS prize_pool_text TEXT;

-- split
ALTER TABLE tournaments ADD COLUMN IF NOT EXISTS prize_sub_text TEXT;

-- split
ALTER TABLE tournaments ADD COLUMN IF NOT EXISTS poster_url TEXT;

-- split
ALTER TABLE tournaments ADD COLUMN IF NOT EXISTS registration_closes_at TIMESTAMPTZ;

-- split
ALTER TABLE tournaments ADD COLUMN IF NOT EXISTS match_day_display TEXT;

-- split
ALTER TABLE tournaments ADD COLUMN IF NOT EXISTS check_in_display TEXT;

-- split
ALTER TABLE tournaments ADD COLUMN IF NOT EXISTS format_server_text TEXT;

-- split
ALTER TABLE tournaments ADD COLUMN IF NOT EXISTS twitch_channel TEXT;

-- split
ALTER TABLE tournaments ADD COLUMN IF NOT EXISTS winner_override_name TEXT;

-- split
ALTER TABLE tournaments ADD COLUMN IF NOT EXISTS ended_at TIMESTAMPTZ;

-- split
ALTER TABLE tournaments ADD COLUMN IF NOT EXISTS marquee_text TEXT;

-- split
UPDATE tournaments
SET
    status = 'finished',
    ended_at = COALESCE(ended_at, TIMESTAMPTZ '2026-05-16 20:00:00+02'),
    prize_pool_text = COALESCE(prize_pool_text, '$150'),
    prize_sub_text = COALESCE(prize_sub_text, 'Pago al capitán del equipo ganador'),
    match_day_display = COALESCE(match_day_display, '16 MAY 2026'),
    check_in_display = COALESCE(check_in_display, '15 min antes del match'),
    format_server_text = COALESCE(format_server_text, 'Rustoria RTG'),
    marquee_text = COALESCE(marquee_text, 'LAST SQUAD STANDING — EVENTO FINALIZADO'),
    twitch_channel = COALESCE(twitch_channel, 'mcvteam')
WHERE slug = 'last-squad-standing'
  AND status = 'open';

-- split
-- Campeón FUNKOS TEAM + roster (Steam64 de ejemplo; reemplazá en admin si querés IDs reales).
DELETE FROM tournament_registrations
WHERE tournament_id = (SELECT id FROM tournaments WHERE slug = 'last-squad-standing')
  AND team_name = 'FUNKOS TEAM';

INSERT INTO tournament_registrations (tournament_id, team_name, team_tag, captain_name, roster, status)
SELECT t.id,
    'FUNKOS TEAM',
    'FUNKOS',
    '! Luk4s1t0.',
    '[
      {"name":"! Luk4s1t0.","steamId64":"76561198204000001","discord":"luk4s#0"},
      {"name":"AdRiiDR","steamId64":"76561198204000002","discord":"adriidr#0"},
      {"name":"Benny","steamId64":"76561198204000003","discord":"benny#0"},
      {"name":"EdinZ","steamId64":"76561198204000004","discord":"edinz#0"},
      {"name":"hyunnah","steamId64":"76561198204000005","discord":"hyunnah#0"}
    ]'::jsonb,
    'accepted'
FROM tournaments t
WHERE t.slug = 'last-squad-standing';

UPDATE tournaments
SET
    winner_registration_id = (
        SELECT id
        FROM tournament_registrations
        WHERE tournament_id = (SELECT id FROM tournaments WHERE slug = 'last-squad-standing')
          AND team_name = 'FUNKOS TEAM'
        ORDER BY id DESC
        LIMIT 1
    ),
    winner_override_name = NULL,
    status = 'finished',
    ended_at = COALESCE(ended_at, TIMESTAMPTZ '2026-05-16 20:00:00+02')
WHERE slug = 'last-squad-standing';

-- split
ALTER TABLE tournaments ADD COLUMN IF NOT EXISTS display_slots_num INT;

-- split
ALTER TABLE tournaments ADD COLUMN IF NOT EXISTS display_slots_max INT;

-- split
UPDATE tournaments
SET display_slots_num = 32, display_slots_max = 32
WHERE slug = 'last-squad-standing';

-- split
-- Lista de wipe MCV: Discord (slash /mcv-wipe o !mcvsteam en canal) → roster interno; equipo.html valida el formulario de fichas contra esta tabla
CREATE TABLE IF NOT EXISTS wipe_list_members (
    discord_user_id VARCHAR(32) PRIMARY KEY,
    steam_id64 VARCHAR(17) NOT NULL,
    persona_name TEXT,
    avatar_url TEXT,
    discord_username TEXT,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- split
CREATE INDEX IF NOT EXISTS idx_wipe_list_steam ON wipe_list_members (steam_id64);

-- split
-- Perfiles públicos equipo (equipo.html): formulario → pending → admin aprueba
CREATE TABLE IF NOT EXISTS team_roster_submissions (
    id SERIAL PRIMARY KEY,
    display_name VARCHAR(120) NOT NULL,
    role_label VARCHAR(120),
    steam_id64 VARCHAR(17),
    twitch_url TEXT,
    kick_url TEXT,
    x_url TEXT,
    instagram_url TEXT,
    youtube_url TEXT,
    tiktok_url TEXT,
    persona_name TEXT,
    avatar_url TEXT,
    status VARCHAR(20) NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'approved', 'rejected')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- split
CREATE INDEX IF NOT EXISTS idx_team_roster_status ON team_roster_submissions (status);

-- split
CREATE INDEX IF NOT EXISTS idx_team_roster_created ON team_roster_submissions (created_at DESC);
