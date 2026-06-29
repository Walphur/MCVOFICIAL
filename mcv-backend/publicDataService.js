"use strict";

const axios = require("axios");
const {
    getNthThursdayOfMonth,
    resolveMonthlyPeriod,
    startOfDay,
    endOfDay
} = require("./vitalWipeCalendar");

const ROSTER_BASE_POINTS = 50;
const WIN_POINTS = 100;
const DISCORD_INVITE = process.env.MCV_DISCORD_INVITE || "mBRrUA8wH6";
const KICK_CHANNEL = process.env.MCV_KICK_CHANNEL || "mcompanyv";
const TWITCH_CHANNEL = process.env.MCV_TWITCH_CHANNEL || "mcvteam";

const TOURNAMENT_LIST_SQL = `
SELECT t.slug, t.title, t.status, t.starts_at, t.ended_at, t.format_label, t.prize_pool_text,
       t.prize_sub_text, t.registration_closes_at, t.poster_url, t.winner_registration_id,
       t.winner_override_name, t.runner_up_registration_id, t.mvp_name, t.mvp_steam_id64,
       t.season, t.max_teams, t.display_slots_num, t.display_slots_max,
       (SELECT team_name FROM tournament_registrations w WHERE w.id = t.winner_registration_id) AS winner_team_name,
       COALESCE(NULLIF(TRIM(t.winner_override_name), ''), (SELECT team_name FROM tournament_registrations w2 WHERE w2.id = t.winner_registration_id)) AS winner_display_name,
       (SELECT COUNT(*)::int FROM tournament_registrations r WHERE r.tournament_id = t.id AND r.status = 'accepted') AS accepted_count
FROM tournaments t
WHERE t.status IN ('open','closed','finished','draft')
ORDER BY (t.status = 'open') DESC, (t.status = 'draft') DESC, t.starts_at DESC NULLS LAST, t.id DESC`;

function parseRosterJson(raw) {
    if (!raw) return [];
    if (Array.isArray(raw)) return raw;
    if (typeof raw === "string") {
        try {
            const p = JSON.parse(raw);
            return Array.isArray(p) ? p : [];
        } catch (_) {
            return [];
        }
    }
    return [];
}

function normalizeSteamId64(raw) {
    const s = String(raw || "").replace(/\D/g, "");
    return /^7656119\d{10}$/.test(s) ? s : null;
}

function rosterHasSteam(roster, steamId64) {
    const sid = normalizeSteamId64(steamId64);
    if (!sid) return false;
    return parseRosterJson(roster).some((p) => {
        const s = String(p.steamId64 || p.steam_id64 || p.steam || "").replace(/\D/g, "");
        return s === sid;
    });
}

function deriveSeason(row) {
    if (row && row.season) return String(row.season);
    const iso = row?.ended_at || row?.starts_at || row?.created_at;
    if (!iso) return null;
    try {
        return String(new Date(iso).getFullYear());
    } catch (_) {
        return null;
    }
}

function durationMinutes(startIso, endIso) {
    if (!startIso || !endIso) return null;
    const ms = new Date(endIso).getTime() - new Date(startIso).getTime();
    if (!Number.isFinite(ms) || ms <= 0) return null;
    return Math.round(ms / 60000);
}

async function fetchApprovedRoster(pool) {
    const r = await pool.query(
        `SELECT id, display_name, role_label, steam_id64, persona_name, avatar_url,
                twitch_url, kick_url, x_url, instagram_url, youtube_url, tiktok_url
         FROM team_roster_submissions
         WHERE status = 'approved'
         ORDER BY LOWER(display_name) ASC, id ASC`
    );
    return r.rows;
}

async function fetchTournamentSummaries(pool) {
    const r = await pool.query(TOURNAMENT_LIST_SQL);
    return r.rows.map((row) => Object.assign(row, { season: deriveSeason(row) }));
}

async function fetchTournamentRow(pool, slug) {
    const r = await pool.query(
        `SELECT t.*,
          (SELECT COUNT(*)::int FROM tournament_registrations r WHERE r.tournament_id = t.id AND r.status = 'accepted') AS accepted_count,
          (SELECT COUNT(*)::int FROM tournament_registrations r WHERE r.tournament_id = t.id AND r.status IN ('pending','accepted')) AS active_count,
          (SELECT team_name FROM tournament_registrations w WHERE w.id = t.winner_registration_id) AS winner_team_name,
          COALESCE(NULLIF(TRIM(t.winner_override_name), ''), (SELECT team_name FROM tournament_registrations w2 WHERE w2.id = t.winner_registration_id)) AS winner_display_name,
          COALESCE(t.winner_roster_snapshot, (SELECT r.roster FROM tournament_registrations r WHERE r.id = t.winner_registration_id)) AS winner_roster,
          (SELECT team_name FROM tournament_registrations ru WHERE ru.id = t.runner_up_registration_id) AS runner_up_team_name
         FROM tournaments t WHERE t.slug = $1`,
        [slug]
    );
    if (!r.rows.length) return null;
    const row = r.rows[0];
    row.season = deriveSeason(row);
    return row;
}

