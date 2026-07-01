// ============================================================
// Job créatif — Rapport Coupe du Monde 2026
// ============================================================
// Lit la base PostgreSQL (équipes, matchs, votes), calcule le
// classement par groupe et le palmarès des votes, puis écrit un
// rapport horodaté dans 3 formats (Markdown, CSV, JSON) sur un
// volume persistant (PVC).
//
// Conçu pour tourner en CronJob Kubernetes avec la MÊME image que
// l'app (mêmes dépendances pg). Exécution : `node jobs/report.js`.
//
// Variables d'environnement :
//   DB_HOST, DB_PORT, DB_USER, DB_PASSWORD, DB_NAME  → connexion BDD
//   OUTPUT_DIR  → dossier de sortie des rapports (défaut: /reports)
// ============================================================

const fs = require('fs');
const path = require('path');
const pg = require('pg');
const { Pool } = pg;

// Même override que main.js : DATE renvoyée en chaîne YYYY-MM-DD brute,
// sans décalage de fuseau horaire.
if (pg.types && pg.types.setTypeParser) {
  pg.types.setTypeParser(1082, (val) => val);
}

// Toute la configuration vient de l'environnement (injecté par le CronJob :
// variables DB_* + Secret K8s pour le mot de passe, OUTPUT_DIR pour le PVC).
// Aucune valeur en dur : on échoue explicitement si une variable manque.
const REQUIRED_ENV = ['DB_HOST', 'DB_PORT', 'DB_USER', 'DB_PASSWORD', 'DB_NAME', 'OUTPUT_DIR'];
const missing = REQUIRED_ENV.filter((name) => !process.env[name]);
if (missing.length > 0) {
  console.error(`[report] Variables d'environnement manquantes : ${missing.join(', ')}`);
  process.exit(1);
}

const pool = new Pool({
  host: process.env.DB_HOST,
  port: parseInt(process.env.DB_PORT, 10),
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
});

const OUTPUT_DIR = process.env.OUTPUT_DIR;

// ------------------------------------------------------------
// Calcul du classement par groupe
// (même algorithme que la route GET /api/standings de l'app)
// ------------------------------------------------------------
function computeStandings(teams, matches) {
  const standings = {};
  for (const team of teams) {
    standings[team.id] = {
      id: team.id,
      name: team.name,
      group_letter: team.group_letter,
      country_code: team.country_code,
      played: 0, won: 0, drawn: 0, lost: 0,
      goals_for: 0, goals_against: 0, goal_difference: 0, points: 0,
    };
  }

  for (const match of matches) {
    const home = standings[match.team_home_id];
    const away = standings[match.team_away_id];
    if (!home || !away) continue;

    home.played++; away.played++;
    home.goals_for += match.score_home;
    home.goals_against += match.score_away;
    away.goals_for += match.score_away;
    away.goals_against += match.score_home;

    if (match.score_home > match.score_away) {
      home.won++; home.points += 3; away.lost++;
    } else if (match.score_home < match.score_away) {
      away.won++; away.points += 3; home.lost++;
    } else {
      home.drawn++; away.drawn++; home.points += 1; away.points += 1;
    }
  }

  const groups = {};
  for (const team of Object.values(standings)) {
    team.goal_difference = team.goals_for - team.goals_against;
    if (!groups[team.group_letter]) groups[team.group_letter] = [];
    groups[team.group_letter].push(team);
  }

  // Tri : points, puis différence de buts, puis buts marqués
  for (const letter of Object.keys(groups)) {
    groups[letter].sort((a, b) => {
      if (b.points !== a.points) return b.points - a.points;
      if (b.goal_difference !== a.goal_difference) return b.goal_difference - a.goal_difference;
      return b.goals_for - a.goals_for;
    });
  }

  return groups;
}

