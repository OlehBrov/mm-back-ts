import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';
import type { Transporter } from 'nodemailer';
import { PrismaService } from '../../database/prisma.service';
import { fiscalFatalTemplate, FiscalFatalContext } from './templates/fiscal-fatal.template';
import { fiscalFailedTemplate, FiscalFailedContext } from './templates/fiscal-failed.template';
import { fiscalQueueOverflowTemplate, FiscalQueueOverflowContext } from './templates/fiscal-queue-overflow.template';
import { overdueFiscalsTemplate, OverdueFiscalsContext } from './templates/overdue-fiscals.template';
import { merchantCodeMismatchTemplate, MerchantCodeMismatchContext } from './templates/merchant-code-mismatch.template';

@Injectable()
export class MailerService implements OnModuleInit {
  private readonly logger = new Logger(MailerService.name);
  private transporter!: Transporter;
  private from = 'MicroMarket <noreply@localhost>';
  private to = '';
  supportTo = '';
  private enabled = false;

  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
  ) {}

  /**
   * Config precedence: Store row (DB, editable via /setup) > env vars (docker-compose) > defaults.
   * Loaded once at boot, same as TerminalModule's DB-config pattern — not hot-reloaded, so
   * changing Store.mail_* via the Setup screen requires a restart to take effect.
   */
  async onModuleInit() {
    const authId = this.config.get<string>('store.authId');
    const store = authId
      ? await this.prisma.store.findUnique({ where: { auth_id: authId } })
      : null;

    const host = store?.mail_host || this.config.get<string>('mailer.host') || '';
    const port = store?.mail_port ?? this.config.get<number>('mailer.port') ?? 587;
    const secure = store?.mail_secure ?? this.config.get<boolean>('mailer.secure') ?? false;
    const user = store?.mail_user || this.config.get<string>('mailer.user') || '';
    const pass = store?.mail_pass || this.config.get<string>('mailer.pass') || '';

    this.from = store?.mail_from || this.config.get<string>('mailer.from') || 'MicroMarket <noreply@localhost>';
    this.to = store?.alert_email || this.config.get<string>('mailer.to') || '';
    this.supportTo = store?.support_email || this.config.get<string>('mailer.supportTo') || '';
    this.enabled = !!host && !!this.to;

    if (!this.enabled) {
      this.logger.warn('Mailer is disabled (no mail host or alert recipient configured in DB/env). Alert emails will be skipped.');
    } else {
      this.logger.log(`Mailer configured from ${store?.mail_host ? 'DB' : 'env'}: host=${host}, to=${this.to}`);
    }

    this.transporter = nodemailer.createTransport({
      host: host || 'localhost',
      port,
      secure,
      auth: { user, pass },
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