async function resolveRunnerUp(pool, tournamentRow) {
    if (!tournamentRow) return null;
    if (tournamentRow.runner_up_registration_id) {
        const r = await pool.query(
            `SELECT id, team_name, team_tag, captain_name, roster FROM tournament_registrations WHERE id = $1`,
            [tournamentRow.runner_up_registration_id]
        );
        if (r.rows.length) {
            const reg = r.rows[0];
            return {
                registration_id: reg.id,
                team_name: reg.team_name,
                team_tag: reg.team_tag || null,
                captain_name: reg.captain_name || null,
                roster: parseRosterJson(reg.roster)
            };
        }
    }
    const winnerId = tournamentRow.winner_registration_id;
    if (!winnerId) return null;
    const maxR = await pool.query(
        `SELECT MAX(round_no)::int AS max_round FROM tournament_matches WHERE tournament_id = $1`,
        [tournamentRow.id]
    );
    const maxRound = maxR.rows[0]?.max_round;
    if (!maxRound) return null;
    const finals = await pool.query(
        `SELECT registration_a_id, registration_b_id, winner_registration_id
         FROM tournament_matches
         WHERE tournament_id = $1 AND round_no = $2 AND winner_registration_id IS NOT NULL
         ORDER BY slot_no DESC LIMIT 1`,
        [tournamentRow.id, maxRound]
    );
    const fin = finals.rows[0];
    if (!fin) return null;
    const loserId =
        fin.winner_registration_id === fin.registration_a_id ? fin.registration_b_id : fin.registration_a_id;
    if (!loserId || loserId === winnerId) return null;
    const r = await pool.query(
        `SELECT id, team_name, team_tag, captain_name, roster FROM tournament_registrations WHERE id = $1`,
        [loserId]
    );
    if (!r.rows.length) return null;
    const reg = r.rows[0];
    return {
        registration_id: reg.id,
        team_name: reg.team_name,
        team_tag: reg.team_tag || null,
        captain_name: reg.captain_name || null,
        roster: parseRosterJson(reg.roster),
        derived_from_bracket: true
    };
}

function resolveMvp(tournamentRow) {
    if (!tournamentRow) return null;
    const name = tournamentRow.mvp_name ? String(tournamentRow.mvp_name).trim() : "";
    const steam = normalizeSteamId64(tournamentRow.mvp_steam_id64);
    if (!name && !steam) return null;
    return { name: name || null, steam_id64: steam };
}

async function fetchBracket(pool, tournamentId) {
    const m = await pool.query(
        `SELECT m.id, m.round_no, m.slot_no, m.registration_a_id, m.registration_b_id, m.winner_registration_id,
            ta.team_name AS side_a_name,
            tb.team_name AS side_b_name,
            tw.team_name AS winner_name
         FROM tournament_matches m
         LEFT JOIN tournament_registrations ta ON ta.id = m.registration_a_id
         LEFT JOIN tournament_registrations tb ON tb.id = m.registration_b_id
         LEFT JOIN tournament_registrations tw ON tw.id = m.winner_registration_id
         WHERE m.tournament_id = $1
         ORDER BY m.round_no, m.slot_no`,
        [tournamentId]
    );
    return m.rows;
}

async function loadFinishedDetails(pool, limit) {
    const summaries = (await fetchTournamentSummaries(pool)).filter((t) => t.status === "finished");
    const slice = summaries.slice(0, limit || 20);
    const details = [];
    for (const t of slice) {
        const full = await fetchTournamentRow(pool, t.slug);
        if (full) details.push(full);
    }
    return details;
}

function buildAwards(tournamentRow, runnerUp, mvp) {
    const awards = [];
    if (tournamentRow.winner_display_name || tournamentRow.winner_team_name) {
        awards.push({
            type: "champion",
            label: "Campeón",
            name: tournamentRow.winner_display_name || tournamentRow.winner_team_name
        });
    }
    if (runnerUp?.team_name) {
        awards.push({ type: "runner_up", label: "Finalista", name: runnerUp.team_name });
    }
    if (mvp?.name || mvp?.steam_id64) {
        awards.push({
            type: "mvp",
            label: "MVP",
            name: mvp.name || mvp.steam_id64,
            steam_id64: mvp.steam_id64 || null
        });
    }
    if (tournamentRow.prize_pool_text) {
        awards.push({ type: "prize", label: "Prize pool", name: tournamentRow.prize_pool_text });
    }
    return awards;
}

