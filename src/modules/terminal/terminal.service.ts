import { Inject, Injectable } from '@nestjs/common';
import { TERMINAL_PROVIDER } from './constants';
import {
  ITerminalProvider,
  PaymentRequest,
  PaymentResponse,
  MerchantInfo,
} from './interfaces/terminal-provider.interface';

@Injectable()
export class TerminalService {
  constructor(
    @Inject(TERMINAL_PROVIDER)
    private readonly provider: ITerminalProvider,
  ) {}

  sendPayment(request: PaymentRequest): Promise<PaymentResponse> {
    return this.provider.sendPayment(request);
  }

  cancelPayment(): Promise<void> {
    return this.provider.cancelPayment();
  }

  getMerchants(): Promise<MerchantInfo[]> {
    return this.provider.getMerchants();
  }

  checkConnection(): Promise<boolean> {
    return this.provider.checkConnection();
  }

  getStatus(): 'online' | 'offline' {
    return this.provider.getStatus();
  }
}
