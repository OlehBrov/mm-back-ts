import * as koffi from 'koffi';
import * as path from 'path';

// Vendor Linux BPOS library (Ingenico SELF2000, "pure_c" flat API — see BPOSLib.h
// in this folder). Ships as a single .so with no non-glibc dependencies (verified
// via `ldd` inside node:20-slim — see project memory).
const lib = koffi.load(path.join(__dirname, 'libcBPOSLib.so.1.4.19'));

// Field sizes are not documented in BPOSLib.h — the library writes a
// NUL-terminated C string into whatever buffer we pass. These are generous
// fixed allocations; the ECRCommX docs mention receipt text up to 32648 bytes.
const SMALL_BUF = 128;
const RECEIPT_BUF = 33000;

function readCString(buf: Buffer): string {
  const nul = buf.indexOf(0);
  return buf.toString('utf8', 0, nul === -1 ? buf.length : nul);
}

function getString(fn: (buf: Buffer) => number, size = SMALL_BUF): string {
  const buf = Buffer.alloc(size);
  fn(buf);
  return readCString(buf);
}

const InitializeBPOS = lib.func('int BPOSLib_InitializeBPOS()');
const CommOpenTCPSync = lib.func('int BPOSLib_CommOpenTCP(const char*, const char*)');
const CommClose = lib.func('int BPOSLib_CommClose()');
const PurchaseFn = lib.func('int BPOSLib_Purchase(int, int, uint8)');
const ConfirmFn = lib.func('int BPOSLib_Confirm()');
const CancelFn = lib.func('int BPOSLib_Cancel()');
const LastResultFn = lib.func('uint8 BPOSLib_LastResult()');
const ResponseCodeFn = lib.func('int BPOSLib_ResponseCode()');
const TrnStatusFn = lib.func('uint8 BPOSLib_TrnStatus()');
const AmountFn = lib.func('int BPOSLib_Amount()');
const InvoiceNumFn = lib.func('int BPOSLib_InvoiceNum()');
const CheckConnectionFn = lib.func('int BPOSLib_CheckConnection(uint8)');
const PingFn = lib.func('int BPOSLib_Ping()');
const LastErrorCodeFn = lib.func('uint8 BPOSLib_LastErrorCode()');
const RRNFn = lib.func('int BPOSLib_RRN(char*)');
const AuthCodeFn = lib.func('int BPOSLib_AuthCode(char*)');
const PANFn = lib.func('int BPOSLib_PAN(char*)');
const LastErrorDescriptionFn = lib.func('int BPOSLib_LastErrorDescription(char*)');
const ReqCurrReceiptFn = lib.func('int BPOSLib_ReqCurrReceipt()');
const ReceiptFn = lib.func('int BPOSLib_Receipt(char*)');

export const BPOSLib = {
  initialize: (): number => InitializeBPOS(),
  // CommOpenTCP "has no timeout, just tries to open" per vendor docs — run it on
  // koffi's async (libuv threadpool) path so an unreachable terminal can't block
  // the Node event loop.
  commOpenTCP: (ip: string, port: string): Promise<number> =>
    new Promise((resolve, reject) => {
      CommOpenTCPSync.async(ip, port, (err: Error | null, result: number) =>
        err ? reject(err) : resolve(result),
      );
    }),
  commClose: (): number => CommClose(),
  // Ping/Purchase talk to the terminal and may block for the library's own timeout
  // (6 s) — keep them off the event loop, otherwise the whole backend freezes.
  ping: (): Promise<number> =>
    new Promise((resolve, reject) => {
      PingFn.async((err: Error | null, result: number) => (err ? reject(err) : resolve(result)));
    }),
  purchase: (amount: number, addAmount: number, merchIdx: number): Promise<number> =>
    new Promise((resolve, reject) => {
      PurchaseFn.async(amount, addAmount, merchIdx, (err: Error | null, result: number) =>
        err ? reject(err) : resolve(result),
      );
    }),
  confirm: (): number => ConfirmFn(),
  cancel: (): number => CancelFn(),
  lastErrorCode: (): number => LastErrorCodeFn(),
  lastResult: (): number => LastResultFn(),
  responseCode: (): number => ResponseCodeFn(),
  trnStatus: (): number => TrnStatusFn(),
  amount: (): number => AmountFn(),
  invoiceNum: (): number => InvoiceNumFn(),
  checkConnection: (merchIdx: number): number => CheckConnectionFn(merchIdx),
  rrn: (): string => getString(RRNFn),
  authCode: (): string => getString(AuthCodeFn),
  pan: (): string => getString(PANFn),
  lastErrorDescription: (): string => getString(LastErrorDescriptionFn),
  receipt: (): string => {
    ReqCurrReceiptFn();
    return getString(ReceiptFn, RECEIPT_BUF);
  },
};