async function serializeResultCard(pool, tournamentRow) {
    const runnerUp = await resolveRunnerUp(pool, tournamentRow);
    const mvp = resolveMvp(tournamentRow);
    return {
        slug: tournamentRow.slug,
        title: tournamentRow.title,
        status: tournamentRow.status,
        season: tournamentRow.season,
        starts_at: tournamentRow.starts_at,
        ended_at: tournamentRow.ended_at,
        duration_minutes: durationMinutes(tournamentRow.starts_at, tournamentRow.ended_at),
        winner: {
            name: tournamentRow.winner_display_name || tournamentRow.winner_team_name || null,
            team_name: tournamentRow.winner_team_name || null,
            roster: parseRosterJson(tournamentRow.winner_roster)
        },
        runner_up: runnerUp
            ? {
                  name: runnerUp.team_name,
                  team_name: runnerUp.team_name,
                  team_tag: runnerUp.team_tag,
                  derived_from_bracket: Boolean(runnerUp.derived_from_bracket)
              }
            : null,
        mvp,
        prize: {
            pool: tournamentRow.prize_pool_text || null,
            sub: tournamentRow.prize_sub_text || null
        },
        participants: {
            accepted_count: tournamentRow.accepted_count ?? null,
            max_teams: tournamentRow.max_teams ?? null
        },
        awards: buildAwards(tournamentRow, runnerUp, mvp),
        links: {
            tournament: `/tournament.html?slug=${encodeURIComponent(tournamentRow.slug)}`,
            results: `/results/?t=${encodeURIComponent(tournamentRow.slug)}`
        }
    };
}

async function computeStandings(pool, options) {
    options = options || {};
    const season = options.season ? String(options.season).trim() : null;
    const limit = Math.min(Math.max(Number(options.limit) || 50, 1), 100);

    const [roster, tournaments] = await Promise.all([fetchApprovedRoster(pool), fetchTournamentSummaries(pool)]);
    let finished = tournaments.filter((t) => t.status === "finished");
    if (season) finished = finished.filter((t) => deriveSeason(t) === season);

    const finishedDetails = [];
    for (const t of finished.slice(0, 30)) {
        const full = await fetchTournamentRow(pool, t.slug);
        if (full) finishedDetails.push(full);
    }

    const playerMap = new Map();
    roster.forEach((m, idx) => {
        const sid = normalizeSteamId64(m.steam_id64);
        playerMap.set(sid || `roster-${m.id}`, {
            rank: 0,
            steam_id64: sid,
            name: m.display_name || m.persona_name || "Jugador",
            avatar_url: m.avatar_url || null,
            role_label: m.role_label || null,
            team: "MCV",
            wins: 0,
            tournaments_played: 0,
            points: ROSTER_BASE_POINTS,
            kd: null,
            href: sid ? `/player/?steamId=${sid}` : null,
            is_roster: true
        });
    });

    const teamMap = new Map();
    for (const t of finishedDetails) {
        const winnerKey = t.winner_team_name || t.winner_display_name;
        if (winnerKey) {
            const cur = teamMap.get(winnerKey) || {
                name: winnerKey,
                wins: 0,
                tournaments: 0,
                points: 0
            };
            cur.wins += 1;
            cur.tournaments += 1;
            cur.points += WIN_POINTS;
            teamMap.set(winnerKey, cur);
        }
        const rosterJson = parseRosterJson(t.winner_roster);
        rosterJson.forEach((p) => {
            const sid = normalizeSteamId64(p.steamId64 || p.steam_id64);
            if (!sid) return;
            let row = playerMap.get(sid);
            if (!row) {
                row = {
                    rank: 0,
                    steam_id64: sid,
                    name: p.name || sid,
                    avatar_url: null,
                    role_label: null,
                    team: winnerKey || "—",
                    wins: 0,
                    tournaments_played: 0,
                    points: 0,
                    kd: null,
                    href: `/player/?steamId=${sid}`,
                    is_roster: false
                };
                playerMap.set(sid, row);
            }
            row.wins += 1;
            row.tournaments_played += 1;
            row.points += WIN_POINTS;
        });
    }

    const players = Array.from(playerMap.values())
        .sort((a, b) => b.points - a.points || b.wins - a.wins || a.name.localeCompare(b.name))
        .slice(0, limit)
        .map((p, i) => Object.assign({}, p, { rank: i + 1 }));

    const teams = Array.from(teamMap.values())
        .sort((a, b) => b.points - a.points || b.wins - a.wins || a.name.localeCompare(b.name))
        .slice(0, limit)
        .map((t, i) => Object.assign({}, t, { rank: i + 1 }));

    const seasons = [...new Set(tournaments.map((t) => deriveSeason(t)).filter(Boolean))].sort().reverse();

    return {
        season: season || "all",
        seasons_available: seasons,
        players,
        teams,
        formula: {
            roster_base_points: ROSTER_BASE_POINTS,
            win_points: WIN_POINTS,
            note: "Ranking oficial MCV — wins de torneos finished + base roster aprobado"
        }
    };
}

