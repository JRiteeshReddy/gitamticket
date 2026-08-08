import './style.css';
import { renderApp } from './ui.js';

document.addEventListener('DOMContentLoaded', () => {
  const root = document.getElementById('app');
  if (root) {
    renderApp(root);
  }
});
