import { Controller, Post } from '@nestjs/common';
import { IdleSyncService } from './idle-sync.service';

@Controller('admin/kiosk')
export class KioskController {
  constructor(private readonly idleSync: IdleSyncService) {}

  @Post('sync')
  async triggerSync() {
    const errors = await this.idleSync.syncDebug();
    return { message: 'Sync triggered', errors };
  }
}