async function buildPlayerPublic(pool, steamId64) {
    const sid = normalizeSteamId64(steamId64);
    if (!sid) return null;

    const roster = await fetchApprovedRoster(pool);
    const member = roster.find((m) => normalizeSteamId64(m.steam_id64) === sid) || null;
    const tournaments = await fetchTournamentSummaries(pool);
    const finished = tournaments.filter((t) => t.status === "finished");

    const wins = [];
    const playedSlugs = new Set();
    for (const t of finished) {
        const full = await fetchTournamentRow(pool, t.slug);
        if (!full) continue;
        const inWinner = rosterHasSteam(full.winner_roster, sid);
        if (inWinner) {
            wins.push({
                slug: full.slug,
                title: full.title,
                ended_at: full.ended_at,
                season: full.season,
                role: "champion"
            });
            playedSlugs.add(full.slug);
        }
        const regs = await pool.query(
            `SELECT roster FROM tournament_registrations WHERE tournament_id = $1 AND status = 'accepted'`,
            [full.id]
        );
        for (const reg of regs.rows) {
            if (rosterHasSteam(reg.roster, sid)) playedSlugs.add(full.slug);
        }
    }

    const tournamentsPlayed = playedSlugs.size;
    const winCount = wins.length;
    const points = (member ? ROSTER_BASE_POINTS : 0) + winCount * WIN_POINTS;

    const achievements = [
        {
            id: "roster",
            label: "Roster MCV",
            unlocked: Boolean(member),
            description: "Miembro aprobado del clan competitivo"
        },
        {
            id: "champion",
            label: "Champion",
            unlocked: winCount > 0,
            description: winCount > 0 ? `${winCount} torneo(s) ganado(s)` : "Ganá un torneo MCV"
        },
        {
            id: "mvp",
            label: "MVP",
            unlocked: false,
            description: "MVP oficial — asignado por staff en torneos",
            placeholder: true
        }
    ];

    for (const t of finished.slice(0, 15)) {
        const full = await fetchTournamentRow(pool, t.slug);
        if (!full) continue;
        const mvp = resolveMvp(full);
        if (mvp?.steam_id64 === sid) {
            achievements.find((a) => a.id === "mvp").unlocked = true;
            achievements.find((a) => a.id === "mvp").placeholder = false;
            break;
        }
    }

    const activity = wins.slice(0, 5).map((w) => ({
        icon: "🏆",
        text: `Ganó ${w.title}`,
        at: w.ended_at,
        href: `/results/?t=${encodeURIComponent(w.slug)}`
    }));

    if (member) {
        activity.push({
            icon: "🎖",
            text: `${member.display_name} — roster MCV activo`,
            at: null,
            href: "/equipo/"
        });
    }

    return {
        profile: {
            steam_id64: sid,
            display_name: member?.display_name || null,
            persona_name: member?.persona_name || null,
            avatar_url: member?.avatar_url || null,
            role_label: member?.role_label || null,
            country: null,
            links: member
                ? {
                      twitch: member.twitch_url,
                      kick: member.kick_url,
                      x: member.x_url,
                      instagram: member.instagram_url,
                      youtube: member.youtube_url,
                      tiktok: member.tiktok_url
                  }
                : null,
            is_roster: Boolean(member)
        },
        stats: {
            tournament_wins: winCount,
            tournaments_played: tournamentsPlayed,
            win_rate: tournamentsPlayed > 0 ? Math.round((winCount / tournamentsPlayed) * 100) : null,
            points
        },
        achievements,
        teams: member ? [{ id: "mcv", name: "MCV", role: member.role_label || "Roster" }] : [],
        history: wins.map((w) => ({
            type: "tournament_win",
            title: w.title,
            slug: w.slug,
            season: w.season,
            at: w.ended_at
        })),
        activity
    };
}

async function buildResultsPublic(pool, options) {
    options = options || {};
    const season = options.season ? String(options.season).trim() : null;
    const slug = options.slug ? String(options.slug).trim() : null;
    const { limit, offset } = options;

    if (slug) {
        const row = await fetchTournamentRow(pool, slug);
        if (!row || row.status !== "finished") return { results: [], total: 0 };
        const card = await serializeResultCard(pool, row);
        let bracket = null;
        if (options.includeBracket) {
            bracket = await fetchBracket(pool, row.id);
        }
        return { results: [Object.assign(card, { bracket })], total: 1 };
    }

    let summaries = (await fetchTournamentSummaries(pool)).filter((t) => t.status === "finished");
    if (season) summaries = summaries.filter((t) => deriveSeason(t) === season);
    const total = summaries.length;
    const slice = summaries.slice(offset, offset + limit);
    const results = [];
    for (const t of slice) {
        const full = await fetchTournamentRow(pool, t.slug);
        if (full) results.push(await serializeResultCard(pool, full));
    }
    return { results, total };
}

