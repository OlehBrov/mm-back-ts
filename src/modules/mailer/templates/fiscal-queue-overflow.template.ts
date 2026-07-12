export interface FiscalQueueOverflowContext {
  pendingCount: number;
  threshold: number;
  checkedAt: string;
}

export function fiscalQueueOverflowTemplate(
  ctx: FiscalQueueOverflowContext,
): { subject: string; html: string } {
  const subject = `⚠️ [MicroMarket] Черга фіскалізації переповнена — ${ctx.pendingCount} чеків`;

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
    .value { font-size: 15px; font-weight: 600; margin-bottom: 16px; }
    .value.warn { color: #e67e22; }
    .alert-box { background: #fff3cd; border-left: 4px solid #f0ad4e; padding: 14px 18px;
                 border-radius: 0 6px 6px 0; margin: 20px 0; font-size: 14px; }
    .alert-box p { margin: 0; }
    .footer { padding: 16px 32px; background: #f9f9f9; font-size: 11px; color: #aaa;
              border-top: 1px solid #eee; text-align: center; }
  </style>
</head>
<body>
  <div class="card">
    <div class="header">
      <h1>⚠️ Черга фіскалізації переповнена</h1>
      <p>Кількість чеків перевищила встановлений поріг</p>
    </div>
    <div class="body">
      <div class="label">Чеків у черзі (pending + processing)</div>
      <div class="value warn">${ctx.pendingCount}</div>

      <div class="label">Встановлений поріг (FISCAL_QUEUE_ALERT_THRESHOLD)</div>
      <div class="value">${ctx.threshold}</div>

      <div class="label">Час перевірки</div>
      <div class="value">${ctx.checkedAt}</div>

      <div class="alert-box">
        <p>Черга зростає — це може означати проблеми зі з'єднанням із <strong>vchasno.kasa</strong>,
        тривалий backoff після помилок, або велике навантаження на касу.
        Перевірте стан черги у кабінеті або через ендпоінт
        <code>GET /api/fiscal/queue</code>.</p>
      </div>
    </div>
    <div class="footer">MicroMarket Backend — автоматичне сповіщення</div>
  </div>
</body>
</html>`;

  return { subject, html };
}
