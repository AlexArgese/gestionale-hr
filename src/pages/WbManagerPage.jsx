// frontend/src/pages/WbManagerPage.jsx
import React from 'react';
import WbManagerPanel from '../wb/WbManagerPanel';
import { API_BASE } from '../api';

export default function WbManagerPage() {
  return <WbManagerPanel apiBase={API_BASE} />;
}