function buildWipeCalendarEvents(at) {
    at = at instanceof Date ? at : new Date();
    const events = [];
    const y = at.getFullYear();
    const m = at.getMonth();
    for (let monthOffset = 0; monthOffset < 3; monthOffset += 1) {
        const ym = m + monthOffset;
        const year = y + Math.floor(ym / 12);
        const monthIndex = ((ym % 12) + 12) % 12;
        const firstThu = getNthThursdayOfMonth(year, monthIndex, 1);
        const secondThu = getNthThursdayOfMonth(year, monthIndex, 2);
        const fourthThu = getNthThursdayOfMonth(year, monthIndex, 4);
        if (firstThu) {
            events.push({
                type: "wipe",
                subtype: "monthly-main",
                title: "Wipe Monthly Vital — inicio",
                starts_at: startOfDay(firstThu).toISOString(),
                ends_at: secondThu ? endOfDay(secondThu).toISOString() : null,
                source: "vital_calendar",
                href: "https://discord.gg/mBRrUA8wH6"
            });
        }
        if (fourthThu) {
            events.push({
                type: "wipe",
                subtype: "medium-rewipe",
                title: "Rewipe Medium Vital",
                starts_at: startOfDay(fourthThu).toISOString(),
                ends_at: endOfDay(new Date(fourthThu.getFullYear(), fourthThu.getMonth(), fourthThu.getDate() + 3)).toISOString(),
                source: "vital_calendar",
                href: "https://discord.gg/mBRrUA8wH6"
            });
        }
    }
    const period = resolveMonthlyPeriod(at);
    return { events, current_period: period };
}

async function buildCalendarPublic(pool) {
    const tournaments = await fetchTournamentSummaries(pool);
    const events = [];
    tournaments.forEach((t) => {
        if (t.starts_at) {
            events.push({
                type: "tournament",
                subtype: "match",
                title: t.title,
                slug: t.slug,
                status: t.status,
                starts_at: t.starts_at,
                href: `/tournament.html?slug=${encodeURIComponent(t.slug)}`
            });
        }
        if (t.status === "open" && t.registration_closes_at) {
            events.push({
                type: "tournament",
                subtype: "registration",
                title: `Inscripción — ${t.title}`,
                slug: t.slug,
                status: t.status,
                starts_at: t.registration_closes_at,
                href: `/tournament.html?slug=${encodeURIComponent(t.slug)}#register`
            });
        }
    });

    const wipePack = buildWipeCalendarEvents(new Date());
    events.push(...wipePack.events);

    events.push({
        type: "stream",
        subtype: "live",
        title: "MCV Live — Kick / Twitch",
        starts_at: null,
        href: "/live.html",
        placeholder: true
    });

    events.sort((a, b) => {
        const ta = a.starts_at ? new Date(a.starts_at).getTime() : 0;
        const tb = b.starts_at ? new Date(b.starts_at).getTime() : 0;
        return tb - ta;
    });

    return {
        events,
        current_wipe_period: wipePack.current_period,
        total: events.length
    };
}

async function buildSearchPublic(pool, query, limit) {
    const q = String(query || "").trim().toLowerCase();
    if (!q || q.length < 2) {
        return { query: q, results: [] };
    }
    limit = Math.min(Math.max(limit || 12, 1), 30);
    const results = [];
    const [tournaments, roster] = await Promise.all([fetchTournamentSummaries(pool), fetchApprovedRoster(pool)]);

    tournaments.forEach((t) => {
        const hay = `${t.title} ${t.slug} ${t.winner_display_name || ""} ${t.winner_team_name || ""}`.toLowerCase();
        if (hay.includes(q)) {
            results.push({
                type: t.status === "finished" ? "result" : "tournament",
                label: t.title,
                sub: t.status === "finished" ? t.winner_display_name || t.winner_team_name : t.status,
                href:
                    t.status === "finished"
                        ? `/results/?t=${encodeURIComponent(t.slug)}`
                        : `/tournament.html?slug=${encodeURIComponent(t.slug)}`
            });
        }
    });

    roster.forEach((m) => {
        const hay = `${m.display_name} ${m.persona_name || ""} ${m.role_label || ""}`.toLowerCase();
        if (hay.includes(q) && m.steam_id64) {
            results.push({
                type: "player",
                label: m.display_name,
                sub: m.role_label || "MCV Roster",
                href: `/player/?steamId=${encodeURIComponent(m.steam_id64)}`
            });
        }
    });

    results.push({
        type: "clan",
        label: "MCV Oficial",
        sub: "Clan · Discord · Torneos",
        href: "/"
    });

    const navPages = [
        { label: "Resultados", href: "/results/", keys: ["resultado", "results"] },
        { label: "Ranking", href: "/standings/", keys: ["ranking", "standings", "top"] },
        { label: "Calendario", href: "/calendar/", keys: ["calendario", "calendar", "evento"] },
        { label: "Equipo", href: "/equipo/", keys: ["equipo", "clan", "roster"] }
    ];
    navPages.forEach((p) => {
        if (p.keys.some((k) => k.includes(q) || q.includes(k))) {
            results.push({ type: "page", label: p.label, sub: "Navegación", href: p.href });
        }
    });

    return { query: q, results: results.slice(0, limit) };
}

