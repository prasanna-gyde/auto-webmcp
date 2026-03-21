// awmcp-panel.js — floating inspector panel for auto-webmcp console snippet
// Served at https://autowebmcp.dev/awmcp-panel.js
// Loaded after the auto-webmcp IIFE so window.__registeredToolMeta is already populated.

function _awmcpEsc(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

window._awmcpToggleSchema = function (name) {
  var el = document.getElementById('__awmcp_s_' + name.replace(/\W/g, '_'));
  if (!el) return;
  if (el.style.display === 'none') {
    el.style.display = 'block';
    if (!el.dataset.filled) {
      var m = window.__registeredToolMeta[name];
      el.textContent = JSON.stringify({ name: name, description: m.description, inputSchema: m.inputSchema }, null, 2);
      el.dataset.filled = '1';
    }
  } else { el.style.display = 'none'; }
};

window._awmcpCopyMcp = function (name, btn) {
  var payload = JSON.stringify({ type: 'tool_use', name: name, input: {} }, null, 2);
  navigator.clipboard.writeText(payload).then(function () {
    var prev = btn.textContent; btn.textContent = 'Copied!';
    setTimeout(function () { btn.textContent = prev; }, 1500);
  }).catch(function () { window.prompt('Copy:', payload); });
};

window._awmcpRenderTools = function () {
  var body = document.getElementById('__awmcp_body');
  if (!body) return;
  var names = Object.keys(window.__registeredToolMeta);
  if (!names.length) {
    body.innerHTML = '<div style="color:rgba(255,255,255,0.4);padding:12px 2px;font-size:12px">' +
      'No tools registered yet&#x2026;</div>';
    return;
  }
  body.innerHTML =
    '<div style="font-size:10px;font-weight:700;letter-spacing:0.08em;' +
    'color:rgba(255,255,255,0.4);margin-bottom:6px">REGISTERED TOOLS &nbsp;[' +
    names.length + ']</div>' +
    names.map(function (n) {
      var m  = window.__registeredToolMeta[n];
      var sid = '__awmcp_s_' + n.replace(/\W/g, '_');
      var fc  = m.fieldCount + ' field' + (m.fieldCount !== 1 ? 's' : '');
      return '<div style="border:1px solid rgba(255,255,255,0.08);border-radius:6px;' +
        'padding:8px 10px;margin-bottom:6px;background:rgba(255,255,255,0.03)">' +
        '<div style="display:flex;align-items:center;justify-content:space-between">' +
        '<span style="font-weight:600;font-size:12px;color:#86efac">' + _awmcpEsc(n) + '</span>' +
        '<span style="font-size:11px;color:rgba(255,255,255,0.4)">' + fc + '</span></div>' +
        (m.description ? '<div style="font-size:11px;color:rgba(255,255,255,0.5);margin-top:2px;' +
          'overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="' +
          _awmcpEsc(m.description) + '">' + _awmcpEsc(m.description) + '</div>' : '') +
        '<div style="display:flex;gap:6px;margin-top:6px">' +
        '<button data-awmcp-view="' + _awmcpEsc(n) + '" style="font-size:10px;padding:2px 8px;' +
        'border-radius:4px;border:1px solid rgba(255,255,255,0.15);' +
        'background:rgba(255,255,255,0.06);color:rgba(255,255,255,0.7);cursor:pointer">' +
        'View Schema</button>' +
        '<button data-awmcp-copy="' + _awmcpEsc(n) + '" style="font-size:10px;padding:2px 8px;' +
        'border-radius:4px;border:1px solid rgba(134,239,172,0.3);' +
        'background:rgba(134,239,172,0.08);color:#86efac;cursor:pointer">' +
        'Copy MCP</button></div>' +
        '<pre id="' + sid + '" style="display:none;margin-top:6px;background:rgba(0,0,0,0.3);' +
        'border:1px solid rgba(255,255,255,0.07);border-radius:4px;padding:6px 8px;' +
        'font-size:10px;font-family:monospace;color:#d1d5db;' +
        'overflow:auto;max-height:180px;white-space:pre-wrap;word-break:break-word"></pre>' +
        '</div>';
    }).join('');
  body.querySelectorAll('[data-awmcp-view]').forEach(function (btn) {
    btn.addEventListener('click', function () { _awmcpToggleSchema(this.getAttribute('data-awmcp-view')); });
  });
  body.querySelectorAll('[data-awmcp-copy]').forEach(function (btn) {
    btn.addEventListener('click', function () { _awmcpCopyMcp(this.getAttribute('data-awmcp-copy'), this); });
  });
};

window._awmcpShowPanel = function () {
  if (document.getElementById('__awmcp_panel')) return;
  var p = document.createElement('div');
  p.id = '__awmcp_panel';
  p.style.cssText = [
    'position:fixed;top:16px;right:16px;z-index:2147483647;width:300px',
    'background:#1a1a2e;color:#e2e8f0;border-radius:10px',
    'font-family:system-ui,sans-serif;font-size:13px',
    'box-shadow:0 8px 32px rgba(0,0,0,0.45);border:1px solid rgba(255,255,255,0.1)',
    'overflow:hidden;user-select:none'
  ].join(';');
  p.innerHTML =
    '<div id="__awmcp_hdr" style="padding:10px 12px;background:#16213e;display:flex;' +
    'align-items:center;justify-content:space-between;cursor:move;' +
    'border-bottom:1px solid rgba(255,255,255,0.08)">' +
    '<span style="font-weight:700;font-size:12px;letter-spacing:0.04em">' +
    '&#x26A1; auto-webmcp Inspector</span>' +
    '<button id="__awmcp_close" style="background:none;border:none;' +
    'color:rgba(255,255,255,0.5);cursor:pointer;font-size:16px;line-height:1;padding:0 2px">' +
    '&#x2715;</button></div>' +
    '<div id="__awmcp_body" style="padding:8px 10px;max-height:420px;overflow-y:auto"></div>' +
    '<div style="padding:8px 12px;border-top:1px solid rgba(255,255,255,0.08);' +
    'font-size:11px;color:rgba(255,255,255,0.35)">' +
    'Console: <code style="color:#86efac">awmcpInvoke(name, {})</code></div>';
  document.body.appendChild(p);
  document.getElementById('__awmcp_close').onclick = function () { p.remove(); };
  _awmcpRenderTools();
  window.__onToolRegistered = function () { _awmcpRenderTools(); };
  // Drag by header
  var hdr = document.getElementById('__awmcp_hdr'), ox, oy, mx, my;
  hdr.onmousedown = function (e) {
    if (e.target.id === '__awmcp_close') return;
    e.preventDefault(); ox = p.offsetLeft; oy = p.offsetTop; mx = e.clientX; my = e.clientY;
    document.onmousemove = function (e) {
      p.style.right = 'auto';
      p.style.left = (ox + e.clientX - mx) + 'px';
      p.style.top  = (oy + e.clientY - my) + 'px';
    };
    document.onmouseup = function () { document.onmousemove = null; document.onmouseup = null; };
  };
};

_awmcpShowPanel();
