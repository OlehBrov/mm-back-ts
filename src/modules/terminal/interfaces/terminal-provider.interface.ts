export interface PaymentRequest {
  amount: number;       // in kopecks (e.g. 10050 = 100.50 UAH)
  merchantId: string;
  currency?: string;    // default '980' (UAH)
}

export interface PaymentResponse {
  method: string;
  params: {
    trnStatus: string;
    transAmount?: string;
    transDate?: string;
    transTime?: string;
    approvalCode?: string;
    rrn?: string;
    pan?: string;
    cardBrand?: string;
    bankAcquirer?: string;
    subMerchant?: string;
    [key: string]: unknown;
  };
  [key: string]: unknown;
}

export interface MerchantInfo {
  merchantId: string;
  merchantName?: string;
  taxgrp?: number;
  [key: string]: unknown;
}

export interface ITerminalProvider {
  sendPayment(request: PaymentRequest): Promise<PaymentResponse>;
  cancelPayment(): Promise<void>;
  getMerchants(): Promise<MerchantInfo[]>;
  checkConnection(): Promise<boolean>;
  getStatus(): 'online' | 'offline';
}