async function buildTeamPublic(pool, teamId) {
    const id = String(teamId || "mcv").toLowerCase();
    if (id !== "mcv") {
        const num = Number.parseInt(id, 10);
        if (Number.isFinite(num)) {
            const r = await pool.query(
                `SELECT id, display_name, role_label, steam_id64, avatar_url, status
                 FROM team_roster_submissions WHERE id = $1 AND status = 'approved'`,
                [num]
            );
            if (!r.rows.length) return null;
            const m = r.rows[0];
            return {
                id: String(m.id),
                name: m.display_name,
                type: "member",
                member: m,
                href: m.steam_id64 ? `/player/?steamId=${m.steam_id64}` : "/equipo/"
            };
        }
        return null;
    }

    const roster = await fetchApprovedRoster(pool);
    let recruiting = false;
    try {
        const flag = String(process.env.MCV_TEAM_RECRUITING || "").trim().toLowerCase();
        recruiting = flag === "1" || flag === "true" || flag === "yes";
    } catch (_) {
        /* ignore */
    }

    return {
        id: "mcv",
        name: "MCV Oficial",
        type: "clan",
        active_count: roster.length,
        recruiting,
        preview: roster.slice(0, 6).map((m) => ({
            display_name: m.display_name,
            avatar_url: m.avatar_url,
            steam_id64: m.steam_id64
        })),
        href: "/equipo/"
    };
}

async function buildTournamentPublic(pool, slug, includeBracket) {
    const row = await fetchTournamentRow(pool, slug);
    if (!row) return null;
    const runnerUp = await resolveRunnerUp(pool, row);
    const mvp = resolveMvp(row);
    const payload = {
        slug: row.slug,
        title: row.title,
        description: row.description,
        status: row.status,
        season: row.season,
        format_label: row.format_label,
        starts_at: row.starts_at,
        ended_at: row.ended_at,
        registration_closes_at: row.registration_closes_at,
        prize: { pool: row.prize_pool_text, sub: row.prize_sub_text },
        participants: {
            accepted_count: row.accepted_count,
            max_teams: row.max_teams,
            active_count: row.active_count
        },
        winner: {
            name: row.winner_display_name || row.winner_team_name,
            team_name: row.winner_team_name,
            roster: parseRosterJson(row.winner_roster)
        },
        runner_up: runnerUp,
        mvp,
        awards: buildAwards(row, runnerUp, mvp),
        duration_minutes: durationMinutes(row.starts_at, row.ended_at),
        poster_url: row.poster_url,
        links: {
            register: `/tournament.html?slug=${encodeURIComponent(row.slug)}#register`,
            results: `/results/?t=${encodeURIComponent(row.slug)}`
        }
    };
    if (includeBracket) {
        payload.bracket = {
            winner_registration_id: row.winner_registration_id,
            matches: await fetchBracket(pool, row.id)
        };
    }
    return payload;
}

async function fetchDiscordCounts() {
    try {
        const { data } = await axios.get(`https://discord.com/api/v9/invites/${DISCORD_INVITE}?with_counts=true`, {
            timeout: 8000
        });
        return {
            invite_code: DISCORD_INVITE,
            members: data.approximate_member_count ?? null,
            online: data.approximate_presence_count ?? null,
            status_label:
                data.approximate_presence_count != null
                    ? `${data.approximate_presence_count} online`
                    : "Servidor activo"
        };
    } catch (_) {
        return { invite_code: DISCORD_INVITE, members: null, online: null, status_label: "Servidor activo" };
    }
}

async function checkStreamLive() {
    async function isLive(url) {
        try {
            const { data } = await axios.get(url, { timeout: 6000, responseType: "text", transformResponse: [(d) => d] });
            const s = String(data || "").toLowerCase();
            return s.includes("live") || s.includes("online");
        } catch (_) {
            return false;
        }
    }
    const [kick, twitch] = await Promise.all([
        isLive(`https://decapi.me/kick/status/${encodeURIComponent(KICK_CHANNEL)}`),
        isLive(`https://decapi.me/twitch/status/${encodeURIComponent(TWITCH_CHANNEL)}`)
    ]);
    return { kick, twitch, any: kick || twitch, channels: { kick: KICK_CHANNEL, twitch: TWITCH_CHANNEL } };
}

function hoursUntil(iso) {
    if (!iso) return null;
    const ms = new Date(iso).getTime() - Date.now();
    if (ms <= 0) return null;
    return Math.max(1, Math.ceil(ms / 3600000));
}

