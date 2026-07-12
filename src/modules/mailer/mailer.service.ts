import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';
import type { Transporter } from 'nodemailer';
import { fiscalFatalTemplate, FiscalFatalContext } from './templates/fiscal-fatal.template';
import { fiscalFailedTemplate, FiscalFailedContext } from './templates/fiscal-failed.template';
import { fiscalQueueOverflowTemplate, FiscalQueueOverflowContext } from './templates/fiscal-queue-overflow.template';
import { overdueFiscalsTemplate, OverdueFiscalsContext } from './templates/overdue-fiscals.template';
import { merchantCodeMismatchTemplate, MerchantCodeMismatchContext } from './templates/merchant-code-mismatch.template';

@Injectable()
export class MailerService {
  private readonly logger = new Logger(MailerService.name);
  private readonly transporter: Transporter;
  private readonly from: string;
  private readonly to: string;
  readonly supportTo: string;
  private readonly enabled: boolean;

  constructor(private readonly config: ConfigService) {
    const host = config.get<string>('mailer.host');
    this.from = config.get<string>('mailer.from') ?? 'MicroMarket <noreply@localhost>';
    this.to = config.get<string>('mailer.to') ?? '';
    this.supportTo = config.get<string>('mailer.supportTo') ?? '';
    this.enabled = !!host && !!this.to;

    if (!this.enabled) {
      this.logger.warn('Mailer is disabled (MAIL_HOST or MAIL_TO not set). Alert emails will be skipped.');
    }

    this.transporter = nodemailer.createTransport({
      host: host ?? 'localhost',
      port: config.get<number>('mailer.port') ?? 587,
      secure: config.get<boolean>('mailer.secure') ?? false,
      auth: {
        user: config.get<string>('mailer.user'),
        pass: config.get<string>('mailer.pass'),
      },
      tls: { rejectUnauthorized: false },
    });
  }

  async sendFiscalFatalAlert(ctx: FiscalFatalContext): Promise<void> {
    const { subject, html } = fiscalFatalTemplate(ctx);
    await this.send(subject, html);
  }

  async sendFiscalFailedAlert(ctx: FiscalFailedContext): Promise<void> {
    const { subject, html } = fiscalFailedTemplate(ctx);
    await this.send(subject, html);
  }

  async sendFiscalQueueOverflowAlert(ctx: FiscalQueueOverflowContext): Promise<void> {
    const { subject, html } = fiscalQueueOverflowTemplate(ctx);
    await this.send(subject, html);
  }

  async sendOverdueFiscalsReport(
    ctx: OverdueFiscalsContext,
    xlsxBuffer: Buffer,
    to: string,
  ): Promise<void> {
    const { subject, html } = overdueFiscalsTemplate(ctx);
    await this.send(subject, html, to, [
      {
        filename: `overdue-fiscals-${ctx.reportDate.replace(/\./g, '-')}.xlsx`,
        content: xlsxBuffer,
        contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      },
    ]);
  }

  async sendMerchantCodeMismatchAlert(ctx: MerchantCodeMismatchContext, to: string): Promise<void> {
    const { subject, html } = merchantCodeMismatchTemplate(ctx);
    await this.send(subject, html, to);
  }

  /** Send to a dynamic recipient (e.g. feedback_email from DB). */
  async sendTo(to: string, subject: string, html: string): Promise<void> {
    if (!to) return;
    await this.send(subject, html, to);
  }

  private async send(
    subject: string,
    html: string,
    toOverride?: string,
    attachments?: nodemailer.SendMailOptions['attachments'],
  ): Promise<void> {
    const recipient = toOverride ?? this.to;
    if (!recipient) return;
    if (!toOverride && !this.enabled) return;

    try {
      await this.transporter.sendMail({
        from: this.from,
        to: recipient,
        subject,
        html,
        attachments,
      });
      this.logger.log(`Email sent to <${recipient}>: "${subject}"`);
    } catch (err) {
      this.logger.error(
        `Failed to send email "${subject}" to <${recipient}>: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }
}
