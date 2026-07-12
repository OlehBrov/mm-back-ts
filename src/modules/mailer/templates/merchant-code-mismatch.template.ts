export interface MerchantCodeMismatchContext {
  merchantId: string;
  merchantName: string;
  /** ЄДРПОУ/ІПН з конфігу (merchant_code) */
  configuredCode: string;
  /** ЄДРПОУ/ІПН з відповіді Вчасно.Каса */
  vchasnoCode: string;
  checkedAt: string;
}

export function merchantCodeMismatchTemplate(ctx: MerchantCodeMismatchContext): { subject: string; html: string } {
  const subject = `⚠️ [MicroMarket] Невідповідність ЄДРПОУ — мерчант ${ctx.merchantId}`;

  const html = `<!DOCTYPE html>
<html lang="uk">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${subject}</title>
  <style>
    body { font-family: Arial, sans-serif; background: #f5f5f5; margin: 0; padding: 24px; color: #222; }
    .card { background: #fff; border-radius: 8px; max-width: 600px; margin: 0 auto; overflow: hidden;
            box-shadow: 0 2px 8px rgba(0,0,0,0.1); }
    .header { background: #d35400; padding: 24px 32px; color: #fff; }
    .header h1 { margin: 0; font-size: 20px; }
    .header p  { margin: 6px 0 0; opacity: 0.85; font-size: 13px; }
    .body { padding: 28px 32px; }
    .label { font-size: 11px; text-transform: uppercase; color: #888; margin-bottom: 2px; }
    .value { font-size: 15px; font-weight: 600; margin-bottom: 16px; word-break: break-all; }
    .value.mismatch { color: #c0392b; }
    .compare-table { width: 100%; border-collapse: collapse; margin: 16px 0; font-size: 14px; }
    .compare-table th { background: #f0f0f0; padding: 8px 12px; text-align: left; font-size: 12px;
                        text-transform: uppercase; color: #555; border: 1px solid #ddd; }
    .compare-table td { padding: 10px 12px; border: 1px solid #ddd; }
    .compare-table td.ok  { color: #27ae60; font-weight: 600; }
    .compare-table td.bad { color: #c0392b; font-weight: 600; background: #fdecea; }
    .alert-box { background: #fdecea; border-left: 4px solid #c0392b; padding: 14px 18px;
                 border-radius: 0 6px 6px 0; margin: 20px 0; }
    .alert-box p { margin: 0; font-size: 14px; line-height: 1.6; }
    .footer { padding: 16px 32px; background: #f9f9f9; font-size: 11px; color: #aaa;
              border-top: 1px solid #eee; text-align: center; }
  </style>
</head>
<body>
  <div class="card">
    <div class="header">
      <h1>⚠️ Невідповідність ЄДРПОУ/ІПН</h1>
      <p>Кіоск переведено в режим технічних робіт</p>
    </div>
    <div class="body">
      <div class="label">Мерчант</div>
      <div class="value">${escapeHtml(ctx.merchantName)} <span style="font-weight:400;font-size:13px;color:#888">(${escapeHtml(ctx.merchantId)})</span></div>

      <div class="label">Час перевірки</div>
      <div class="value">${ctx.checkedAt}</div>

      <table class="compare-table">
        <thead>
          <tr>
            <th>Джерело</th>
            <th>ЄДРПОУ / ІПН</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>Конфіг кіоска (merchant_code)</td>
            <td class="${ctx.configuredCode ? 'ok' : 'bad'}">${escapeHtml(ctx.configuredCode || '(не задано)')}</td>
          </tr>
          <tr>
            <td>Вчасно.Каса (edrpou)</td>
            <td class="bad">${escapeHtml(ctx.vchasnoCode)}</td>
          </tr>
        </tbody>
      </table>

      <div class="alert-box">
        <p><strong>ЄДРПОУ з токена Вчасно.Каса не збігається з merchant_code у конфігурації.</strong><br />
        Кіоск показує екран "Технічні роботи". Фіскалізація заблокована до усунення розбіжності.</p>
      </div>
    </div>
    <div class="footer">MicroMarket Backend — автоматичне сповіщення</div>
  </div>
</body>
</html>`;

  return { subject, html };
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
