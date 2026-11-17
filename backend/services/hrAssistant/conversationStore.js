// backend/services/hrAssistant/conversationStore.js
//
// Persistenza delle conversazioni dell'assistente HR: una conversazione per
// sessione di chat, con i suoi messaggi. Il server è la fonte di verità della
// cronologia (il client passa solo l'id della conversazione, non più l'intero
// storico) — più semplice e più robusto contro manomissioni lato client.
const pool = require('../../db');
const { ensureSchema } = require('./schema');

const MAX_TITOLO = 60;

function titoloDa(domanda) {
  const pulito = domanda.trim().replace(/\s+/g, ' ');
  return pulito.length > MAX_TITOLO ? `${pulito.slice(0, MAX_TITOLO - 1)}…` : pulito;
}

async function listaConversazioni(utenteId) {
  await ensureSchema();
  const { rows } = await pool.query(
    `SELECT id, titolo, aggiornata_il
       FROM hr_assistant_conversazioni
      WHERE utente_id IS NOT DISTINCT FROM $1
      ORDER BY aggiornata_il DESC
      LIMIT 100`,
    [utenteId ?? null]
  );
  return rows;
}

// Con `conScambio` i messaggi includono anche lo scambio con i tool: serve
// solo per ricostruire il contesto del modello, non va mandato al browser.
async function getConversazione(id, utenteId, { conScambio = false } = {}) {
  await ensureSchema();
  const { rows: convRows } = await pool.query(
    `SELECT id, titolo FROM hr_assistant_conversazioni WHERE id = $1 AND utente_id IS NOT DISTINCT FROM $2`,
    [id, utenteId ?? null]
  );
  if (!convRows.length) return null;

  const { rows: msgRows } = await pool.query(
    `SELECT id, ruolo, testo, dati, feedback${conScambio ? ', scambio, testo_modello, persone' : ''}
       FROM hr_assistant_messaggi
      WHERE conversazione_id = $1
      ORDER BY id ASC`,
    [id]
  );
  return { id: convRows[0].id, titolo: convRows[0].titolo, messaggi: msgRows };
}

