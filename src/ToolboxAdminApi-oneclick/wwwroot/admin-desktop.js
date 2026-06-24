(function () {
  var TEXT = {
    building: '\u6b63\u5728\u751f\u6210...',
    buildingStatus: '\u6b63\u5728\u751f\u6210\u540e\u53f0\u7ba1\u7406 EXE...',
    httpError: '\u751f\u6210\u5931\u8d25\uff1aHTTP ',
    invalidExe: '\u670d\u52a1\u5668\u8fd4\u56de\u7684\u4e0d\u662f\u6709\u6548 EXE\uff0c\u8bf7\u68c0\u67e5\u7f16\u8bd1\u73af\u5883\u540e\u91cd\u8bd5\u3002',
    done: '\u540e\u53f0\u7ba1\u7406 EXE \u5df2\u5f00\u59cb\u4e0b\u8f7d\u3002',
    fallbackButton: '\u4e0b\u8f7d\u540e\u53f0 EXE'
  };

  function filenameFromDisposition(disposition) {
    var encoded = /filename\*=UTF-8''([^;]+)/i.exec(disposition || '');
    if (encoded) {
      try {
        return decodeURIComponent(encoded[1].replace(/"/g, '').trim());
      } catch (error) {
        return encoded[1].replace(/"/g, '').trim();
      }
    }
    var quoted = /filename="([^"]+)"/i.exec(disposition || '');
    if (quoted) return quoted[1];
    var plain = /filename=([^;]+)/i.exec(disposition || '');
    return plain ? plain[1].trim() : '';
  }

  async function blobLooksLikeExe(blob) {
    var header = new Uint8Array(await blob.slice(0, 2).arrayBuffer());
    return header.length >= 2 && header[0] === 0x4d && header[1] === 0x5a;
  }

  async function downloadAdminDesktop() {
    var button = document.getElementById('downloadAdminDesktopBtn');
    if (!button || button.disabled) return;
    var originalText = button.textContent;
    button.disabled = true;
    button.textContent = TEXT.building;
    try {
      if (typeof setStatus === 'function') setStatus(TEXT.buildingStatus);
      var headers = {};
      var token = localStorage.getItem('toolbox_session_token') || '';
      if (token) headers.Authorization = 'Bearer ' + token;
      var res = await fetch('/api/admin/desktop/download?_t=' + Date.now(), { headers: headers });
      var contentType = res.headers.get('content-type') || '';
      if (!res.ok) {
        var text = await res.text();
        if (contentType.indexOf('application/json') >= 0 || text.trim().charAt(0) === '{') {
          var parsed = JSON.parse(text || '{}');
          throw new Error(parsed.error || (TEXT.httpError + res.status));
        }
        throw new Error(text || (TEXT.httpError + res.status));
      }
      var blob = await res.blob();
      if (!(await blobLooksLikeExe(blob))) {
        throw new Error(TEXT.invalidExe);
      }
      var fileName = filenameFromDisposition(res.headers.get('content-disposition') || '') || 'toolbox-admin-desktop.exe';
      var url = URL.createObjectURL(blob);
      var link = document.createElement('a');
      link.href = url;
      link.download = fileName;
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
      if (typeof setStatus === 'function') setStatus(TEXT.done);
    } catch (error) {
      if (typeof setStatus === 'function') {
        setStatus(error.message, true);
      } else {
        alert(error.message);
      }
    } finally {
      button.disabled = false;
      button.textContent = originalText || TEXT.fallbackButton;
    }
  }

  function bind() {
    var button = document.getElementById('downloadAdminDesktopBtn');
    if (!button || button.dataset.desktopReady) return;
    button.dataset.desktopReady = '1';
    button.addEventListener('click', downloadAdminDesktop);
  }

  bind();
  document.addEventListener('DOMContentLoaded', bind);
}());
