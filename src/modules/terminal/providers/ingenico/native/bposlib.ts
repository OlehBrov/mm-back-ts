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
const ExchangeStatusesFn = lib.func('int BPOSLib_ExchangeStatuses(uint8)');
const SetControlModeFn = lib.func('int BPOSLib_SetControlMode(bool)');
const SetLineFn = lib.func('int BPOSLib_SetLine(uint8, uint8, char*, uint8)');
const DisplayTextFn = lib.func('int BPOSLib_DisplayText(uint8)');
const TermStatusFn = lib.func('uint8 BPOSLib_TermStatus()');
const LastErrorCodeFn = lib.func('uint8 BPOSLib_LastErrorCode()');
const RRNFn = lib.func('int BPOSLib_RRN(char*)');
const AuthCodeFn = lib.func('int BPOSLib_AuthCode(char*)');
const PANFn = lib.func('int BPOSLib_PAN(char*)');
const TerminalIDFn = lib.func('int BPOSLib_TerminalID(char*)');
const IssueNameFn = lib.func('int BPOSLib_IssueName(char*)');
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
  // Purchase talks to the terminal and may block for the library's own timeout (6 s) —
  // keep it off the event loop, otherwise the whole backend freezes.
  purchase: (amount: number, addAmount: number, merchIdx: number): Promise<number> =>
    new Promise((resolve, reject) => {
      PurchaseFn.async(amount, addAmount, merchIdx, (err: Error | null, result: number) =>
        err ? reject(err) : resolve(result),
      );
    }),
  // ECR heartbeat: tells the terminal "ECR is alive" (status 2 = normal mode) and returns the
  // terminal status. Without it the terminal shows "ECR not connected" after 15 s.
  exchangeStatuses: (ecrStatus: number): Promise<number> =>
    new Promise((resolve, reject) => {
      ExchangeStatusesFn.async(ecrStatus, (err: Error | null, result: number) =>
        err ? reject(err) : resolve(result),
      );
    }),
  termStatus: (): number => TermStatusFn(),
  // Display/keyboard "control mode" (UNATTENDED POS): the ECR draws text on the terminal.
  setControlMode: (on: boolean): Promise<number> =>
    new Promise((resolve, reject) => {
      SetControlModeFn.async(on, (err: Error | null, result: number) =>
        err ? reject(err) : resolve(result),
      );
    }),
  setLine: (row: number, col: number, text: Buffer, invert: number): Promise<number> =>
    new Promise((resolve, reject) => {
      SetLineFn.async(row, col, text, invert, (err: Error | null, result: number) =>
        err ? reject(err) : resolve(result),
      );
    }),
  displayText: (beep: number): Promise<number> =>
    new Promise((resolve, reject) => {
      DisplayTextFn.async(beep, (err: Error | null, result: number) =>
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
  rrn: (): string => getString(RRNFn),
  authCode: (): string => getString(AuthCodeFn),
  pan: (): string => getString(PANFn),
  terminalId: (): string => getString(TerminalIDFn),
  issuerName: (): string => getString(IssueNameFn),
  lastErrorDescription: (): string => getString(LastErrorDescriptionFn),
  receipt: (): string => {
    ReqCurrReceiptFn();
    return getString(ReceiptFn, RECEIPT_BUF);
  },
};
