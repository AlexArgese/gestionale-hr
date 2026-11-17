// fallbackName default "" (NON "Documento"): Split/Merge chiamano questa funzione
// con 2 argomenti e nessun fallback — un default diverso cambierebbe silenziosamente
// il loro output nel caso limite "utente non trovato" (es. "CUD" -> "Documento CUD").
// DocumentiCaricaDirettoCF passa sempre il 3° argomento esplicitamente.
export function buildDefaultFileName(u, tipoDocumento, fallbackName = "") {
  const fullName = [u?.cognome, u?.nome].filter(Boolean).join(" ").trim();
  const tipo = String(tipoDocumento || "").trim();
  return [fullName || fallbackName, tipo].filter(Boolean).join(" ").trim();
}
