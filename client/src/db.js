/*
 * db.js — schéma, migrations et les DEUX moteurs SQLite derrière une seule porte.
 * Applique §2 (couche la plus basse), §3.3 (schéma v1) et §3.4 (migrations posées
 * au jour 1 : le projet séries n'en a aucune et le regrette).
 * Le reste du code n'appelle que query / run / runMany : le même SQL tourne sur
 * sql.js (navigateur) et sur SQLite natif (Android), sans une seule branche.
 * Piège évité : PRAGMA foreign_keys se repose à CHAQUE ouverture, il n'est pas
 * persistant ; sans lui les cascades de §6 ne se déclenchent pas.
 */

import { Capacitor } from '@capacitor/core';

// ---------------------------------------------------------------------------
// Schéma v1 — §3.3. Défini une seule fois, exécuté en CREATE ... IF NOT EXISTS.
// ---------------------------------------------------------------------------

const SCHEMA = `
CREATE TABLE IF NOT EXISTS profiles (
  id         TEXT PRIMARY KEY,
  name       TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS oeuvres (
  profile_id       TEXT NOT NULL,
  oeuvre_id        TEXT NOT NULL,
  titre            TEXT NOT NULL,
  auteurs          TEXT,
  annee            TEXT,
  date_publication TEXT,
  couverture_url   TEXT,
  resume           TEXT,
  categories       TEXT,
  langue           TEXT,
  cycle_nom        TEXT,
  cycle_tome       INTEGER,
  cycle_manuel     INTEGER NOT NULL DEFAULT 0,
  statut           TEXT NOT NULL DEFAULT 'a_lire',
  note             INTEGER,
  position         INTEGER NOT NULL DEFAULT 0,
  edition_active   TEXT,
  ajoute_le        TEXT NOT NULL DEFAULT (datetime('now')),
  commence_le      TEXT,
  termine_le       TEXT,
  PRIMARY KEY (profile_id, oeuvre_id),
  FOREIGN KEY (profile_id) REFERENCES profiles(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS editions (
  profile_id       TEXT NOT NULL,
  edition_id       TEXT NOT NULL,
  oeuvre_id        TEXT NOT NULL,
  source           TEXT NOT NULL,
  titre            TEXT NOT NULL,
  auteurs          TEXT,
  format           TEXT NOT NULL DEFAULT 'papier',
  isbn13           TEXT,
  isbn10           TEXT,
  editeur          TEXT,
  date_publication TEXT,
  nb_pages         INTEGER,
  duree_minutes    INTEGER,
  couverture_url   TEXT,
  langue           TEXT,
  ajoute_le        TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (profile_id, edition_id),
  FOREIGN KEY (profile_id, oeuvre_id) REFERENCES oeuvres(profile_id, oeuvre_id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS listes (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  profile_id TEXT NOT NULL,
  name       TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (profile_id, name),
  FOREIGN KEY (profile_id) REFERENCES profiles(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS liste_items (
  liste_id   INTEGER NOT NULL,
  profile_id TEXT NOT NULL,
  oeuvre_id  TEXT NOT NULL,
  added_at   TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (profile_id, liste_id, oeuvre_id),
  FOREIGN KEY (liste_id) REFERENCES listes(id) ON DELETE CASCADE,
  FOREIGN KEY (profile_id, oeuvre_id) REFERENCES oeuvres(profile_id, oeuvre_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_editions_oeuvre    ON editions(profile_id, oeuvre_id);
CREATE INDEX IF NOT EXISTS idx_liste_items_oeuvre ON liste_items(profile_id, oeuvre_id);
`;

/*
 * Migration v2 — tranche 6. Une ligne par jour et par livre : la position
 * atteinte ce jour-là. Pas d'historique de lectures antérieures (§5.2), juste
 * de quoi dire « tu as lu N pages cette semaine ».
 * INSERT OR REPLACE sur la clé (profil, œuvre, jour) : saisir trois fois sa
 * position dans la journée ne crée pas trois lignes.
 */
const SESSIONS_LECTURE = `
CREATE TABLE IF NOT EXISTS sessions_lecture (
  profile_id   TEXT NOT NULL,
  oeuvre_id    TEXT NOT NULL,
  jour         TEXT NOT NULL,
  position_fin INTEGER NOT NULL,
  PRIMARY KEY (profile_id, oeuvre_id, jour),
  FOREIGN KEY (profile_id, oeuvre_id) REFERENCES oeuvres(profile_id, oeuvre_id) ON DELETE CASCADE
);
`;

