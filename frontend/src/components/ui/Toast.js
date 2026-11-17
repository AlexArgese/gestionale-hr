import React, { createContext, useCallback, useContext, useRef, useState } from 'react';
import { FiCheckCircle, FiAlertCircle, FiX } from 'react-icons/fi';
import styles from './ui.module.css';

const ToastContext = createContext(null);

let idCounter = 0;

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const timers = useRef({});

  const remove = useCallback((id) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
    clearTimeout(timers.current[id]);
    delete timers.current[id];
  }, []);

  const push = useCallback((type, message, duration = 4000) => {
    const id = ++idCounter;
    setToasts((prev) => [...prev, { id, type, message }]);
    timers.current[id] = setTimeout(() => remove(id), duration);
  }, [remove]);

  const api = useRef({
    success: (message, duration) => push('success', message, duration),
    error: (message, duration) => push('error', message, duration),
  }).current;

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div className={styles.toastStack}>
        {toasts.map((t) => (
          <div
            key={t.id}
            role={t.type === 'error' ? 'alert' : 'status'}
            className={`${styles.toast} ${t.type === 'error' ? styles.toastError : styles.toastSuccess}`}
          >
            <span className={styles.toastIcon}>
              {t.type === 'error' ? <FiAlertCircle size={16} /> : <FiCheckCircle size={16} />}
            </span>
            <span className={styles.toastMsg}>{t.message}</span>
            <button className={styles.toastClose} onClick={() => remove(t.id)} aria-label="Chiudi">
              <FiX size={15} />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast deve essere usato dentro <ToastProvider>');
  return ctx;
}
