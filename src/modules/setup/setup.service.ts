import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../database/prisma.service';
import { FiscalService, VchasnoTokenStatus } from '../fiscal/fiscal.service';
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
