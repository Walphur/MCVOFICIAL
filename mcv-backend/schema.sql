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
