export interface FiscalFailedContext {
  jobId: number;
  maxAttempts: number;
  lastError: string;
  tag: string;
  enqueuedAt: string;
}

export function fiscalFailedTemplate(ctx: FiscalFailedContext): { subject: string; html: string } {
  const subject = `⚠️ [MicroMarket] Фіскальний чек не відправлено — Job #${ctx.jobId}`;

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
    .header { background: #e67e22; padding: 24px 32px; color: #fff; }
    .header h1 { margin: 0; font-size: 20px; }
    .header p  { margin: 6px 0 0; opacity: 0.85; font-size: 13px; }
    .body { padding: 28px 32px; }
    .label { font-size: 11px; text-transform: uppercase; color: #888; margin-bottom: 2px; }
    .value { font-size: 15px; font-weight: 600; margin-bottom: 16px; word-break: break-all; }
    .value.error { color: #c0392b; }
    .tag-value { font-size: 12px; font-family: monospace; background: #f0f0f0; padding: 4px 8px;
                 border-radius: 4px; display: inline-block; }
    .alert-box { background: #fef9e7; border-left: 4px solid #e67e22; padding: 14px 18px;
                 border-radius: 0 6px 6px 0; margin: 20px 0; }
    .alert-box p { margin: 0; font-size: 14px; }
    .steps { background: #fdecea; border-left: 4px solid #e67e22; padding: 14px 18px;
             border-radius: 0 6px 6px 0; margin-top: 16px; }
    .steps p { margin: 0 0 6px; font-weight: 600; font-size: 13px; }
    .steps ol { margin: 6px 0 0 18px; padding: 0; font-size: 13px; line-height: 1.7; }
    .footer { padding: 16px 32px; background: #f9f9f9; font-size: 11px; color: #aaa;
              border-top: 1px solid #eee; text-align: center; }
  </style>
</head>
<body>
  <div class="card">
    <div class="header">
      <h1>⚠️ Фіскальний чек не відправлено</h1>
      <p>Вичерпано всі ${ctx.maxAttempts} спроб — потрібне ручне відновлення</p>
    </div>
    <div class="body">
      <div class="label">Job ID</div>
      <div class="value">#${ctx.jobId}</div>

      <div class="label">Кількість спроб</div>
      <div class="value">${ctx.maxAttempts} / ${ctx.maxAttempts}</div>

      <div class="label">Остання помилка</div>
      <div class="value error">${escapeHtml(ctx.lastError)}</div>

      <div class="label">Tag (для ідентифікації в vchasno)</div>
      <div class="value"><span class="tag-value">${ctx.tag}</span></div>

      <div class="label">Чек поставлений у чергу</div>
      <div class="value">${ctx.enqueuedAt}</div>

      <div class="alert-box">
        <p>Черга фіскалізації <strong>заблокована</strong> — усі наступні чеки
        чекають доки цей job не буде вирішено. Зв'яжіться з Вчасно.Каса або
        перевірте підключення до Інтернету.</p>
      </div>

      <div class="steps">
        <p>Як відновити роботу:</p>
        <ol>
          <li>Усуньте причину помилки (мережа, токен, кабінет vchasno)</li>
          <li>Перевірте чи не задублювався чек у кабінеті за tag: <code>${ctx.tag}</code></li>
          <li>Якщо чек вже зареєстровано — оновіть статус job #${ctx.jobId} на <code>completed</code>
              в таблиці <code>FiscalQueue</code></li>
          <li>Якщо чек НЕ зареєстровано — оновіть статус на <code>pending</code>,
              обнуліть <code>attempts=0</code> та <code>next_retry_at=NOW()</code></li>
        </ol>
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
