import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { ScheduleModule } from '@nestjs/schedule';
import { PrismaModule } from './database/prisma.module';
import { AuthModule } from './modules/auth/auth.module';
import { TerminalModule } from './modules/terminal/terminal.module';
import { FiscalModule } from './modules/fiscal/fiscal.module';
import { CartModule } from './modules/cart/cart.module';
import { KioskModule } from './modules/kiosk/kiosk.module';
import { StoreModule } from './modules/store/store.module';
import { ConfigStoreModule } from './modules/config/config.module';
import { AdminModule } from './modules/admin/admin.module';
import { StaticModule } from './modules/static/static.module';
import { MailerModule } from './modules/mailer/mailer.module';
import configuration from './config/configuration';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [configuration],
    }),
    EventEmitterModule.forRoot(),
    ScheduleModule.forRoot(),
    PrismaModule,
    MailerModule,
    AuthModule,
    TerminalModule,
    FiscalModule,
    CartModule,
    KioskModule,
    StoreModule,
    ConfigStoreModule,
    AdminModule,
    StaticModule,
  ],
})
export class AppModule {}