/*
 * MIGRATIONS — §3.4. L'index dans le tableau EST le numéro de version.
 * PRAGMA user_version dit où on en est ; on applique ce qui manque, puis on
 * réécrit user_version.
 * La v2 est la PREMIÈRE migration réelle du projet : le mécanisme posé au
 * jour 1 est enfin emprunté, sur une base qui contient déjà des données.
 */
const MIGRATIONS = [SCHEMA, SESSIONS_LECTURE];

const DB_NAME = 'lecture';
const IDB_KEY = 'db:lecture';

// ---------------------------------------------------------------------------
// Moteur navigateur — sql.js en mémoire, dumpé dans IndexedDB après chaque écriture
// ---------------------------------------------------------------------------

async function createWebEngine() {
  const initSqlJs = (await import('sql.js')).default;
  const { get, set } = await import('idb-keyval');

  // Le .wasm est servi depuis public/assets/, pas résolu par le bundler (§2.2).
  const SQL = await initSqlJs({ locateFile: () => '/assets/sql-wasm.wasm' });

  const dump = await get(IDB_KEY);
  const db = dump ? new SQL.Database(new Uint8Array(dump)) : new SQL.Database();

  /*
   * Sans dump après chaque écriture, la base navigateur disparaîtrait au
   * rechargement de la page.
   * PIÈGE MAJEUR, vérifié à l'exécution : db.export() de sql.js RECYCLE la
   * connexion SQLite. Or `PRAGMA foreign_keys` est un réglage de connexion :
   * il retombe à 0 après le premier export. Sans la ligne ci-dessous, les
   * clés étrangères sont actives à l'ouverture puis silencieusement mortes
   * dès la deuxième écriture — et aucune cascade de §6 ne se déclenche plus.
   * Aucune erreur, aucun message : juste des lignes orphelines.
   */
  const sauver = async () => {
    const octets = db.export();
    db.exec('PRAGMA foreign_keys = ON;');
    await set(IDB_KEY, octets);
  };

  const enObjets = (res) => {
    if (!res || res.length === 0) return [];
    const { columns, values } = res[0];
    return values.map((row) => {
      const o = {};
      columns.forEach((c, i) => { o[c] = row[i]; });
      return o;
    });
  };

  return {
    plateforme: 'web',
    /*
     * exec passe par db.exec() et NON par db.run(), qui semblerait pourtant
     * l'équivalent. Vérifié à l'exécution : `PRAGMA foreign_keys = ON` lancé
     * par db.run() ne prend PAS — la lecture suivante rend 0 — alors qu'il
     * prend par db.exec(). Les cascades de suppression (§6) seraient donc
     * restées inactives au navigateur, silencieusement.
     */
    async exec(sql) { db.exec(sql); },
    async query(sql, params = []) { return enObjets(db.exec(sql, params)); },
    async run(sql, params = []) { db.run(sql, params); await sauver(); },
    async runMany(items) {
      db.run('BEGIN TRANSACTION;');
      try {
        for (const it of items) db.run(it.sql, it.params || []);
        db.run('COMMIT;');
      } catch (e) {
        db.run('ROLLBACK;');
        throw e;
      }
      await sauver();
    },
    async persist() { await sauver(); },
  };
}

// ---------------------------------------------------------------------------
// Moteur Android — SQLite natif
// ---------------------------------------------------------------------------

