#ifndef HOMEPULSE_PORTAL_HTML_H
#define HOMEPULSE_PORTAL_HTML_H

#include <pgmspace.h>

/**
 * HomePulse captive portal HTML/CSS/JS — stored in flash (PROGMEM).
 *
 * Self-contained: no external resources.
 * Mobile-first, dark theme, touch-friendly.
 */
static const char PORTAL_HTML[] PROGMEM = R"rawhtml(
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>HomePulse Setup</title>
<style>
  *{box-sizing:border-box;margin:0;padding:0}
  body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;
       background:#111;color:#eee;min-height:100vh;padding:16px}
  .banner{background:#1a3a5c;border:1px solid #2a5a8c;border-radius:8px;
          padding:10px 14px;margin-bottom:20px;font-size:13px;color:#7ec8f7}
  .banner strong{display:block;font-size:15px;color:#a8d8ff;margin-bottom:2px}
  h1{font-size:20px;font-weight:600;margin-bottom:4px;color:#fff}
  .subtitle{font-size:13px;color:#888;margin-bottom:24px}
  label{display:block;font-size:13px;color:#aaa;margin-bottom:5px;margin-top:16px}
  label:first-of-type{margin-top:0}
  select,input[type=text],input[type=password],input[type=url]{
    width:100%;padding:12px 14px;border-radius:8px;
    border:1px solid #333;background:#1e1e1e;color:#eee;
    font-size:16px;outline:none;appearance:none;-webkit-appearance:none}
  select:focus,input:focus{border-color:#2a7aff;background:#1a1a2e}
  .row{display:flex;gap:8px;align-items:flex-end}
  .row select{flex:1}
  .btn-sm{padding:12px 14px;border-radius:8px;border:1px solid #333;
          background:#2a2a2a;color:#aaa;font-size:14px;cursor:pointer;
          white-space:nowrap;flex-shrink:0}
  .btn-sm:active{background:#3a3a3a}
  .toggle{font-size:12px;color:#2a7aff;margin-top:6px;cursor:pointer;
          display:inline-block;text-decoration:underline}
  .field-header{display:flex;justify-content:space-between;align-items:baseline;margin-top:16px}
  .field-header label{margin-top:0}
  .clear-btn{font-size:12px;color:#2a7aff;cursor:pointer;text-decoration:underline}
  button[type=submit]{width:100%;margin-top:28px;padding:15px;
    border-radius:10px;border:none;background:#2a7aff;color:#fff;
    font-size:17px;font-weight:600;cursor:pointer;letter-spacing:.3px}
  button[type=submit]:active{background:#1a6aef}
  button[type=submit]:disabled{background:#333;color:#666;cursor:not-allowed}
  #status{margin-top:16px;padding:12px 14px;border-radius:8px;
          font-size:14px;text-align:center;display:none}
  .status-info{background:#1a2a3a;border:1px solid #2a4a6a;color:#7ec8f7}
  .status-error{background:#3a1a1a;border:1px solid #6a2a2a;color:#f78080}
  .status-ok{background:#1a3a1a;border:1px solid #2a6a2a;color:#80f780}
  .divider{border:none;border-top:1px solid #222;margin:24px 0}
  .hint{font-size:11px;color:#555;margin-top:5px}
  .pw-wrap{position:relative}
  .pw-wrap input{padding-right:42px}
  .pw-toggle{position:absolute;right:10px;top:50%;transform:translateY(-50%);
             background:none;border:none;color:#555;cursor:pointer;
             font-size:18px;padding:4px;line-height:1}
  .pw-toggle:hover{color:#aaa}
</style>
</head>
<body>
<div class="banner">
  <strong>HomePulse Setup</strong>
  <span>Can't see this page? Open: </span><strong>http://192.168.4.1</strong>
</div>

<h1>Device Configuration</h1>
<p class="subtitle">Connect this device to your WiFi network.</p>

<form id="cfg" onsubmit="doSave(event)">

  <label for="ssid-select">WiFi Network</label>
  <div class="row">
    <select id="ssid-select" name="ssid" required></select>
    <button type="button" class="btn-sm" onclick="doScan()">&#x21bb; Scan</button>
  </div>
  <span id="toggle-link" class="toggle" onclick="toggleManual()">Enter manually</span>
  <input type="text" id="ssid-manual" name="ssid_manual"
         placeholder="Network name (SSID)" style="display:none;margin-top:8px"
         maxlength="32" autocorrect="off" autocapitalize="none">

  <label for="password">WiFi Password</label>
  <div class="pw-wrap">
    <input type="password" id="password" name="password"
           placeholder="Leave blank for open networks" maxlength="64">
    <button type="button" class="pw-toggle" onclick="togglePw(this,'password')" title="Show password">&#128065;</button>
  </div>

  <hr class="divider">

  <div class="field-header">
    <label for="secret">Device Secret</label>
    <span id="secret-clear" class="clear-btn" onclick="clearField('secret')" style="display:none">&#x2715; Clear</span>
  </div>
  <input type="text" id="secret" name="secret" required
         placeholder="64-char HMAC key from backend" maxlength="64"
         autocomplete="off" autocorrect="off" autocapitalize="none"
         spellcheck="false">
  <p id="secret-hint" class="hint">Obtain from the HomePulse admin CLI: list-devices</p>

  <div class="field-header">
    <label for="url">Backend URL</label>
    <span id="url-clear" class="clear-btn" onclick="clearField('url')" style="display:none">&#x2715; Clear</span>
  </div>
  <input type="url" id="url" name="url" required
         placeholder="http://your-server/api/device-status"
         maxlength="128">
  <p class="hint" id="url-hint" style="display:none">Edit to point the device at a different backend.</p>

  <label for="ota-channel">OTA Channel</label>
  <select id="ota-channel" name="ota_channel">
    <option value="STABLE">STABLE (recommended)</option>
    <option value="BETA">BETA</option>
    <option value="ALPHA">ALPHA</option>
  </select>

  <div id="status"></div>
  <button type="submit" id="save-btn">Save &amp; Connect</button>
</form>

<script>
var manualMode = false;
var storedSsid = '';
var SECRET_PLACEHOLDER = '••••••••';

function togglePw(btn, id) {
  var inp = document.getElementById(id);
  var nowVisible = inp.type === 'text';
  inp.type = nowVisible ? 'password' : 'text';
  btn.textContent = nowVisible ? '👁' : '🔒';
  btn.title = nowVisible ? 'Show password' : 'Hide password';
}

function showStatus(msg, cls) {
  var el = document.getElementById('status');
  el.textContent = msg;
  el.className = cls;
  el.style.display = 'block';
}

function clearSelect(sel) {
  while (sel.options.length > 0) { sel.remove(0); }
}

function addOption(sel, value, text) {
  var opt = document.createElement('option');
  opt.value = value;
  opt.textContent = text;
  sel.appendChild(opt);
}

function selectStoredSsid(sel) {
  if (!storedSsid) return;
  for (var i = 0; i < sel.options.length; i++) {
    if (sel.options[i].value === storedSsid) {
      sel.selectedIndex = i;
      return;
    }
  }
}

function doScan() {
  var sel = document.getElementById('ssid-select');
  clearSelect(sel);
  addOption(sel, '', 'Scanning…');
  showStatus('Scanning for networks…', 'status-info');
  fetch('/scan')
    .then(function(r){ return r.json(); })
    .then(function(nets) {
      clearSelect(sel);
      if (!nets.length) {
        addOption(sel, '', 'No networks found');
        showStatus('No networks found. Try again.', 'status-error');
        return;
      }
      nets.forEach(function(n) {
        addOption(sel, n.ssid, n.ssid);
      });
      selectStoredSsid(sel);
      document.getElementById('status').style.display = 'none';
    })
    .catch(function() {
      clearSelect(sel);
      addOption(sel, '', 'Scan failed');
      showStatus('Scan failed. Check connection to HomePulse-Setup AP.', 'status-error');
    });
}

function loadConfig() {
  fetch('/config')
    .then(function(r){ return r.json(); })
    .then(function(c) {
      if (c.url) {
        document.getElementById('url').value = c.url;
        document.getElementById('url-clear').style.display = '';
        document.getElementById('url-hint').style.display = '';
      }
      if (c.ssid) {
        storedSsid = c.ssid;
        selectStoredSsid(document.getElementById('ssid-select'));
      }
      if (c.otaChannel) {
        document.getElementById('ota-channel').value = c.otaChannel;
      }
      if (c.hasSecret) {
        var secretEl = document.getElementById('secret');
        secretEl.value = SECRET_PLACEHOLDER;
        secretEl.removeAttribute('required');
        secretEl.addEventListener('focus', function onFirstFocus() {
          if (secretEl.value === SECRET_PLACEHOLDER) secretEl.value = '';
          secretEl.removeEventListener('focus', onFirstFocus);
        });
        document.getElementById('secret-clear').style.display = '';
        document.getElementById('secret-hint').textContent =
          'Leave unchanged to keep current secret, or type a new one to rotate.';
      }
    })
    .catch(function() {});
}

function clearField(id) {
  document.getElementById(id).value = '';
  document.getElementById(id).focus();
  document.getElementById(id + '-clear').style.display = 'none';
}

function toggleManual() {
  manualMode = !manualMode;
  var manual = document.getElementById('ssid-manual');
  var sel = document.getElementById('ssid-select');
  manual.style.display = manualMode ? 'block' : 'none';
  sel.style.display = manualMode ? 'none' : 'block';
  document.getElementById('toggle-link').textContent =
    manualMode ? 'Choose from list' : 'Enter manually';
}

function doSave(e) {
  e.preventDefault();
  var ssid = manualMode
    ? document.getElementById('ssid-manual').value.trim()
    : document.getElementById('ssid-select').value;
  if (!ssid) {
    showStatus('Please select or enter a network name.', 'status-error');
    return;
  }

  var secretVal = document.getElementById('secret').value.trim();
  // Bullet placeholder means "keep existing" — send empty so server falls back to NVS
  if (secretVal === SECRET_PLACEHOLDER) secretVal = '';

  var btn = document.getElementById('save-btn');
  btn.disabled = true;
  showStatus('Saving credentials…', 'status-info');

  var data = new URLSearchParams();
  data.append('ssid',        ssid);
  data.append('password',    document.getElementById('password').value);
  data.append('secret',      secretVal);
  data.append('url',         document.getElementById('url').value.trim());
  data.append('ota_channel', document.getElementById('ota-channel').value);

  fetch('/save', { method: 'POST', body: data,
                   headers: {'Content-Type': 'application/x-www-form-urlencoded'} })
    .then(function(r){ return r.text(); })
    .then(function(t) {
      showStatus(t, 'status-ok');
      btn.textContent = 'Saved!';
    })
    .catch(function() {
      // Device rebooting — connection drop is expected after save
      showStatus('Saved! Device is rebooting and connecting to ' + ssid + '.', 'status-ok');
      btn.textContent = 'Saved!';
    });
}

window.onload = function() {
  var sel = document.getElementById('ssid-select');
  clearSelect(sel);
  addOption(sel, '', 'Scanning…');
  doScan();
  loadConfig();
};
</script>
</body>
</html>
)rawhtml";

#endif  // HOMEPULSE_PORTAL_HTML_H
