import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../database/prisma.service';
import { FiscalService, VchasnoTokenStatus } from '../fiscal/fiscal.service';
import { TerminalService } from '../terminal/terminal.service';
import { MerchantInfo } from '../terminal/interfaces/terminal-provider.interface';
import { UpdateStoreInfoDto } from './dto/store-info.dto';
import { UpsertTerminalConfigDto } from './dto/terminal-config.dto';
import { UpsertFiscalConfigDto } from './dto/fiscal-config.dto';

@Injectable()
export class SetupService {
  private readonly storeAuthId: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly fiscal: FiscalService,
    private readonly terminal: TerminalService,
  ) {
    this.storeAuthId = config.get<string>('store.authId') ?? '';
  }

  async getSetup() {
    const [store, terminalConfigs, fiscalConfigs] = await Promise.all([
      this.prisma.store.findFirst({
        where: { auth_id: this.storeAuthId },
        select: {
          store_name: true,
          store_address: true,
          active_bank: true,
          alert_email: true,
          default_merchant: true,
          VAT_excise_merchant: true,
          is_single_merchant: true,
        },
      }),
      this.prisma.terminalConfig.findMany({ orderBy: { bank: 'asc' } }),
      this.prisma.fiscalConfig.findMany({ orderBy: { merchant_id: 'asc' } }),
    ]);

    return { store, terminalConfigs, fiscalConfigs };
  }

  async updateStoreInfo(dto: UpdateStoreInfoDto) {
    return this.prisma.store.update({
      where: { auth_id: this.storeAuthId },
      data: {
        store_name: dto.store_name,
        store_address: dto.store_address,
        active_bank: dto.active_bank,
        alert_email: dto.alert_email,
      },
      select: {
        store_name: true,
        store_address: true,
        active_bank: true,
        alert_email: true,
      },
    });
  }

  async upsertTerminalConfig(bank: string, dto: UpsertTerminalConfigDto) {
    return this.prisma.terminalConfig.upsert({
      where: { bank },
      create: { bank, ...dto },
      update: { ...dto },
    });
  }

  async checkTerminal(bank: string): Promise<{
    online: boolean;
    merchants: MerchantInfo[];
    error?: string;
    terminalConfig: { host: string | null; port: number | null } | null;
  }> {
    // The server only has one active terminal running (set at startup).
    // We compare the requested bank to the active_bank in DB.
    const store = await this.prisma.store.findFirst({
      where: { auth_id: this.storeAuthId },
      select: { active_bank: true },
    });
    const activeBank =
      store?.active_bank ?? this.config.get<string>('terminal.provider') ?? 'privatbank';

    const terminalConfig = await this.prisma.terminalConfig.findUnique({ where: { bank } });

    if (bank !== activeBank) {
      return {
        online: false,
        merchants: [],
        terminalConfig,
        error: `Термінал "${bank}" не активний на сервері. Оберіть його як активний, збережіть і перезапустіть сервер.`,
      };
    }

    // Retry up to 3 times — terminal may be in sleep/power-save mode and need
    // a few seconds to wake up before it can respond to PingDevice.
    const MAX_ATTEMPTS = 3;
    const RETRY_DELAY_MS = 3000;
    let online = false;
    for (let i = 0; i < MAX_ATTEMPTS; i++) {
      online = await this.terminal.checkConnection();
      if (online) break;
      if (i < MAX_ATTEMPTS - 1) {
        await new Promise<void>((r) => setTimeout(r, RETRY_DELAY_MS));
      }
    }

    if (!online) {
      return { online: false, merchants: [], terminalConfig };
    }

    try {
      const merchants = await this.terminal.getMerchants();
      return { online: true, merchants, terminalConfig };
    } catch {
      return { online: true, merchants: [], terminalConfig };
    }
  }

  async assignMerchants(
    defaultMerchant: string,
    vatMerchant: string | null,
  ): Promise<{ ok: boolean; default_merchant: string; vat_merchant: string | null }> {
    const isSingle = vatMerchant === null;

    await this.prisma.store.updateMany({
      data: {
        default_merchant: defaultMerchant,
        VAT_excise_merchant: vatMerchant,
        is_single_merchant: isSingle,
      },
    });

    await this.prisma.fiscalConfig.upsert({
      where: { merchant_id: defaultMerchant },
      create: { merchant_id: defaultMerchant },
      update: {},
    });

    if (vatMerchant) {
      await this.prisma.fiscalConfig.upsert({
        where: { merchant_id: vatMerchant },
        create: { merchant_id: vatMerchant },
        update: {},
      });
    }

    return { ok: true, default_merchant: defaultMerchant, vat_merchant: vatMerchant };
  }

  async upsertFiscalConfig(
    merchantId: string,
    dto: UpsertFiscalConfigDto,
  ): Promise<{ config: object; tokenStatus: VchasnoTokenStatus | null }> {
    const config = await this.prisma.fiscalConfig.upsert({
      where: { merchant_id: merchantId },
      create: { merchant_id: merchantId, ...dto },
      update: { ...dto },
    });

    const tokenStatus = config.fiscal_token
      ? await this.fiscal.verifyToken(config.fiscal_token)
      : null;

    return { config, tokenStatus };
  }

  async verifyFiscalToken(merchantId: string): Promise<VchasnoTokenStatus> {
    const config = await this.prisma.fiscalConfig.findUnique({
      where: { merchant_id: merchantId },
    });
    return this.fiscal.verifyToken(config?.fiscal_token ?? '');
  }

  async deleteFiscalConfig(merchantId: string) {
    await this.prisma.fiscalConfig.delete({ where: { merchant_id: merchantId } });
    return { deleted: merchantId };
  }
}
