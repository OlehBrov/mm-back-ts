import { Body, Controller, Get, HttpCode, Post } from '@nestjs/common';
import { FiscalService } from './fiscal.service';
import { SetFiscalTokensDto } from './dto/fiscal-tokens.dto';

@Controller('fiscal')
export class FiscalController {
  constructor(private readonly fiscalService: FiscalService) {}

  /** Returns current tokens (from DB or env fallback) and their live vchasno status. */
  @Get('tokens')
  getFiscalTokenStatus() {
    return this.fiscalService.getFiscalTokenStatus();
  }

  /** Saves tokens to DB and returns their live vchasno status. */
  @Post('tokens')
  @HttpCode(200)
  setFiscalTokens(@Body() body: SetFiscalTokensDto) {
    return this.fiscalService.saveFiscalTokens(body.token, body.tokenVat ?? null);
  }
}
