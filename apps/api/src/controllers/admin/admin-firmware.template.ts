/**
 * Static HTML shell for the admin firmware upload page. No build step / no
 * client framework — the page itself is unauthenticated (it contains no
 * data), the `/releases` and upload calls it makes from JS carry the bearer
 * token the admin types in once per session (kept in `sessionStorage` only).
 */
export function renderAdminFirmwarePage(): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>HomePulse — Firmware Upload</title>
<meta name="robots" content="noindex, nofollow" />
<style>
  body { font-family: system-ui, sans-serif; max-width: 720px; margin: 2rem auto; padding: 0 1rem; color: #222; }
  h1 { font-size: 1.4rem; }
  fieldset { border: 1px solid #ccc; border-radius: 8px; padding: 1rem; margin-bottom: 1.5rem; }
  label { display: block; margin-top: 0.75rem; font-weight: 600; }
  input, select { width: 100%; padding: 0.4rem; margin-top: 0.25rem; box-sizing: border-box; }
  #dropzone { border: 2px dashed #999; border-radius: 8px; padding: 2rem; text-align: center; margin-top: 0.5rem; cursor: pointer; }
  #dropzone.dragover { border-color: #333; background: #f5f5f5; }
  button { margin-top: 1rem; padding: 0.5rem 1.25rem; cursor: pointer; }
  table { width: 100%; border-collapse: collapse; font-size: 0.9rem; }
  th, td { text-align: left; padding: 0.35rem 0.5rem; border-bottom: 1px solid #eee; }
  #status { margin-top: 1rem; white-space: pre-wrap; }
  .error { color: #b00020; }
  .ok { color: #0a7d2c; }
</style>
</head>
<body>
<h1>HomePulse — Firmware Upload</h1>

<fieldset>
  <legend>Admin token</legend>
  <label for="token">Bearer token</label>
  <input type="password" id="token" placeholder="paste ADMIN_UPLOAD_TOKEN" />
</fieldset>

<fieldset>
  <legend>Existing releases</legend>
  <button id="refresh-releases" type="button">Load releases</button>
  <div id="releases-table"></div>
</fieldset>

<fieldset>
  <legend>Upload new firmware</legend>
  <form id="upload-form">
    <label for="version">Version (semver)</label>
    <input type="text" id="version" name="version" placeholder="0.3.0" required />

    <label for="board">Board</label>
    <select id="board" name="board" required>
      <option value="esp32c3">esp32c3</option>
      <option value="esp32c6">esp32c6</option>
    </select>

    <label for="channel">Channel</label>
    <select id="channel" name="channel" required>
      <option value="ALPHA">ALPHA</option>
      <option value="BETA">BETA</option>
      <option value="STABLE">STABLE</option>
    </select>

    <label>
      <input type="checkbox" id="critical" name="critical" style="width:auto;display:inline-block" />
      Critical (forces all devices on channel to update)
    </label>

    <label for="file">Firmware binary (.bin)</label>
    <div id="dropzone">Drop .bin file here, or click to browse</div>
    <input type="file" id="file" name="file" accept=".bin" style="display:none" required />

    <button type="submit">Upload</button>
  </form>
  <div id="status"></div>
</fieldset>

<script>
(function () {
  var TOKEN_KEY = 'hpw_admin_token';
  var tokenInput = document.getElementById('token');
  tokenInput.value = sessionStorage.getItem(TOKEN_KEY) || '';
  tokenInput.addEventListener('change', function () {
    sessionStorage.setItem(TOKEN_KEY, tokenInput.value);
  });

  function authHeaders() {
    return { Authorization: 'Bearer ' + tokenInput.value };
  }

  var dropzone = document.getElementById('dropzone');
  var fileInput = document.getElementById('file');
  dropzone.addEventListener('click', function () { fileInput.click(); });
  dropzone.addEventListener('dragover', function (e) {
    e.preventDefault();
    dropzone.classList.add('dragover');
  });
  dropzone.addEventListener('dragleave', function () {
    dropzone.classList.remove('dragover');
  });
  dropzone.addEventListener('drop', function (e) {
    e.preventDefault();
    dropzone.classList.remove('dragover');
    if (e.dataTransfer.files.length > 0) {
      fileInput.files = e.dataTransfer.files;
      dropzone.textContent = e.dataTransfer.files[0].name;
    }
  });
  fileInput.addEventListener('change', function () {
    if (fileInput.files.length > 0) {
      dropzone.textContent = fileInput.files[0].name;
    }
  });

  function el(tag, text) {
    var node = document.createElement(tag);
    if (text !== undefined) node.textContent = text;
    return node;
  }

  function renderReleasesTable(releases) {
    var container = document.getElementById('releases-table');
    container.textContent = '';
    if (!releases.length) {
      container.appendChild(el('p', 'No releases yet.'));
      return;
    }
    var table = document.createElement('table');
    var thead = document.createElement('thead');
    var headRow = document.createElement('tr');
    ['Version', 'Board', 'Channel', 'Critical', 'Created'].forEach(function (h) {
      headRow.appendChild(el('th', h));
    });
    thead.appendChild(headRow);
    table.appendChild(thead);

    var tbody = document.createElement('tbody');
    releases.forEach(function (r) {
      var row = document.createElement('tr');
      row.appendChild(el('td', r.version));
      row.appendChild(el('td', r.boardType));
      row.appendChild(el('td', r.channel));
      row.appendChild(el('td', r.isCritical ? 'yes' : ''));
      row.appendChild(el('td', r.createdAt));
      tbody.appendChild(row);
    });
    table.appendChild(tbody);

    container.appendChild(table);
  }

  document.getElementById('refresh-releases').addEventListener('click', function () {
    fetch('/api/admin/firmware/releases', { headers: authHeaders() })
      .then(function (res) {
        if (!res.ok) return res.json().then(function (b) { throw new Error(b.message || res.statusText); });
        return res.json();
      })
      .then(function (body) { renderReleasesTable(body.releases); })
      .catch(function (err) {
        var container = document.getElementById('releases-table');
        container.textContent = '';
        var p = el('p', err.message);
        p.className = 'error';
        container.appendChild(p);
      });
  });

  document.getElementById('upload-form').addEventListener('submit', function (e) {
    e.preventDefault();
    var statusEl = document.getElementById('status');
    statusEl.className = '';
    statusEl.textContent = 'Uploading…';

    var formData = new FormData();
    formData.append('file', fileInput.files[0]);
    formData.append('version', document.getElementById('version').value);
    formData.append('board', document.getElementById('board').value);
    formData.append('channel', document.getElementById('channel').value);
    formData.append('critical', document.getElementById('critical').checked ? 'true' : 'false');

    fetch('/api/admin/firmware', {
      method: 'POST',
      headers: authHeaders(),
      body: formData,
    })
      .then(function (res) {
        return res.json().then(function (body) {
          if (!res.ok) throw new Error(body.message || res.statusText);
          return body;
        });
      })
      .then(function (body) {
        statusEl.className = 'ok';
        statusEl.textContent = 'Uploaded: ' + body.release.version + ' (' + body.release.boardType + '/' + body.release.channel + ')';
      })
      .catch(function (err) {
        statusEl.className = 'error';
        statusEl.textContent = 'Error: ' + err.message;
      });
  });
})();
</script>
</body>
</html>`;
}
