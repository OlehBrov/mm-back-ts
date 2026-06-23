export interface FeedbackReportContext {
  storeName: string;
  reportDate: string; // DD.MM.YYYY
  total: number;
  average: string;   // "4.3"
  distribution: { rating: number; count: number; pct: string }[];
}

export function feedbackReportTemplate(ctx: FeedbackReportContext): { subject: string; html: string } {
  const subject = `Звіт по оцінках за ${ctx.reportDate} — ${ctx.storeName}`;

  const bars = ctx.distribution.map(({ rating, count, pct }) => {
    const stars = '★'.repeat(rating) + '☆'.repeat(5 - rating);
    const barWidth = Math.round(Number(pct));
    return `
      <tr>
        <td style="padding:4px 12px 4px 0;white-space:nowrap;color:#e2e8f0;font-size:14px;">${stars}</td>
        <td style="padding:4px 8px;width:180px;">
          <div style="background:#238636;height:14px;border-radius:3px;width:${barWidth}%;min-width:${count > 0 ? 2 : 0}px;"></div>
        </td>
        <td style="padding:4px 0 4px 8px;color:#8b949e;font-size:13px;">${count} (${pct}%)</td>
      </tr>`;
  }).join('');

  const html = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#0d1117;font-family:Arial,sans-serif;">
  <div style="max-width:520px;margin:32px auto;background:#161b22;border:1px solid #21262d;border-radius:12px;padding:32px;">
    <h2 style="margin:0 0 4px;color:#e2e8f0;font-size:20px;">Оцінки покупців</h2>
    <p style="margin:0 0 24px;color:#8b949e;font-size:13px;">${ctx.storeName} · ${ctx.reportDate}</p>

    <div style="display:flex;gap:32px;margin-bottom:28px;">
      <div style="text-align:center;">
        <div style="font-size:48px;font-weight:700;color:#e2e8f0;line-height:1;">${ctx.average}</div>
        <div style="color:#d29922;font-size:22px;margin-top:4px;">★</div>
        <div style="color:#8b949e;font-size:12px;margin-top:4px;">середня оцінка</div>
      </div>
      <div style="text-align:center;">
        <div style="font-size:48px;font-weight:700;color:#e2e8f0;line-height:1;">${ctx.total}</div>
        <div style="color:#8b949e;font-size:12px;margin-top:28px;">всього оцінок</div>
      </div>
    </div>

    <table style="border-collapse:collapse;width:100%;">
      ${bars}
    </table>

    <p style="margin:24px 0 0;color:#484f58;font-size:11px;border-top:1px solid #21262d;padding-top:16px;">
      Автоматичний звіт MicroMarket · ${ctx.reportDate}
    </p>
  </div>
</body>
</html>`;

  return { subject, html };
}
