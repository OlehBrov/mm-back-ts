import { Injectable } from '@nestjs/common';
import { FiscalPayload } from './dto/fiscal-job.dto';
import { PaymentResponse } from '../terminal/interfaces/terminal-provider.interface';

export interface CartProduct {
  product_code?: string;
  barcode: string;
  mark?: string;
  product_name: string;
  inCartQuantity: number;
  product_price: number;
  priceDecrement: number;
  taxGroup: number;
}

export interface CartProductsObject {
  cartProducts: CartProduct[];
}

@Injectable()
export class ReceiptBuilderService {
  build(cart: CartProductsObject, terminalResponse: PaymentResponse, withVat: boolean): FiscalPayload {
    const params = terminalResponse.params;

    const transactionDate = (params.date as string).split('/').reverse().join('');
    const transactionTime = (params.time as string).split(':').join('');
    const dt = transactionDate.concat(transactionTime);

    const rows = cart.cartProducts.map((prod) => {
      const cost = parseFloat((prod.product_price * prod.inCartQuantity).toFixed(2));
      const disc = parseFloat((prod.priceDecrement * prod.inCartQuantity).toFixed(2));
      return {
        code: prod.product_code ?? '',
        code1: prod.barcode,
        code_a: prod.mark ?? '0',
        name: prod.product_name,
        cnt: prod.inCartQuantity,
        price: parseFloat(String(prod.product_price)),
        disc,
        cost,
        taxgrp: prod.taxGroup,
      };
    });

    return {
      dt,
      tag: '',  // filled with a stable UUID by FiscalService.enqueue() before persisting
      cashier: 'Касир_00',
      withVat,
      fiscal: {
        task: 1,
        receipt: {
          sum: parseFloat(params.amount as string),
          round: 0.0,
          comment_up: 'Ваші покупки',
          comment_down: 'Дякуємо за покупку',
          rows,
          pays: [
            {
              type: 2,
              sum: parseFloat(params.amount as string),
              comment: '',
              paysys: params.paymentSystem as string,
              rrn: params.rrn as string,
              cardmask: params.pan as string,
              term_id: (params.terminalId as string) ?? '',
              bank_id: params.bankAcquirer as string,
              auth_code: params.approvalCode as string,
            },
          ],
        },
      },
    };
  }
}