// ------------------------------------------------------------
// Génération du rapport Markdown
// ------------------------------------------------------------
function renderMarkdown(groups, votes, generatedAt) {
  const lines = [];
  lines.push('# 🏆 Rapport Coupe du Monde 2026');
  lines.push('');
  lines.push(`*Généré le ${generatedAt} par le CronJob worldcup-report*`);
  lines.push('');
  lines.push('## Classement par groupe (phase de groupes)');
  lines.push('');

  for (const letter of Object.keys(groups).sort()) {
    lines.push(`### Groupe ${letter}`);
    lines.push('');
    lines.push('| # | Équipe | J | G | N | P | BP | BC | Diff | Pts |');
    lines.push('|---|--------|---|---|---|---|----|----|------|-----|');
    groups[letter].forEach((t, i) => {
      const diff = t.goal_difference > 0 ? `+${t.goal_difference}` : `${t.goal_difference}`;
      lines.push(`| ${i + 1} | ${t.name} | ${t.played} | ${t.won} | ${t.drawn} | ${t.lost} | ${t.goals_for} | ${t.goals_against} | ${diff} | **${t.points}** |`);
    });
    lines.push('');
  }

  lines.push('## Palmarès des votes (pronostics du public)');
  lines.push('');
  if (votes.length === 0) {
    lines.push('*Aucun vote enregistré pour le moment.*');
  } else {
    lines.push('| # | Équipe | Votes | % |');
    lines.push('|---|--------|-------|---|');
    votes.forEach((v, i) => {
      lines.push(`| ${i + 1} | ${v.team_name} | ${v.votes} | ${v.percentage}% |`);
    });
  }
  lines.push('');
  return lines.join('\n');
}

// ------------------------------------------------------------
// Génération du rapport CSV (classement à plat)
// ------------------------------------------------------------
function renderCsv(groups) {
  const rows = ['group,rank,team,played,won,drawn,lost,goals_for,goals_against,goal_difference,points'];
  for (const letter of Object.keys(groups).sort()) {
    groups[letter].forEach((t, i) => {
      rows.push([
        letter, i + 1, t.name, t.played, t.won, t.drawn, t.lost,
        t.goals_for, t.goals_against, t.goal_difference, t.points,
      ].join(','));
    });
  }
  return rows.join('\n') + '\n';
}

// ------------------------------------------------------------
// Programme principal
// ------------------------------------------------------------
async function main() {
  const generatedAt = new Date().toISOString();
  // Horodatage utilisable dans un nom de fichier (pas de ':' ni de '.')
  const stamp = generatedAt.replace(/[:.]/g, '-');

  console.log(`[report] Démarrage du job — ${generatedAt}`);

  const teamsResult = await pool.query(
    'SELECT id, name, group_letter, country_code FROM teams ORDER BY group_letter, name'
  );
  const matchesResult = await pool.query(
    `SELECT team_home_id, team_away_id, score_home, score_away
     FROM matches WHERE stage = 'Group Stage'`
  );
  const votesResult = await pool.query(`
    SELECT t.id AS team_id, t.name AS team_name, COUNT(v.id) AS votes
    FROM votes v JOIN teams t ON t.id = v.team_id
    GROUP BY t.id, t.name ORDER BY votes DESC
  `);

  const groups = computeStandings(teamsResult.rows, matchesResult.rows);

  const totalVotes = votesResult.rows.reduce((sum, r) => sum + parseInt(r.votes, 10), 0);
  const votes = votesResult.rows.map((r) => ({
    team_id: r.team_id,
    team_name: r.team_name,
    votes: parseInt(r.votes, 10),
    percentage: totalVotes > 0
      ? parseFloat(((parseInt(r.votes, 10) / totalVotes) * 100).toFixed(2))
      : 0,
  }));

  const payload = { generated_at: generatedAt, groups, votes };

  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  const base = path.join(OUTPUT_DIR, `report-${stamp}`);
  fs.writeFileSync(`${base}.md`, renderMarkdown(groups, votes, generatedAt));
  fs.writeFileSync(`${base}.csv`, renderCsv(groups));
  fs.writeFileSync(`${base}.json`, JSON.stringify(payload, null, 2));
  // Copie "latest" pour récupération facile sans connaître l'horodatage
  fs.writeFileSync(path.join(OUTPUT_DIR, 'report-latest.md'), renderMarkdown(groups, votes, generatedAt));

  const teamCount = teamsResult.rows.length;
  const groupCount = Object.keys(groups).length;
  console.log(`[report] ${teamCount} équipes, ${groupCount} groupes, ${totalVotes} votes traités`);
  console.log(`[report] Rapports écrits dans ${OUTPUT_DIR}/ : ${base}.{md,csv,json}`);
}

main()
  .then(() => pool.end())
  .then(() => {
    console.log('[report] Terminé avec succès');
    process.exit(0);
  })
  .catch((err) => {
    console.error(`[report] Échec : ${err.message}`);
    pool.end().finally(() => process.exit(1));
  });
