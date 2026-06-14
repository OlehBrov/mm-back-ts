import { Controller, Get, InternalServerErrorException, Param } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Controller('reciept-proxy')
export class ReceiptProxyController {
  private readonly fiscalHost: string;

  constructor(config: ConfigService) {
    this.fiscalHost = config.get<string>('fiscal.host') ?? 'https://kasa.vchasno.ua';
  }

  @Get(':id')
  async getReceipt(@Param('id') id: string) {
    const response = await fetch(`${this.fiscalHost}/c/${id}.json`);
    if (!response.ok) {
      throw new InternalServerErrorException(`Failed to fetch receipt ${id}`);
    }
    const data = await response.json();
    return { data, message: 'Tax reciept' };
  }
}
