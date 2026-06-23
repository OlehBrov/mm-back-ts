import { Controller, Get } from '@nestjs/common';
import { FiscalService } from './fiscal.service';

@Controller('fiscal')
export class FiscalController {
  constructor(private readonly fiscalService: FiscalService) {}

  @Get('queue/pending')
  getPendingCount() {
    return this.fiscalService.getPendingCount();
  }

  @Get('queue/failed')
  getFailedJobs() {
    return this.fiscalService.getFailedJobs();
  }
}
