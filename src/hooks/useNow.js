import { useEffect, useState } from 'react';

// Marca de tiempo que se refresca cada `intervalMs`. Mantenerlo en el
// componente que lo necesita evita re-renderizar toda la app por segundo.
export function useNow(intervalMs = 1000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}
