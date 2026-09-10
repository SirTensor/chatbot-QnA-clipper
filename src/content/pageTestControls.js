(function() {
  if (window.top !== window || window.qaClipperPageTestControlsInitialized) return;
  window.qaClipperPageTestControlsInitialized = true;

  function message(key, fallback) {
    return chrome.i18n.getMessage(key) || fallback;
  }

  let panelHost = null;
  let supportRequest = 0;

  function refreshControls() {
    const request = ++supportRequest;
    if (panelHost) {
      panelHost.remove();
      panelHost = null;
    }
    try {
      chrome.runtime.sendMessage({ action: 'get-page-test-support' }, (support) => {
        const error = chrome.runtime.lastError;
        if (request !== supportRequest || error || !support || support.enabled !== true) return;
        renderControls(support);
      });
    } catch (error) {
      // An invalidated extension context cannot display or activate controls.
    }
  }

  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName === 'local' && Object.prototype.hasOwnProperty.call(changes, 'pageTestControlsEnabled')) {
      refreshControls();
    }
  });
  refreshControls();

  function renderControls(support) {

    const host = document.createElement('div');
    host.id = 'qa-clipper-page-test-controls';
    host.style.cssText = 'all:initial;position:fixed;right:16px;top:96px;z-index:2147483646;';
    const root = host.attachShadow({ mode: 'open' });
    const style = document.createElement('style');
    style.textContent = `
      :host { color-scheme: light; }
      * { box-sizing: border-box; }
      section { width: 224px; padding: 12px; background: #fff; color: #182536;
        border: 1px solid #cad3df; border-radius: 12px; box-shadow: 0 4px 20px #0002;
        font: 13px/1.5 system-ui, sans-serif; }
      header { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
      strong { font-size: 13px; }
      button { font: inherit; cursor: pointer; border: 1px solid #b8c5d7; border-radius: 7px;
        background: #edf3fb; color: #182536; padding: 7px 9px; }
      button:focus-visible { outline: 3px solid #386ed7; outline-offset: 2px; }
      button:disabled { opacity: .55; cursor: wait; }
      #toggle { padding: 2px 7px; background: #fff; }
      #actions { display: grid; gap: 7px; margin-top: 10px; }
      #copy { background: #245cc5; border-color: #245cc5; color: #fff; }
      #stop { background: #fff0ef; color: #a52620; }
      #status { margin: 9px 0 0; overflow-wrap: anywhere; }
      [hidden] { display: none !important; }
    `;
    const panel = document.createElement('section');
    panel.setAttribute('aria-label', 'Clipper DEV');
    const header = document.createElement('header');
    const title = document.createElement('strong');
    title.textContent = `Clipper DEV ${support.version || ''}`.trim();
    const toggle = document.createElement('button');
    toggle.id = 'toggle';
    toggle.type = 'button';
    toggle.textContent = '−';
    toggle.setAttribute('aria-label', message('pageTestToggle', 'Toggle test controls'));
    toggle.setAttribute('aria-expanded', 'true');
    header.append(title, toggle);

    const actions = document.createElement('div');
    actions.id = 'actions';
    const status = document.createElement('p');
    status.id = 'status';
    status.setAttribute('role', 'status');
    status.setAttribute('aria-live', 'polite');
    status.textContent = message('pageTestReady', 'Ready to test this tab');

    function createButton(id, label) {
      const button = document.createElement('button');
      button.id = id;
      button.type = 'button';
      button.textContent = label;
      actions.append(button);
      return button;
    }

    const copy = createButton('copy', message('pageTestCopy', 'Test copy from this tab'));
    const fullScan = createButton('full-scan', message('fullScanButton', 'Full Scan then Copy'));
    const stop = createButton('stop', message('stopScanButton', 'Stop Scan'));
    const reload = createButton('reload', message('pageTestReload', 'Reload development extension'));
    fullScan.hidden = support.fullScanAvailable !== true;
    stop.hidden = true;
    let running = false;

    function run(mode, event) {
      // Page scripts must not be able to trigger clipboard writes with synthetic clicks.
      if (!event.isTrusted || (running && mode !== 'stop')) return;
      if (mode !== 'stop') {
        running = true;
        status.dataset.result = 'running';
        copy.disabled = true;
        fullScan.disabled = true;
        reload.disabled = true;
        stop.hidden = mode !== 'full-scan';
        stop.disabled = false;
        status.textContent = mode === 'reload'
          ? message('pageTestReloading', 'Reloading development extension…')
          : mode === 'full-scan'
          ? message('statusFullScanRunning', 'Scanning conversation…')
          : message('statusExtracting', 'Extracting…');
      } else {
        stop.disabled = true;
        status.textContent = message('statusStoppingFullScan', 'Stopping scan…');
      }

      try {
        chrome.runtime.sendMessage({ action: 'page-test-extraction', mode }, (result) => {
          const error = chrome.runtime.lastError;
          if (mode === 'stop') {
            if (error || !result || !result.success) {
              stop.disabled = false;
              status.textContent = error
                ? message('pageTestReconnect', 'Reload this page after reloading the extension.')
                : (result && result.error) || message('pageTestFailed', 'Extraction did not complete.');
            }
            return;
          }
          running = false;
          copy.disabled = false;
          fullScan.disabled = false;
          reload.disabled = false;
          stop.hidden = true;
          status.dataset.result = !error && result && result.success ? 'success' : 'error';
          status.textContent = error
            ? message('pageTestReconnect', 'Reload this page after reloading the extension.')
            : (result && (result.message || result.error)) || message('pageTestFailed', 'Extraction did not complete.');
        });
      } catch (error) {
        running = false;
        copy.disabled = false;
        fullScan.disabled = false;
        reload.disabled = false;
        stop.hidden = true;
        status.dataset.result = 'error';
        status.textContent = message('pageTestReconnect', 'Reload this page after reloading the extension.');
      }
    }

    copy.addEventListener('click', (event) => run('copy', event));
    fullScan.addEventListener('click', (event) => run('full-scan', event));
    stop.addEventListener('click', (event) => run('stop', event));
    reload.addEventListener('click', (event) => run('reload', event));
    toggle.addEventListener('click', (event) => {
      if (!event.isTrusted) return;
      actions.hidden = !actions.hidden;
      status.hidden = actions.hidden;
      toggle.textContent = actions.hidden ? '+' : '−';
      toggle.setAttribute('aria-expanded', String(!actions.hidden));
    });

    panel.append(header, actions, status);
    root.append(style, panel);
    panelHost = host;
    (document.body || document.documentElement).append(host);
  }
})();
