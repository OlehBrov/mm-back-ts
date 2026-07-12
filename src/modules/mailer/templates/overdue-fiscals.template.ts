export interface OverdueFiscalsContext {
  count: number;
  reportDate: string;
}

export function overdueFiscalsTemplate(ctx: OverdueFiscalsContext): { subject: string; html: string } {
  const subject = `📋 [MicroMarket] Протерміновані чеки за ${ctx.reportDate} — ${ctx.count} записів`;

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
    .header { background: #1565c0; padding: 24px 32px; color: #fff; }
    .header h1 { margin: 0; font-size: 20px; }
    .header p  { margin: 6px 0 0; opacity: 0.85; font-size: 13px; }
    .body { padding: 28px 32px; }
    .label { font-size: 11px; text-transform: uppercase; color: #888; margin-bottom: 2px; }
    .value { font-size: 15px; font-weight: 600; margin-bottom: 16px; }
    .info-box { background: #e3f2fd; border-left: 4px solid #1565c0; padding: 14px 18px;
                border-radius: 0 6px 6px 0; margin: 20px 0; font-size: 14px; }
    .info-box p { margin: 0; line-height: 1.6; }
    .footer { padding: 16px 32px; background: #f9f9f9; font-size: 11px; color: #aaa;
              border-top: 1px solid #eee; text-align: center; }
  </style>
</head>
<body>
  <div class="card">
    <div class="header">
      <h1>📋 Протерміновані фіскальні чеки</h1>
      <p>Звіт за ${ctx.reportDate} — автоматичне архівування черги</p>
    </div>
    <div class="body">
      <div class="label">Дата звіту</div>
      <div class="value">${ctx.reportDate}</div>

      <div class="label">Кількість незареєстрованих чеків</div>
      <div class="value">${ctx.count}</div>

      <div class="info-box">
        <p>Вищевказані чеки <strong>не були зареєстровані</strong> у Вчасно.Каса протягом дня
        і були перенесені до архіву <code>OverdueFiscalQueue</code>.<br/>
        Деталі в прикріпленому файлі <strong>XLSX</strong>.<br/>
        Зверніться до адміністратора або служби підтримки Вчасно.Каса для ручної реєстрації.</p>
      </div>
    </div>
    <div class="footer">MicroMarket Backend — автоматичне сповіщення</div>
  </div>
</body>
</html>`;

  return { subject, html };
}
