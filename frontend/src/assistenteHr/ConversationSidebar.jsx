import React from "react";
import styles from "./AssistenteHr.module.css";
import { IoAddOutline, IoTrashOutline } from "react-icons/io5";

function formatData(iso) {
  const d = new Date(iso);
  const oggi = new Date();
  const ieri = new Date();
  ieri.setDate(oggi.getDate() - 1);
  const stessoGiorno = (a, b) => a.toDateString() === b.toDateString();

  if (stessoGiorno(d, oggi)) return d.toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" });
  if (stessoGiorno(d, ieri)) return "Ieri";
  return d.toLocaleDateString("it-IT", { day: "2-digit", month: "2-digit" });
}

export default function ConversationSidebar({ conversazioni, conversazioneAttivaId, onNuova, onApri, onElimina }) {
  return (
    <div className={styles.sidebar}>
      <button className={styles.sidebarNuova} onClick={onNuova}>
        <IoAddOutline size={18} /> Nuova conversazione
      </button>

      <div className={styles.sidebarLista}>
        {conversazioni.length === 0 ? (
          <div className={styles.sidebarVuota}>Nessuna conversazione salvata</div>
        ) : (
          conversazioni.map((c) => (
            <div
              key={c.id}
              className={`${styles.sidebarItem} ${c.id === conversazioneAttivaId ? styles.sidebarItemAttiva : ""}`}
              onClick={() => onApri(c.id)}
            >
              <div className={styles.sidebarItemTesto}>
                <div className={styles.sidebarItemTitolo}>{c.titolo}</div>
                <div className={styles.sidebarItemData}>{formatData(c.aggiornata_il)}</div>
              </div>
              <button
                className={styles.sidebarItemElimina}
                title="Elimina conversazione"
                onClick={(e) => {
                  e.stopPropagation();
                  onElimina(c.id);
                }}
              >
                <IoTrashOutline size={15} />
              </button>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
