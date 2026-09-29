import { Global, Module } from '@nestjs/common';
import { PricingService } from './pricing.service';

// Global: both StoreModule (product listings) and CartModule (quote + sell) need it,
// same pattern as TerminalModule.
@Global()
@Module({
  providers: [PricingService],
  exports: [PricingService],
})
export class PricingModule {}