async function buildForSite(pool) {
    const openQ = await pool.query(
        `SELECT t.slug, t.title, t.status, t.starts_at, t.ended_at, t.prize_pool_text, t.registration_closes_at,
                t.winner_registration_id, t.winner_override_name, t.max_teams,
                (SELECT COUNT(*)::int FROM tournament_registrations r WHERE r.tournament_id = t.id AND r.status = 'accepted') AS accepted_count,
                (SELECT team_name FROM tournament_registrations w WHERE w.id = t.winner_registration_id) AS winner_team_name,
                COALESCE(NULLIF(TRIM(t.winner_override_name), ''), (SELECT team_name FROM tournament_registrations w2 WHERE w2.id = t.winner_registration_id)) AS winner_display_name
         FROM tournaments t WHERE t.status = 'open'
         ORDER BY t.starts_at DESC NULLS LAST, t.id DESC LIMIT 1`
    );
    if (openQ.rows.length) {
        return { mode: "live", tournament: openQ.rows[0] };
    }
    const finQ = await pool.query(
        `SELECT t.slug, t.title, t.status, t.starts_at, t.ended_at, t.prize_pool_text, t.registration_closes_at,
                t.winner_registration_id, t.winner_override_name,
                (SELECT team_name FROM tournament_registrations w WHERE w.id = t.winner_registration_id) AS winner_team_name,
                COALESCE(NULLIF(TRIM(t.winner_override_name), ''), (SELECT team_name FROM tournament_registrations w2 WHERE w2.id = t.winner_registration_id)) AS winner_display_name
         FROM tournaments t WHERE t.status = 'finished'
         ORDER BY t.ended_at DESC NULLS LAST, t.id DESC LIMIT 1`
    );
    if (finQ.rows.length) {
        return { mode: "recap", tournament: finQ.rows[0] };
    }
    return { mode: "empty", tournament: null };
}

function pickHeroState(forSite, tournaments, streamLive) {
    const open = tournaments.filter((t) => t.status === "open");
    let t;

    if (forSite.mode === "live" && forSite.tournament) {
        t = forSite.tournament;
        return {
            type: "live-tournament",
            badge: "Inscripciones abiertas",
            badge_variant: "live",
            title: t.title || "Torneo en curso",
            meta: buildTournamentMeta(t),
            actions: [
                { href: `/tournament.html?slug=${encodeURIComponent(t.slug)}`, label: "Participar", variant: "primary" },
                { href: "/events.html", label: "Ver torneos", variant: "secondary" }
            ]
        };
    }

    if (streamLive?.any) {
        return {
            type: "stream",
            badge: "En vivo",
            badge_variant: "live",
            title: "Stream activo — MCV Live",
            meta: "Kick o Twitch transmitiendo ahora",
            actions: [
                { href: "/live.html", label: "Ver stream", variant: "primary" },
                { href: "https://discord.gg/mBRrUA8wH6", label: "Discord", variant: "secondary" }
            ]
        };
    }

    if (forSite.mode === "recap" && forSite.tournament) {
        t = forSite.tournament;
        const winner = t.winner_display_name || t.winner_team_name || "Campeón";
        return {
            type: "champion",
            badge: "Nuevo campeón",
            badge_variant: "champion",
            title: `${winner} ganó ${t.title || "el último torneo"}`,
            meta: t.ended_at || t.starts_at,
            actions: [
                { href: `/results/?t=${encodeURIComponent(t.slug || "")}`, label: "Ver resultado", variant: "primary" },
                { href: `/tournament.html?slug=${encodeURIComponent(t.slug || "")}`, label: "Detalle", variant: "secondary" }
            ]
        };
    }

    for (const ot of open) {
        const hrs = hoursUntil(ot.starts_at);
        if (hrs != null) {
            return {
                type: "countdown",
                badge: "Próximo torneo",
                badge_variant: "open",
                title: `Match en ${hrs} h — ${ot.title || ot.slug}`,
                meta: ot.starts_at,
                actions: [
                    { href: `/tournament.html?slug=${encodeURIComponent(ot.slug)}`, label: "Inscribirse", variant: "primary" },
                    { href: "/calendar/", label: "Calendario", variant: "secondary" }
                ]
            };
        }
    }

    if (open.length) {
        t = open[0];
        return {
            type: "registration",
            badge: "Inscripción abierta",
            badge_variant: "open",
            title: t.title || "Torneo MCV",
            meta: buildTournamentMeta(t),
            actions: [
                { href: `/tournament.html?slug=${encodeURIComponent(t.slug)}#register`, label: "Registrar team", variant: "primary" },
                { href: "/events.html", label: "Ver todos", variant: "secondary" }
            ]
        };
    }

    return { type: "idle" };
}

function buildTournamentMeta(t) {
    const parts = [];
    if (t.accepted_count != null) parts.push(`${t.accepted_count} equipos`);
    if (t.registration_closes_at) parts.push(`Cierra ${t.registration_closes_at}`);
    return parts.join(" · ");
}

