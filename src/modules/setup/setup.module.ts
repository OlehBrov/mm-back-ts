import { Module } from '@nestjs/common';
import { SetupService } from './setup.service';
import { SetupController } from './setup.controller';
import { FiscalModule } from '../fiscal/fiscal.module';

@Module({
  imports: [FiscalModule],
  controllers: [SetupController],
  providers: [SetupService],
})
export class SetupModule {}