async function createNativeEngine() {
  const { CapacitorSQLite, SQLiteConnection } = await import('@capacitor-community/sqlite');
  const sqlite = new SQLiteConnection(CapacitorSQLite);

  /*
   * REPRISE DE CONNEXION — corrige « CreateConnection: Connection lecture
   * already exists », constate sur telephone apres que l'application se soit
   * arretee toute seule.
   *
   * Une connexion SQLite vit du cote NATIF et survit au rechargement du
   * WebView ; le pool JavaScript, lui, repart vide. `isConnection()` interroge
   * ce pool JavaScript : apres un rechargement il repond « non » alors que la
   * connexion existe toujours cote natif — et `createConnection` echoue.
   * C'est exactement le cas quand Android relance l'application apres l'avoir
   * mise en veille ou tuee pour recuperer de la memoire.
   *
   * `checkConnectionsConsistency()` est la methode prevue par le plugin pour
   * resynchroniser les deux : elle est appelee AVANT toute interrogation.
   * Et parce qu'une course reste possible entre les deux appels, la creation
   * est doublee d'un rattrapage : si elle echoue parce que la connexion
   * existe, on la reprend au lieu d'abandonner.
   */
  try {
    await sqlite.checkConnectionsConsistency();
  } catch { /* rien a reconcilier au tout premier lancement */ }

  let db;
  const dejaLa = (await sqlite.isConnection(DB_NAME, false)).result;
  if (dejaLa) {
    db = await sqlite.retrieveConnection(DB_NAME, false);
  } else {
    try {
      db = await sqlite.createConnection(DB_NAME, false, 'no-encryption', 1, false);
    } catch (e) {
      if (!/already exists/i.test(String(e && e.message))) throw e;
      db = await sqlite.retrieveConnection(DB_NAME, false);
    }
  }

  if (!(await db.isDBOpen()).result) await db.open();

  return {
    plateforme: 'android',
    async exec(sql) { await db.execute(sql); },
    async query(sql, params = []) { return (await db.query(sql, params)).values || []; },
    async run(sql, params = []) { await db.run(sql, params); },
    async runMany(items) {
      // executeSet(..., true) = une seule transaction. Sans ce `true`, la
      // restauration du projet séries prenait plus d'une minute au lieu de 6 s.
      const lot = items.map((it) => ({ statement: it.sql, values: it.params || [] }));
      await db.executeSet(lot, true);
    },
    async persist() { /* natif : rien à faire, l'écriture est déjà sur le disque */ },
  };
}

// ---------------------------------------------------------------------------
// Porte unique
// ---------------------------------------------------------------------------

let moteur = null;
let pretPromise = null;

async function appliquerMigrations() {
  const lignes = await moteur.query('PRAGMA user_version;');
  const version = lignes.length > 0 ? Number(lignes[0].user_version) || 0 : 0;
  if (version >= MIGRATIONS.length) return { de: version, a: version };

  for (let v = version; v < MIGRATIONS.length; v += 1) {
    await moteur.exec(MIGRATIONS[v]);
  }
  // PRAGMA n'accepte pas de paramètre lié : la valeur est interpolée, mais elle
  // vient d'une longueur de tableau, jamais d'une saisie.
  await moteur.exec(`PRAGMA user_version = ${MIGRATIONS.length};`);
  await moteur.persist();
  return { de: version, a: MIGRATIONS.length };
}

async function ouvrir() {
  moteur = Capacitor.getPlatform() === 'web'
    ? await createWebEngine()
    : await createNativeEngine();

  // À reposer à chaque ouverture : ce PRAGMA n'est pas persistant.
  await moteur.exec('PRAGMA foreign_keys = ON;');

  const migration = await appliquerMigrations();
  const profil = await ensureDefaultProfile();
  return { plateforme: moteur.plateforme, migration, profil };
}

/*
 * Ouvre la base une fois pour toutes. Idempotent — mais un ECHEC ne doit pas
 * etre definitif, et il l'etait : la promesse rejetee restait memorisee, donc
 * toutes les operations suivantes echouaient sur la meme erreur jusqu'au
 * redemarrage de l'application. C'est ce qui faisait revenir le bandeau
 * « Impossible d'ajouter ce livre » a chaque tentative une fois la premiere
 * echouee, meme quand la cause etait passagere.
 * On oublie donc une tentative ratee : la suivante repart proprement.
 */
export function initDb() {
  if (!pretPromise) {
    pretPromise = ouvrir().catch((e) => {
      pretPromise = null;
      throw e;
    });
  }
  return pretPromise;
}

export async function query(sql, params = []) {
  await initDb();
  return moteur.query(sql, params);
}

export async function run(sql, params = []) {
  await initDb();
  return moteur.run(sql, params);
}

/** Écrit un lot en UNE transaction. Toute écriture multi-lignes passe par ici. */
export async function runMany(items) {
  await initDb();
  return moteur.runMany(items);
}

/*
 * Un profil doit toujours exister : tout le modèle a profile_id dans sa clé
 * primaire (§3.3), donc aucune écriture n'est possible sans lui.
 * crypto.randomUUID() est portable d'un appareil à l'autre — c'est ce qui rend
 * la restauration possible (§3.3).
 */
async function ensureDefaultProfile() {
  const rows = await moteur.query('SELECT id, name FROM profiles ORDER BY created_at LIMIT 1;');
  if (rows.length > 0) return rows[0];

  const profil = { id: crypto.randomUUID(), name: 'Moi' };
  await moteur.run('INSERT INTO profiles (id, name) VALUES (?, ?);', [profil.id, profil.name]);
  return profil;
}
