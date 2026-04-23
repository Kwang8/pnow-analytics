// ==UserScript==
// @name         PokerNow Sync to Poker Tracker
// @namespace    https://vicky-poker-tracker.vercel.app/
// @version      0.1.0
// @description  Sync the current PokerNow game result into your poker tracker app.
// @match        https://www.pokernow.com/games/*
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_registerMenuCommand
// @grant        GM_xmlhttpRequest
// @connect      *
// ==/UserScript==

(function () {
  'use strict';

  const DEFAULT_APP_URL = 'https://vicky-poker-tracker.vercel.app';
  const STORAGE_KEYS = {
    appUrl: 'pokernow-sync-app-url',
    playerName: 'pokernow-sync-player-name',
    importKey: 'pokernow-sync-import-key',
  };

  let buttonEl = null;
  let statusEl = null;
  let syncing = false;

  function normalizeUrl(url) {
    return String(url ?? '').trim().replace(/\/+$/, '');
  }

  function todayLocal() {
    const now = new Date();
    const offsetMs = now.getTimezoneOffset() * 60 * 1000;
    return new Date(now.getTime() - offsetMs).toISOString().slice(0, 10);
  }

  function getConfig() {
    return {
      appUrl: normalizeUrl(GM_getValue(STORAGE_KEYS.appUrl, DEFAULT_APP_URL)),
      playerName: String(GM_getValue(STORAGE_KEYS.playerName, '')).trim(),
      importKey: String(GM_getValue(STORAGE_KEYS.importKey, '')).trim(),
    };
  }

  function setConfigValue(key, value) {
    GM_setValue(key, String(value ?? '').trim());
  }

  function promptForValue(label, currentValue, options = {}) {
    const nextValue = window.prompt(label, currentValue);
    if (nextValue === null) {
      return null;
    }

    const trimmed = String(nextValue).trim();
    if (!trimmed && !options.allowEmpty) {
      window.alert(`${options.name || 'Value'} cannot be empty.`);
      return null;
    }

    return trimmed;
  }

  function configureAppUrl() {
    const { appUrl } = getConfig();
    const nextValue = promptForValue(
      'Poker tracker app URL:',
      appUrl || DEFAULT_APP_URL,
      { name: 'App URL' }
    );
    if (nextValue === null) {
      return;
    }

    setConfigValue(STORAGE_KEYS.appUrl, normalizeUrl(nextValue));
    refreshIdleState();
  }

  function configurePlayerName() {
    const { playerName } = getConfig();
    const nextValue = promptForValue(
      'Your PokerNow player name:',
      playerName,
      { name: 'Player name' }
    );
    if (nextValue === null) {
      return;
    }

    setConfigValue(STORAGE_KEYS.playerName, nextValue);
    refreshIdleState();
  }

  function configureImportKey() {
    const { importKey } = getConfig();
    const nextValue = window.prompt(
      'Optional import key for your app. Leave blank if your import route does not require one.',
      importKey
    );
    if (nextValue === null) {
      return;
    }

    setConfigValue(STORAGE_KEYS.importKey, nextValue);
    refreshIdleState();
  }

  function ensureRequiredConfig() {
    const config = getConfig();

    if (!config.appUrl) {
      configureAppUrl();
    }

    const afterAppUrl = getConfig();
    if (!afterAppUrl.playerName) {
      configurePlayerName();
    }

    const finalConfig = getConfig();
    if (!finalConfig.appUrl || !finalConfig.playerName) {
      setStatus('Configure app URL and player name from the Tampermonkey menu.', 'error');
      return null;
    }

    return finalConfig;
  }

  function requestJson(method, url, headers, body) {
    return new Promise((resolve, reject) => {
      GM_xmlhttpRequest({
        method,
        url,
        headers,
        data: body,
        timeout: 20000,
        onload: (response) => {
          let json = null;
          try {
            json = response.responseText ? JSON.parse(response.responseText) : null;
          } catch {
            json = null;
          }

          resolve({
            status: response.status,
            data: json,
            text: response.responseText,
          });
        },
        onerror: () => reject(new Error('Network error')),
        ontimeout: () => reject(new Error('Request timed out')),
      });
    });
  }

  function looksLikePokerNowExport(value) {
    return Boolean(
      value &&
      typeof value === 'object' &&
      typeof value.generatedAt === 'string' &&
      typeof value.playerId === 'string' &&
      typeof value.gameId === 'string' &&
      Array.isArray(value.hands)
    );
  }

  function cloneJson(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function tryWindowPaths(paths) {
    for (const path of paths) {
      let current = window;
      let ok = true;
      for (const key of path) {
        if (!current || typeof current !== 'object' || !(key in current)) {
          ok = false;
          break;
        }
        current = current[key];
      }
      if (ok && looksLikePokerNowExport(current)) {
        return cloneJson(current);
      }
    }
    return null;
  }

  function findExportRecursively(root, options = {}) {
    const visited = options.visited || new WeakSet();
    const maxNodes = options.maxNodes || 8000;
    const queue = [root];
    let scanned = 0;

    while (queue.length > 0 && scanned < maxNodes) {
      const current = queue.shift();
      scanned += 1;

      if (!current || typeof current !== 'object') {
        continue;
      }

      if (looksLikePokerNowExport(current)) {
        return cloneJson(current);
      }

      if (visited.has(current)) {
        continue;
      }
      visited.add(current);

      const values = Array.isArray(current)
        ? current
        : Object.keys(current)
          .slice(0, 80)
          .map((key) => {
            try {
              return current[key];
            } catch {
              return undefined;
            }
          });

      for (const value of values) {
        if (value && typeof value === 'object') {
          queue.push(value);
        }
      }
    }

    return null;
  }

  function resolveExportData() {
    const directCandidate = tryWindowPaths([
      ['__PN_EXPORT__'],
      ['__NEXT_DATA__', 'props', 'pageProps', 'gameExport'],
      ['__INITIAL_STATE__', 'gameExport'],
      ['store', 'state', 'gameExport'],
      ['store', 'getState'],
    ]);
    if (directCandidate) {
      return directCandidate;
    }

    const stateGetter = window.store && typeof window.store.getState === 'function'
      ? window.store.getState()
      : null;
    if (looksLikePokerNowExport(stateGetter)) {
      return cloneJson(stateGetter);
    }

    if (stateGetter && typeof stateGetter === 'object') {
      const nestedState = findExportRecursively(stateGetter);
      if (nestedState) {
        return nestedState;
      }
    }

    const windowCandidate = findExportRecursively(window, { maxNodes: 12000 });
    if (windowCandidate) {
      return windowCandidate;
    }

    return null;
  }

  function createStyles() {
    const style = document.createElement('style');
    style.textContent = `
      #pn-sync-root {
        position: fixed;
        right: 16px;
        bottom: 16px;
        z-index: 999999;
        display: flex;
        flex-direction: column;
        gap: 8px;
        width: min(320px, calc(100vw - 32px));
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      }

      #pn-sync-button {
        width: 100%;
        border: 0;
        border-radius: 10px;
        padding: 12px 14px;
        background: #111827;
        color: #f9fafb;
        font-size: 14px;
        font-weight: 700;
        box-shadow: 0 10px 30px rgba(0, 0, 0, 0.28);
        cursor: pointer;
      }

      #pn-sync-button:hover:not(:disabled) {
        background: #1f2937;
      }

      #pn-sync-button:disabled {
        opacity: 0.7;
        cursor: default;
      }

      #pn-sync-status {
        border-radius: 10px;
        padding: 10px 12px;
        background: rgba(17, 24, 39, 0.94);
        color: #d1d5db;
        font-size: 12px;
        line-height: 1.4;
        box-shadow: 0 10px 30px rgba(0, 0, 0, 0.22);
      }

      #pn-sync-status[data-kind="success"] {
        background: rgba(6, 95, 70, 0.94);
        color: #ecfdf5;
      }

      #pn-sync-status[data-kind="info"] {
        background: rgba(30, 64, 175, 0.94);
        color: #eff6ff;
      }

      #pn-sync-status[data-kind="error"] {
        background: rgba(127, 29, 29, 0.94);
        color: #fef2f2;
      }
    `;
    document.head.appendChild(style);
  }

  function setStatus(message, kind = 'idle') {
    if (!statusEl) {
      return;
    }

    statusEl.textContent = message;
    statusEl.dataset.kind = kind;
  }

  function setButtonState(label, disabled) {
    if (!buttonEl) {
      return;
    }

    buttonEl.textContent = label;
    buttonEl.disabled = disabled;
  }

  function refreshIdleState() {
    const { appUrl, playerName } = getConfig();
    if (!appUrl || !playerName) {
      setButtonState('Configure Sync', false);
      setStatus('Set your app URL and PokerNow name from the Tampermonkey menu.', 'info');
      return;
    }

    setButtonState('Sync to Tracker', false);
    setStatus(`Ready to sync as ${playerName}.`, 'info');
  }

  async function syncCurrentGame() {
    if (syncing) {
      return;
    }

    const config = ensureRequiredConfig();
    if (!config) {
      return;
    }

    syncing = true;
    setButtonState('Syncing...', true);
    setStatus('Looking for PokerNow export data on this page...', 'info');

    const headers = {
      'Content-Type': 'application/json',
    };
    if (config.importKey) {
      headers['x-import-key'] = config.importKey;
    }

    try {
      const exportData = resolveExportData();
      if (!exportData) {
        throw new Error('Could not find the PokerNow export data in the page yet. Try reopening the table or waiting for the game to finish loading.');
      }

      setStatus(`Found ${exportData.hands.length} hands. Uploading to your tracker...`, 'info');

      const response = await requestJson(
        'POST',
        `${config.appUrl}/api/pokernow/import`,
        headers,
        JSON.stringify({
          playerName: config.playerName,
          date: todayLocal(),
          url: window.location.href,
          data: exportData,
        })
      );

      const data = response.data || {};
      if (response.status >= 200 && response.status < 300) {
        if (data.created) {
          setStatus(`Imported ${data.player?.name || config.playerName} successfully.`, 'success');
        } else {
          setStatus('This game was already imported.', 'info');
        }
        setButtonState('Synced', false);
        window.setTimeout(refreshIdleState, 2500);
        return;
      }

      if (Array.isArray(data.players) && data.players.length > 0) {
        const available = data.players.map((player) => player.name).join(', ');
        setStatus(`Name mismatch. Available players: ${available}`, 'error');
      } else {
        setStatus(data.error || `Sync failed with status ${response.status}.`, 'error');
      }
      setButtonState('Sync to Tracker', false);
    } catch (error) {
      setStatus(error.message || 'Sync failed.', 'error');
      setButtonState('Sync to Tracker', false);
    } finally {
      syncing = false;
    }
  }

  function installUi() {
    if (document.getElementById('pn-sync-root')) {
      return;
    }

    createStyles();

    const root = document.createElement('div');
    root.id = 'pn-sync-root';

    buttonEl = document.createElement('button');
    buttonEl.id = 'pn-sync-button';
    buttonEl.type = 'button';
    buttonEl.textContent = 'Sync to Tracker';
    buttonEl.addEventListener('click', syncCurrentGame);

    statusEl = document.createElement('div');
    statusEl.id = 'pn-sync-status';

    root.appendChild(buttonEl);
    root.appendChild(statusEl);
    document.body.appendChild(root);

    refreshIdleState();
  }

  function registerMenuCommands() {
    GM_registerMenuCommand('Set tracker app URL', configureAppUrl);
    GM_registerMenuCommand('Set PokerNow player name', configurePlayerName);
    GM_registerMenuCommand('Set optional import key', configureImportKey);
    GM_registerMenuCommand('Sync current game now', syncCurrentGame);
  }

  function boot() {
    registerMenuCommands();

    if (document.body) {
      installUi();
      return;
    }

    const intervalId = window.setInterval(() => {
      if (!document.body) {
        return;
      }

      window.clearInterval(intervalId);
      installUi();
    }, 250);
  }

  boot();
})();
