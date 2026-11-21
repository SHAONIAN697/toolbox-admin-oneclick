import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const [url, browserHelper, output] = process.argv.slice(2);
const { Browser, sleep } = await import(pathToFileURL(browserHelper));
const browser = await Browser.launch();
async function waitFor(page, predicate, description) {
  for (let attempt = 0; attempt < 60; attempt++) {
    if (await page.eval(predicate)) return;
    await sleep(100);
  }
  assert.fail(description);
}
mkdirSync(output, { recursive: true });
try {
  let token;
  for (const width of [1440, 900, 390]) {
    const page = await browser.newPage({ width, height: 900, mobile: width < 600 });
    await page.goto(url, { settleMs: 300 });
    if (!token) token = await page.eval(async () => {
      const response = await fetch('/api/login', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: 'admin', password: 'test-local-fixture-password' })
      });
      if (!response.ok) throw new Error('Fixture administrator login failed');
      return (await response.json()).token;
    });
    await page.eval((sessionToken) => localStorage.setItem('toolbox_session_token', sessionToken), token);
    await page.goto(url, { settleMs: 350 });
    await waitFor(page, () => document.querySelector('#loginScreen').classList.contains('hidden') && !document.querySelector('main').inert, 'Admin startup');
    await page.eval(() => switchView('audit'));
    await waitFor(page, () => document.querySelector('#auditPageLabel')?.textContent.startsWith('第 1 页'), 'Audit first page');
    assert.match(await page.eval(() => document.querySelector('#auditPageLabel').textContent), /第 1 页/);
    assert.equal(await page.eval(() => document.querySelectorAll('.audit-log-row').length), 100);
    assert.equal(await page.eval(() => document.querySelectorAll('.audit-log-row .audit-open').length), 0);
    assert.ok(await page.eval(() => document.querySelector('#view-audit').classList.contains('show')));
    await page.eval(() => document.querySelector('.audit-pager').scrollIntoView({block: 'end'}));
    assert.ok(await page.eval(() => {
      const {left, right} = document.querySelector('#auditJump').getBoundingClientRect();
      return left >= 0 && right <= innerWidth;
    }), 'Jump button fits the viewport');
    await page.screenshot({ path: join(output, 'audit-pager-' + width + '.png'), format: 'png' });
    await page.screenshot({ path: join(output, 'audit-' + width + '.png'), format: 'png' });
    await page.eval(() => document.querySelector('#auditNext').click());
    await waitFor(page, () => document.querySelector('#auditPageLabel')?.textContent.startsWith('第 2 页'), 'Audit second page');
    assert.match(await page.eval(() => document.querySelector('#auditPageLabel').textContent), /第 2 页/);
    assert.equal(await page.eval(() => document.querySelector('#auditPageNumbers [aria-current="page"]').textContent), '2');
    await page.eval(() => {
      document.querySelector('#auditJump').click();
      const field = document.querySelector('#auditJumpPage');
      field.value = field.max;
      field.form.requestSubmit();
    });
    await waitFor(page, () => document.querySelector('#auditPageNumbers [aria-current="page"]')?.textContent === document.querySelector('#auditJumpPage').max, 'Audit last page');
    assert.ok(await page.eval(() => document.querySelector('#auditNext').disabled));
    await page.eval(() => document.querySelector('.audit-log-row[data-audit-index]').click());
    assert.equal(await page.eval(() => document.querySelector('#auditDetailOverlay').hidden), false);
    assert.match(await page.eval(() => document.querySelector('#auditDetailBody pre').textContent), /"eventId"/);
    const marker = await page.eval(() => document.querySelector('#auditDetailTitle').textContent);
    assert.ok(marker.includes('<预览>'));
    assert.equal(await page.eval(() => document.querySelector('#auditDetailTitle').childElementCount), 0);
    await page.screenshot({ path: join(output, 'audit-detail-' + width + '.png'), format: 'png' });
    await page.eval(() => document.querySelector('#auditDetailClose').click());
    await page.eval(() => {
      const input = document.querySelector('#auditUserFilter');
      input.value = '注册名 A';
      input.dispatchEvent(new Event('input'));
    });
    await waitFor(page, () => document.querySelector('#auditPageLabel').textContent.startsWith('第 1 页') && document.querySelector('#auditLogRows').textContent.includes('注册名 A'), 'Audit filtered first page');
    assert.ok(await page.eval(() => document.querySelector('#auditLogRows').textContent.includes('注册名 A')));
    assert.equal(page.consoleErrors.length, 0, page.consoleErrors.join('\n'));
    await page.close();
  }
  console.log('Audit browser smoke passed at 1440, 900, 390 px');
} finally {
  await browser.close();
}

