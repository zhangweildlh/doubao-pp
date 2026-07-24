import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './style.css';

// P0：sidePanel 最简引导，暂不接 i18n / 主题；后续阶段接入。
ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
