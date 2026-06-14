export interface FiscalPayload {
  dt: string;
  tag: string;
  cashier: string;
  withVat: boolean;       // internal flag — stripped before sending to API
  fiscal: {
    task: number;
    receipt: {
      sum: number;
      round: number;
      comment_up: string;
      comment_down: string;
      rows: FiscalRow[];
      pays: FiscalPay[];
    };
  };
}

export interface FiscalRow {
  code: string;
  code1: string;    // barcode — sent as string, API may return as number
  code_a: string;
  name: string;
  cnt: number;
  price: number;
  disc: number;
  cost: number;
  taxgrp: number;
}

export interface FiscalPay {
  type: number;
  sum: number;
  comment: string;
  paysys: string;
  rrn: string;
  cardmask: string;
  term_id: string;
  bank_id: string;
  auth_code: string;
}

// Per-product tax info from vchasno.kasa fiscal document
export interface FiscalTax {
  tg_name: string;
  tg_print: string;
  tax_percent: string;
  tax_sum: string;
  dt_percent: string;
  dt_sum: string;
  dt_caption: string;
}

export interface FiscalItem {
  code1: string | number;  // barcode — vchasno returns as number
  tg_print: string;
  discount?: { sum: number };
}

// Full document returned by GET /c/{doccode}.json
export interface FiscalDocument {
  fiscal_number: string;
  company_name: string;
  company_edrpou: string;
  rro_fiscal_number: string;
  date_created: string;
  check_url: string;
  target_url: string;
  data: {
    items: FiscalItem[];
    taxes: FiscalTax[];
  };
}
