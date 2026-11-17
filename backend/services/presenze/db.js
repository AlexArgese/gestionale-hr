/**
 * backend/services/presenze/db.js
 * Accesso al database e job periodici usati dalle rotte di
 * /backend/routes/presenze.js.
 */
const pool = require('../../db');
const { localDateStr, getMinutiContratto, randomizzaUscitaCappata, addMinutes } = require('./helpers');

// Calcola l'ora di uscita cappata tenendo conto dei minuti già lavorati
// negli altri turni chiusi della stessa giornata
async function calcolaOraUscitaCappata(utente_id, turno, minutiPrevisti) {
  const dataStr = localDateStr(new Date(turno.ora_entrata));

  const altriTurni = await pool.query(
    `SELECT ora_entrata, ora_uscita FROM presenze
     WHERE utente_id = $1 AND data = $2 AND ora_uscita IS NOT NULL AND id != $3`,
    [utente_id, dataStr, turno.id]
  );

  const minutiGiaLavorati = altriTurni.rows.reduce((acc, r) => {
    return acc + (new Date(r.ora_uscita) - new Date(r.ora_entrata)) / 60000;
  }, 0);

  const minutiRimasti = minutiPrevisti - minutiGiaLavorati;
  if (minutiRimasti <= 0) return new Date(turno.ora_entrata); // contratto già esaurito

  return addMinutes(new Date(turno.ora_entrata), minutiRimasti);
}

// Auto-chiude turni rimasti aperti dopo 24h con cappatura corretta
async function autoCloseStaleShifts() {
  try {
    const openShifts = await pool.query(
      `SELECT p.id, p.utente_id, p.ora_entrata, u.tipo_contratto
         FROM presenze p
         JOIN utenti u ON u.id = p.utente_id
        WHERE p.ora_uscita IS NULL
          AND p.ora_entrata < NOW() - INTERVAL '24 hours'`
    );
    for (const row of openShifts.rows) {
      const minutiPrevisti = getMinutiContratto(row.tipo_contratto);
      if (minutiPrevisti === 0) continue;
      const cappata = await calcolaOraUscitaCappata(row.utente_id, row, minutiPrevisti);
      if (!cappata) continue;
      const oraUscita = randomizzaUscitaCappata(cappata, new Date(row.ora_entrata));
      await pool.query(
        `UPDATE presenze SET ora_uscita = $1, note = 'Uscita dimenticata. Chiusa automaticamente dopo 24h' WHERE id = $2`,
        [oraUscita, row.id]
      );
    }
    if (openShifts.rows.length > 0) {
      console.log(`[auto-close] Chiusi ${openShifts.rows.length} turni aperti da >24h`);
    }
  } catch (e) {
    console.error('[auto-close] Errore chiusura turni', e);
  }
}

module.exports = {
  calcolaOraUscitaCappata,
  autoCloseStaleShifts,
};
