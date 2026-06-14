import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { TerminalService } from './terminal.service';
import { PrivatBankTerminalService } from './providers/privatbank/privatbank-terminal.service';
import { MonoBankTerminalService } from './providers/monobank/monobank-terminal.service';
import { TERMINAL_PROVIDER } from './constants';
import { PrismaService } from '../../database/prisma.service';

@Module({
  providers: [
    PrivatBankTerminalService,
    MonoBankTerminalService,
    {
      provide: TERMINAL_PROVIDER,
      useFactory: async (
        config: ConfigService,
        events: EventEmitter2,
        prisma: PrismaService,
        privatbank: PrivatBankTerminalService,
        monobank: MonoBankTerminalService,
      ): Promise<PrivatBankTerminalService | MonoBankTerminalService> => {
        // Read active_bank from DB (per-store config), fall back to env
        const store = await prisma.store.findFirst({ select: { active_bank: true } });
        const activeBank =
          store?.active_bank ?? config.get<string>('terminal.provider') ?? 'privatbank';

        const active = activeBank === 'monobank' ? monobank : privatbank;
        // Mark the chosen service so its onModuleInit actually connects.
        // NestJS calls onModuleInit AFTER all factory providers are resolved.
        active.shouldConnect = true;

        return active;
      },
      inject: [ConfigService, EventEmitter2, PrismaService, PrivatBankTerminalService, MonoBankTerminalService],
    },
    TerminalService,
  ],
  exports: [TerminalService],
})
export class TerminalModule {}
