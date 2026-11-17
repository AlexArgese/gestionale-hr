import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
// stili globali PRIMA dei componenti: così i CSS module dei singoli
// componenti possono personalizzare le classi globali (.btn, .modal, .card…)
import './styles/globals.css';
import App from './App';
import reportWebVitals from './reportWebVitals';

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

// If you want to start measuring performance in your app, pass a function
// to log results (for example: reportWebVitals(console.log))
// or send to an analytics endpoint. Learn more: https://bit.ly/CRA-vitals
reportWebVitals();
