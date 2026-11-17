import React, { createContext, useCallback, useContext, useRef, useState } from 'react';
import { FiAlertTriangle, FiHelpCircle } from 'react-icons/fi';
import styles from './ui.module.css';

const ConfirmContext = createContext(null);

export function ConfirmProvider({ children }) {
  const [dialog, setDialog] = useState(null);
  const resolver = useRef(null);

  const confirm = useCallback((options = {}) => {
    const {
      title = 'Conferma',
      message = '',
      danger = false,
      confirmLabel = 'Conferma',
      cancelLabel = 'Annulla',
    } = typeof options === 'string' ? { message: options } : options;

    return new Promise((resolve) => {
      resolver.current = resolve;
      setDialog({ title, message, danger, confirmLabel, cancelLabel });
    });
  }, []);

  const close = (result) => {
    setDialog(null);
    if (resolver.current) {
      resolver.current(result);
      resolver.current = null;
    }
  };

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      {dialog && (
        <div className={`modal-overlay ${styles.confirmOverlay}`} onClick={() => close(false)}>
          <div
            className={`modal ${styles.confirm}`}
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="confirm-title"
            onClick={(e) => e.stopPropagation()}
            onKeyDown={(e) => { if (e.key === 'Escape') close(false); }}
          >
            <div className={styles.confirmBody}>
              <span className={`${styles.confirmIcon} ${dialog.danger ? styles.confirmIconDanger : ''}`}>
                {dialog.danger ? <FiAlertTriangle size={20} /> : <FiHelpCircle size={20} />}
              </span>
              <div className={styles.confirmText}>
                <h3 id="confirm-title" className="modal-title">{dialog.title}</h3>
                {dialog.message && <p className={styles.confirmMessage}>{dialog.message}</p>}
              </div>
            </div>
            <div className={styles.confirmFoot}>
              <button
                className="btn btn-outline"
                onClick={() => close(false)}
                autoFocus={dialog.danger}
              >
                {dialog.cancelLabel}
              </button>
              <button
                className={`btn ${dialog.danger ? 'btn-danger' : 'btn-primary'}`}
                onClick={() => close(true)}
                autoFocus={!dialog.danger}
              >
                {dialog.confirmLabel}
              </button>
            </div>
          </div>
        </div>
      )}
    </ConfirmContext.Provider>
  );
}

export function useConfirm() {
  const ctx = useContext(ConfirmContext);
  if (!ctx) throw new Error('useConfirm deve essere usato dentro <ConfirmProvider>');
  return ctx;
}