// Salva domanda e risposta di un turno in un'unica transazione (e crea la
// conversazione se è la prima domanda): se qualcosa fallisce prima della fine
// non restano domande "orfane" senza risposta nella cronologia.
async function salvaTurno({ conversazioneId, utenteId, domanda, risposta, testoModello, persone, dati, scambio, toolLog }) {
  await ensureSchema();
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    let convId = conversazioneId;
    if (convId == null) {
      const { rows } = await client.query(
        `INSERT INTO hr_assistant_conversazioni (utente_id, titolo) VALUES ($1, $2) RETURNING id`,
        [utenteId ?? null, titoloDa(domanda)]
      );
      convId = rows[0].id;
    } else {
      await client.query(`UPDATE hr_assistant_conversazioni SET aggiornata_il = NOW() WHERE id = $1`, [convId]);
    }
    await client.query(
      `INSERT INTO hr_assistant_messaggi (conversazione_id, ruolo, testo) VALUES ($1, 'user', $2)`,
      [convId, domanda]
    );
    const { rows: msg } = await client.query(
      `INSERT INTO hr_assistant_messaggi
         (conversazione_id, ruolo, testo, testo_modello, persone, dati, scambio, tool_log)
       VALUES ($1, 'assistant', $2, $3, $4, $5, $6, $7) RETURNING id`,
      [
        convId,
        risposta,
        testoModello ?? null,
        persone && Object.keys(persone).length ? JSON.stringify(persone) : null,
        dati ? JSON.stringify(dati) : null,
        scambio?.length ? JSON.stringify(scambio) : null,
        toolLog?.length ? JSON.stringify(toolLog) : null,
      ]
    );
    await client.query('COMMIT');
    return { conversazioneId: convId, messaggioId: msg[0].id };
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

// valore: 1 (utile), -1 (non utile), 0 (rimuove il feedback). Solo sulle
// risposte dell'assistente di una conversazione dell'utente stesso.
async function impostaFeedback(messaggioId, utenteId, valore) {
  await ensureSchema();
  const { rowCount } = await pool.query(
    `UPDATE hr_assistant_messaggi m
        SET feedback = $3, feedback_il = CASE WHEN $3::smallint IS NULL THEN NULL ELSE NOW() END
       FROM hr_assistant_conversazioni c
      WHERE m.id = $1
        AND m.ruolo = 'assistant'
        AND c.id = m.conversazione_id
        AND c.utente_id IS NOT DISTINCT FROM $2`,
    [messaggioId, utenteId ?? null, valore === 0 ? null : valore]
  );
  return rowCount > 0;
}

// Risposte che hanno ricevuto un feedback, di tutti gli admin, per la pagina
// di revisione: domanda, risposta, tool chiamati, autore. `valore` 1 o -1;
// `daRivedere` = solo quelle non ancora segnate come esaminate.
async function listaFeedback({ valore = -1, daRivedere = true, limite = 100 } = {}) {
  await ensureSchema();
  const { rows } = await pool.query(
    `SELECT m.id, m.conversazione_id, m.testo AS risposta, m.dati, m.tool_log, m.feedback,
            m.feedback_il, m.revisionato_il, m.creato_il,
            (SELECT q.testo FROM hr_assistant_messaggi q
              WHERE q.conversazione_id = m.conversazione_id AND q.ruolo = 'user' AND q.id < m.id
              ORDER BY q.id DESC LIMIT 1) AS domanda,
            NULLIF(concat_ws(' ', u.nome, u.cognome), '') AS autore
       FROM hr_assistant_messaggi m
       JOIN hr_assistant_conversazioni c ON c.id = m.conversazione_id
       LEFT JOIN utenti u ON u.id = c.utente_id
      WHERE m.feedback = $1
        AND ($2::boolean = false OR m.revisionato_il IS NULL)
      ORDER BY m.feedback_il DESC NULLS LAST
      LIMIT $3`,
    [valore, daRivedere, limite]
  );
  return rows;
}

async function contaDaRivedere() {
  await ensureSchema();
  const { rows } = await pool.query(
    `SELECT COUNT(*)::int AS n FROM hr_assistant_messaggi WHERE feedback = -1 AND revisionato_il IS NULL`
  );
  return rows[0].n;
}

async function segnaRevisionato(messaggioId, revisionato) {
  await ensureSchema();
  const { rowCount } = await pool.query(
    `UPDATE hr_assistant_messaggi
        SET revisionato_il = CASE WHEN $2 THEN NOW() ELSE NULL END
      WHERE id = $1 AND feedback IS NOT NULL`,
    [messaggioId, revisionato]
  );
  return rowCount > 0;
}

// Cancella le conversazioni non aggiornate da più di `giorni` giorni (i
// messaggi vanno via in cascata). Ritorna quante ne ha cancellate.
async function eliminaConversazioniVecchie(giorni) {
  await ensureSchema();
  const { rowCount } = await pool.query(
    `DELETE FROM hr_assistant_conversazioni WHERE aggiornata_il < NOW() - make_interval(days => $1::int)`,
    [giorni]
  );
  return rowCount;
}

async function eliminaConversazione(id, utenteId) {
  await ensureSchema();
  const { rowCount } = await pool.query(
    `DELETE FROM hr_assistant_conversazioni WHERE id = $1 AND utente_id IS NOT DISTINCT FROM $2`,
    [id, utenteId ?? null]
  );
  return rowCount > 0;
}

module.exports = {
  listaConversazioni,
  getConversazione,
  salvaTurno,
  impostaFeedback,
  eliminaConversazione,
  eliminaConversazioniVecchie,
  listaFeedback,
  contaDaRivedere,
  segnaRevisionato,
};
