import React from "react";
import { FiSearch } from "react-icons/fi";
import styles from "./SedeDipendentiPicker.module.css";

/**
 * Elenco dei dipendenti da associare a una sede, con l'opzione
 * "Team leader" per quelli selezionati. Usato da Nuova sede e Dettaglio sede.
 */
export default function SedeDipendentiPicker({
  utenti,
  filter,
  onFilterChange,
  selectedIds,
  onToggle,
  teamLeaderIds,
  onToggleTeamLeader,
}) {
  const selezionati = selectedIds.length;

  return (
    <section className="card">
      <div className="card-head">
        <div>
          <h2 className="card-title">Dipendenti della sede</h2>
          <p className="card-desc">
            Seleziona chi lavora in questa sede e indica gli eventuali team leader.
          </p>
        </div>
        <span className="badge">{selezionati} selezionati</span>
      </div>

      <div className={styles.tools}>
        <div className="search">
          <FiSearch size={15} />
          <input
            className="input"
            placeholder="Filtra per nome, cognome o email"
            value={filter}
            onChange={(e) => onFilterChange(e.target.value)}
          />
        </div>
      </div>

      <div className={styles.listWrap}>
        <table className="data-table">
          <thead>
            <tr>
              <th className={styles.checkCol} />
              <th>Dipendente</th>
              <th>Email</th>
              <th className={styles.tlCol}>Team leader</th>
            </tr>
          </thead>
          <tbody>
            {utenti.length === 0 && (
              <tr>
                <td colSpan={4}><div className="empty-state">Nessun dipendente trovato.</div></td>
              </tr>
            )}
            {utenti.map((u) => {
              const uid = u.id;
              const nomeCompleto = `${u.cognome || ""} ${u.nome || ""}`.trim() || "—";
              const checked = selectedIds.includes(uid);
              const isTL = teamLeaderIds.has(uid);
              return (
                <tr
                  key={uid}
                  className={`${styles.row} ${checked ? styles.rowOn : ""}`}
                  onClick={() => onToggle(uid)}
                >
                  <td className={styles.checkCol}>
                    <input
                      type="checkbox"
                      className={styles.check}
                      checked={checked}
                      onChange={() => onToggle(uid)}
                      onClick={(e) => e.stopPropagation()}
                      aria-label={`Associa ${nomeCompleto} alla sede`}
                    />
                  </td>
                  <td className="cell-strong">{nomeCompleto}</td>
                  <td className={styles.muted}>{u.email || "—"}</td>
                  <td className={styles.tlCol} onClick={(e) => e.stopPropagation()}>
                    {checked && (
                      <label className={`${styles.tlToggle} ${isTL ? styles.tlOn : ""}`}>
                        <input
                          type="checkbox"
                          checked={isTL}
                          onChange={() => onToggleTeamLeader(uid)}
                        />
                        {isTL ? "Team leader" : "Imposta"}
                      </label>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