async function buildActivityFeed(pool, ctx) {
    const items = [];
    for (const t of (ctx.finishedDetails || []).slice(0, 4)) {
        const winner = t.winner_display_name || t.winner_team_name;
        if (winner) {
            items.push({
                icon: "🏆",
                text: `${winner} ganó ${t.title || t.slug}`,
                at: t.ended_at || t.starts_at,
                href: `/results/?t=${encodeURIComponent(t.slug)}`
            });
        }
    }
    (ctx.open || []).forEach((t) => {
        items.push({
            icon: "📅",
            text: `Inscripciones abiertas — ${t.title || t.slug}`,
            at: t.registration_closes_at || t.starts_at,
            href: `/tournament.html?slug=${encodeURIComponent(t.slug)}#register`
        });
    });
    if (ctx.streamLive?.any) {
        items.unshift({
            icon: "🎥",
            text: "Stream en directo — MCV Live",
            at: new Date().toISOString(),
            href: "/live.html"
        });
    }
    (ctx.roster || []).slice(0, 2).forEach((m) => {
        if (m.display_name) {
            items.push({
                icon: "🎖",
                text: `${m.display_name} — roster MCV activo`,
                at: null,
                href: m.steam_id64 ? `/player/?steamId=${m.steam_id64}` : "/equipo/"
            });
        }
    });
    const wipeEvents = buildWipeCalendarEvents(new Date()).events;
    const nextWipe = wipeEvents.find((e) => e.starts_at && new Date(e.starts_at) >= new Date());
    items.push({
        icon: "🔥",
        text: nextWipe ? nextWipe.title : "Próximo wipe Vital",
        at: nextWipe?.starts_at || null,
        href: "https://discord.gg/mBRrUA8wH6",
        placeholder: !nextWipe
    });
    items.sort((a, b) => {
        const ta = a.at ? new Date(a.at).getTime() : 0;
        const tb = b.at ? new Date(b.at).getTime() : 0;
        return tb - ta;
    });
    return items.slice(0, 8);
}

async function fetchPlatformStats(pool) {
    const [finishedQ, rosterQ] = await Promise.all([
        pool.query(`SELECT COUNT(*)::int AS c FROM tournaments WHERE status = 'finished'`),
        pool.query(`SELECT COUNT(*)::int AS c FROM team_roster_submissions WHERE status = 'approved'`)
    ]);
    return {
        tournaments_finished: finishedQ.rows[0].c,
        team_roster_approved: rosterQ.rows[0].c
    };
}

async function buildHomePublic(pool, options) {
    options = options || {};
    const includeStream = options.includeStream !== false;
    const [forSite, tournaments, roster, discord, stats] = await Promise.all([
        buildForSite(pool),
        fetchTournamentSummaries(pool),
        fetchApprovedRoster(pool),
        fetchDiscordCounts(),
        fetchPlatformStats(pool)
    ]);

    const open = tournaments.filter((t) => t.status === "open" || t.status === "closed");
    const finished = tournaments.filter((t) => t.status === "finished");
    const finishedDetails = [];
    for (const t of finished.slice(0, 6)) {
        const full = await fetchTournamentRow(pool, t.slug);
        if (full) finishedDetails.push(full);
    }

    const streamLive = includeStream ? await checkStreamLive() : { any: false };
    const standings = await computeStandings(pool, { limit: 5 });
    const resultsPack = await buildResultsPublic(pool, { limit: 4, offset: 0 });
    const team = await buildTeamPublic(pool, "mcv");

    const openEnriched = [];
    for (const t of open.slice(0, 4)) {
        const full = await fetchTournamentRow(pool, t.slug);
        openEnriched.push(full || t);
    }

    const ctx = { open, finished, finishedDetails, roster, streamLive };
    const hero = pickHeroState(forSite, tournaments, streamLive);

    return {
        hero,
        activity: await buildActivityFeed(pool, ctx),
        top_players: standings.players.slice(0, 5),
        upcoming_events: openEnriched.map((t) => ({
            slug: t.slug,
            title: t.title,
            status: t.status,
            starts_at: t.starts_at,
            registration_closes_at: t.registration_closes_at,
            accepted_count: t.accepted_count,
            max_teams: t.max_teams,
            href: `/tournament.html?slug=${encodeURIComponent(t.slug)}`,
            cta: t.status === "open" ? "Inscribirse" : "Ver torneo"
        })),
        recent_results: resultsPack.results,
        clan: team,
        discord,
        stats,
        stream: streamLive
    };
}

async function buildPulsePublic(pool) {
    const [forSite, tournaments, streamLive] = await Promise.all([
        buildForSite(pool),
        fetchTournamentSummaries(pool),
        checkStreamLive()
    ]);
    return {
        hero: pickHeroState(forSite, tournaments, streamLive),
        stream: streamLive,
        for_site: forSite
    };
}

module.exports = {
    parseRosterJson,
    rosterHasSteam,
    normalizeSteamId64,
    deriveSeason,
    fetchApprovedRoster,
    fetchTournamentSummaries,
    fetchTournamentRow,
    resolveRunnerUp,
    resolveMvp,
    computeStandings,
    buildPlayerPublic,
    buildResultsPublic,
    buildCalendarPublic,
    buildSearchPublic,
    buildTeamPublic,
    buildTournamentPublic,
    buildHomePublic,
    buildPulsePublic,
    fetchDiscordCounts,
    checkStreamLive,
    buildWipeCalendarEvents,
    ROSTER_BASE_POINTS,
    WIN_POINTS
};
