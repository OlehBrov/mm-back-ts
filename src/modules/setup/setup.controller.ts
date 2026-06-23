import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Put } from '@nestjs/common';
import { SetupService } from './setup.service';
import { UpdateStoreInfoDto } from './dto/store-info.dto';
import { UpsertTerminalConfigDto } from './dto/terminal-config.dto';
import { UpsertFiscalConfigDto } from './dto/fiscal-config.dto';
import { AssignMerchantsDto } from './dto/assign-merchants.dto';

@Controller('setup')
export class SetupController {
  constructor(private readonly setupService: SetupService) {}

  /** Full config snapshot: store info + all terminal configs + all fiscal configs */
  @Get()
  getSetup() {
    return this.setupService.getSetup();
  }

  /** Update store basic info (name, address, active_bank, alert_email) */
  @Patch('store')
  updateStoreInfo(@Body() dto: UpdateStoreInfoDto) {
    return this.setupService.updateStoreInfo(dto);
  }

  /** Upsert terminal config for a specific bank ('monobank' | 'privatbank') */
  @Put('terminal/:bank')
  upsertTerminalConfig(
    @Param('bank') bank: string,
    @Body() dto: UpsertTerminalConfigDto,
  ) {
    return this.setupService.upsertTerminalConfig(bank, dto);
  }

  /**
   * Check if the terminal for the given bank is reachable and get its merchants.
   * Only works if the requested bank matches the currently running active terminal.
   */
  @Post('terminal/:bank/check')
  @HttpCode(200)
  checkTerminal(@Param('bank') bank: string) {
    return this.setupService.checkTerminal(bank);
  }

  /**
   * Assign merchants to roles (no-VAT / VAT) in Store.
   * Also creates placeholder FiscalConfig records for each assigned merchant.
   */
  @Post('assign-merchants')
  @HttpCode(200)
  assignMerchants(@Body() dto: AssignMerchantsDto) {
    return this.setupService.assignMerchants(dto.default_merchant, dto.vat_merchant ?? null);
  }

  /** Upsert fiscal config for a merchant */
  @Put('fiscal/:merchantId')
  upsertFiscalConfig(
    @Param('merchantId') merchantId: string,
    @Body() dto: UpsertFiscalConfigDto,
  ) {
    return this.setupService.upsertFiscalConfig(merchantId, dto);
  }

  /** Verify current token for a merchant against vchasno API */
  @Post('fiscal/:merchantId/verify')
  @HttpCode(200)
  verifyFiscalToken(@Param('merchantId') merchantId: string) {
    return this.setupService.verifyFiscalToken(merchantId);
  }

  /** Delete fiscal config for a merchant */
  @Delete('fiscal/:merchantId')
  @HttpCode(200)
  deleteFiscalConfig(@Param('merchantId') merchantId: string) {
    return this.setupService.deleteFiscalConfig(merchantId);
  }
}
