// Author: Maksym Makarychev
// Company: Ingenico Group
// Date: 2017.10.25

#ifndef _Included_BPOSLib_
#define _Included_BPOSLib_

#ifdef __cplusplus
extern "C" {
#endif
/*
 * Class:     BPOSLib_
 * Method:    InitializeBPOS
 * Signature: 
 */
int BPOSLib_InitializeBPOS();

/*
 * Class:     BPOSLib_
 * Method:    UninitializeBPOS
 * Signature: 
 */
int BPOSLib_UninitializeBPOS();

/*
 * Class:     BPOSLib_
 * Method:    CommOpen
 * Signature: 
 */
int BPOSLib_CommOpen(const char*, int);

/*
 * Class:     BPOSLib_
 * Method:    CommOpenAuto
 * Signature: 
 */
int BPOSLib_CommOpenAuto(int);
  
/*
 * Class:     BPOSLib_
 * Method:    CommOpenTCP
 * Signature: 
 */
int BPOSLib_CommOpenTCP(const char*, const char*);

/*
 * Class:     BPOSLib_
 * Method:    CommClose
 * Signature: 
 */
int BPOSLib_CommClose();

/*
 * Class:     BPOSLib_
 * Method:    Confirm
 * Signature: 
 */
int BPOSLib_Confirm();

/*
 * Class:     BPOSLib_
 * Method:    Cancel
 * Signature: 
 */
int BPOSLib_Cancel();

/*
 * Class:     BPOSLib_
 * Method:    Purchase
 * Signature: 
 */
int BPOSLib_Purchase(int, int, unsigned char);
/*
 * Class:     BPOSLib_
 * Method:    Refund
 * Signature: 
 */
int BPOSLib_Refund(int, int, unsigned char, char*);

/*
 * Class:     BPOSLib_
 * Method:    Void
 * Signature: 
 */
int BPOSLib_Void(int, unsigned char);

/*
 * Class:     BPOSLib_
 * Method:    Settlement
 * Signature: 
 */
int BPOSLib_Settlement(unsigned char);
/*
 * Class:     BPOSLib
 * Method:    PrintBatchTotals
 * Signature: 
 */
int BPOSLib_PrintBatchTotals(unsigned char);

/*
 * Class:     BPOSLib
 * Method:    PurchaseService
 * Signature: 
 */
int BPOSLib_PurchaseService(unsigned char, int, char*);

/*
 * Class:     BPOSLib_
 * Method:    SetErrorLang
 * Signature: 
 */
int BPOSLib_SetErrorLang(unsigned char);
/*
 * Class:     BPOSLib
 * Method:    IdentifyCard
 * Signature: 
 */
int BPOSLib_IdentifyCard  (unsigned char, char*, unsigned char);

/*
 * Class:     BPOSLib_
 * Method:    LastResult
 * Signature: 
 */
unsigned char BPOSLib_LastResult();

/*
 * Class:     BPOSLib_
 * Method:    LastErrorCode
 * Signature: 
 */
unsigned char BPOSLib_LastErrorCode();

/*
 * Class:     BPOSLib_
 * Method:    ResponseCode
 * Signature: 
 */
int BPOSLib_ResponseCode();

/*
 * Class:     BPOSLib
 * Method:    RRN
 * Signature: 
 */
int  BPOSLib_RRN(char*);

/*
 * Class:     BPOSLib
 * Method:    TxnType
 * Signature: 
 */
unsigned char BPOSLib_TxnType();

/*
 * Class:     BPOSLib
 * Method:    TerminalID
 * Signature: 
 */
int BPOSLib_TerminalID(char*);

/*
 * Class:     BPOSLib
 * Method:    MerchantID
 * Signature: 
 */
int BPOSLib_MerchantID(char*);

/*
 * Class:     BPOSLib
 * Method:    AuthCode
 * Signature: 
 */
int BPOSLib_AuthCode(char*);
/*
 * Class:     BPOSLib
 * Method:    LastErrorDescription
 * Signature: 
 */
int BPOSLib_LastErrorDescription(char*);

/*
 * Class:     BPOSLib_
 * Method:    LastStatMsgCode
 * Signature: 
 */
unsigned char BPOSLib_LastStatMsgCode ();

/*
 * Class:     BPOSLib_
 * Method:    LastStatMsgDescription
 * Signature: 
 */
int BPOSLib_LastStatMsgDescription(char*);
/*
 * Class:     BPOSLib
 * Method:    PAN
 * Signature: 
 */
int BPOSLib_PAN(char*);

/*
 * Class:     BPOSLib
 * Method:    ExpDate
 * Signature: 
 */
int BPOSLib_ExpDate(char*);

/*
 * Class:     BPOSLib
 * Method:    CardHolder
 * Signature: 
 */
int BPOSLib_CardHolder(char*);

/*
 * Class:     BPOSLib
 * Method:    IssueName
 * Signature: 
 */
int BPOSLib_IssueName(char*);

/*
 * Class:     BPOSLib
 * Method:    InvoiceNum
 * Signature: 
 */
int BPOSLib_InvoiceNum();

/*
 * Class:     BPOSLib
 * Method:    TotalsDebitAmt
 * Signature: 
 */
int BPOSLib_TotalsDebitAmt();

/*
 * Class:     BPOSLib
 * Method:    TotalsDebitNum
 * Signature: 
 */
int BPOSLib_TotalsDebitNum();

/*
 * Class:     BPOSLib
 * Method:    TotalsCreditAmt
 * Signature: 
 */
int BPOSLib_TotalsCreditAmt();

/*
 * Class:     BPOSLib
 * Method:    TotalsCreditNum
 * Signature: 
 */
int BPOSLib_TotalsCreditNum();

/*
 * Class:     BPOSLib
 * Method:    TotalsCancelledAmt
 * Signature: 
 */
int BPOSLib_TotalsCancelledAmt();

/*
 * Class:     BPOSLib
 * Method:    TotalsCancelledNum
 * Signature: 
 */
int BPOSLib_TotalsCancelledNum();

/*
 * Class:     BPOSLib
 * Method:    SignVerif
 * Signature: 
 */
unsigned char BPOSLib_SignVerif();

/*
 * Class:     BPOSLib
 * Method:    Receipt
 * Signature: 
 */
int BPOSLib_Receipt(char*);

/*
 * Class:     BPOSLib
 * Method:    emvAID
 * Signature: 
 */
int BPOSLib_emvAID(char*);

/*
 * Class:     BPOSLib
 * Method:    EntryMode
 * Signature: 
 */
unsigned char BPOSLib_EntryMode();

/*
 * Class:     BPOSLib
 * Method:    TxnNum
 * Signature: 
 */
int BPOSLib_TxnNum();

/*
 * Class:     BPOSLib
 * Method:    Amount
 * Signature: 
 */
int BPOSLib_Amount();

/*
 * Class:     BPOSLib
 * Method:    AddAmount
 * Signature: 
 */
int BPOSLib_AddAmount();

/*
 * Class:     BPOSLib
 * Method:    TermStatus
 * Signature: 
 */
unsigned char BPOSLib_TermStatus();

/*
 * Class:     BPOSLib
 * Method:    Key
 * Signature: 
 */
unsigned char BPOSLib_Key();

/*
 * Class:     BPOSLib
 * Method:    Track3
 * Signature: 
 */
int BPOSLib_Track3(char*);

/*
 * Class:     BPOSLib
 * Method:    TrnStatus
 * Signature: 
 */
unsigned char BPOSLib_TrnStatus();

/*
 * Class:     BPOSLib
 * Method:    Currency
 * Signature: 
 */
int BPOSLib_Currency(char*);

/*
 * Class:     BPOSLib
 * Method:    TrnBatchNum
 * Signature: 
 */
int BPOSLib_TrnBatchNum();

/*
 * Class:     BPOSLib
 * Method:    RNK
 * Signature: 
 */
int BPOSLib_RNK(char*);

/*
 * Class:     BPOSLib
 * Method:    CurrencyCode
 * Signature: 
 */
int BPOSLib_CurrencyCode(char*);

/*
 * Class:     BPOSLib
 * Method:    AddData
 * Signature: 
 */
int BPOSLib_AddData(char*);

/*
 * Class:     BPOSLib
 * Method:    TerminalInfo
 * Signature: 
 */
int BPOSLib_TerminalInfo(char*);

/*
 * Class:     BPOSLib
 * Method:    DiscountName
 * Signature: 
 */
int BPOSLib_DiscountName(char*);

/*
 * Class:     BPOSLib
 * Method:    DiscountAttribute
 * Signature: 
 */
int BPOSLib_DiscountAttribute();

/*
 * Class:     BPOSLib
 * Method:    ECRDataTM
 * Signature: 
 */
int BPOSLib_ECRDataTM(char*);

/*
 * Class:     BPOSLib
 * Method:    LibraryVersion
 * Signature: 
 */
int BPOSLib_LibraryVersion(char*);

/*
 * Class:     BPOSLib
 * Method:    ScenarioData
 * Signature: 
 */
int BPOSLib_ScenarioData(char*);

/*
 * Class:     BPOSLib
 * Method:    GetTxnNum
 * Signature: 
 */
int BPOSLib_GetTxnNum();

/*
 * Class:     BPOSLib
 * Method:    GetTxnDataByOrder
 * Signature: 
 */
int BPOSLib_GetTxnDataByOrder(int);

/*
 * Class:     BPOSLib
 * Method:    GetTxnDataByInv
 * Signature: 
 */
int BPOSLib_GetTxnDataByInv(int, unsigned char);

/*
 * Class:     BPOSLib
 * Method:    GetBatchTotals
 * Signature: 
 */
int BPOSLib_GetBatchTotals(unsigned char);

/*
 * Class:     BPOSLib
 * Method:    CheckConnection
 * Signature: 
 */
int BPOSLib_CheckConnection(unsigned char);

/*
 * Class:     BPOSLib
 * Method:    ReqCurrReceipt
 * Signature: 
 */
int BPOSLib_ReqCurrReceipt();

/*
 * Class:     BPOSLib
 * Method:    PrintLastSettleCopy
 * Signature: 
 */
int BPOSLib_PrintLastSettleCopy(unsigned char);

/*
 * Class:     BPOSLib
 * Method:    PrintBatchJournal
 * Signature: 
 */
int BPOSLib_PrintBatchJournal(unsigned char);

/*
 * Class:     BPOSLib
 * Method:    ReqReceiptByInv
 * Signature: 
 */
int BPOSLib_ReqReceiptByInv(int, unsigned char);

/*
 * Class:     BPOSLib
 * Method:    SetControlMode
 * Signature: 
 */
int BPOSLib_SetControlMode(bool);

/*
 * Class:     BPOSLib
 * Method:    ReadKey
 * Signature: 
 */
int BPOSLib_ReadKey(unsigned char);

/*
 * Class:     BPOSLib
 * Method:    DisplayText
 * Signature: 
 */
int BPOSLib_DisplayText(unsigned char);

/*
 * Class:     BPOSLib
 * Method:    SetLine
 * Signature: 
 */
int BPOSLib_SetLine(unsigned char, unsigned char, char*, unsigned char);

/*
 * Class:     BPOSLib
 * Method:    ExchangeStatuses
 * Signature: 
 */
int BPOSLib_ExchangeStatuses(unsigned char);

/*
 * Class:     BPOSLib
 * Method:    Completion
 * Signature: 
 */
int BPOSLib_Completion(unsigned char, int, char*, int);

/*
 * Class:     BPOSLib
 * Method:    ReadCard
 * Signature: 
 */
int BPOSLib_ReadCard();

/*
 * Class:     BPOSLib
 * Method:    Balance
 * Signature: 
 */
int BPOSLib_Balance(unsigned char, char*, unsigned char);

/*
 * Class:     BPOSLib
 * Method:    Deposit
 * Signature: 
 */
int BPOSLib_Deposit(unsigned char, int, char*, unsigned char);

/*
 * Class:     BPOSLib
 * Method:    POSGetInfo
 * Signature: 
 */
int BPOSLib_POSGetInfo();

/*
 * Class:     BPOSLib
 * Method:    POSExTransaction
 * Signature: 
 */
int BPOSLib_POSExTransaction();

/*
 * Class:     BPOSLib
 * Method:    SelectApp
 * Signature: 
 */
int BPOSLib_SelectApp(char*, int);

/*
 * Class:     BPOSLib
 * Method:    CloseApp
 * Signature: 
 */
int BPOSLib_CloseApp();

/*
 * Class:     BPOSLib
 * Method:    StartScenario
 * Signature: 
 */
int BPOSLib_StartScenario(int, char*);

/*
 * Class:     BPOSLib
 * Method:    SetExtraPrintData
 * Signature: 
 */
int BPOSLib_SetExtraPrintData(char*);

/*
 * Class:     BPOSLib
 * Method:    SetExtraXmlData
 * Signature: 
 */
int BPOSLib_SetExtraXmlData(char*);

/*
 * Class:     BPOSLib
 * Method:    useLogging
 * Signature: 
 */
int BPOSLib_useLogging(unsigned char, char*);

/*
 * Class:     BPOSLib
 * Method:    SendFile
 * Signature: 
 */
int BPOSLib_SendFile(char*, unsigned char, unsigned char);

/*
 * Class:     BPOSLib
 * Method:    SetScreen
 * Signature: 
 */
int BPOSLib_SetScreen(int);

/*
 * Class:     BPOSLib
 * Method:    CorrectTransaction
 * Signature: 
 */
int BPOSLib_CorrectTransaction(int, int);

/*
 * Class:     BPOSLib
 * Method:    CashAdvance
 * Signature: 
 */
int BPOSLib_CashAdvance(unsigned char, int, char*, unsigned char);

/*
 * Class:     BPOSLib
 * Method:    ReadBankCard
 * Signature: 
 */
int BPOSLib_ReadBankCard();

/*
 * Class:     BPOSLib
 * Method:    FlagAcquirer
 * Signature: 
 */
int BPOSLib_FlagAcquirer();

/*
 * Class:     BPOSLib
 * Method:    CryptedData
 * Signature: 
 */
int BPOSLib_CryptedData(char*);

/*
 * Class:     BPOSLib
 * Method:    ExtraCardData
 * Signature: 
 */
int BPOSLib_ExtraCardData(char*);

/*
 * Class:     BPOSLib
 * Method:    Ping
 * Signature: 
 */
int BPOSLib_Ping();

/*
 * Class:     BPOSLib
 * Method:    CheckTerminal
 * Signature: 
 */
int BPOSLib_CheckTerminal();

/*
 * Class:     BPOSLib
 * Method:    ReqDataFile
 * Signature: 
 */
int BPOSLib_ReqDataFile();

/*
 * Class:     BPOSLib
 * Method:    SlipPrinted
 * Signature: 
 */
unsigned char BPOSLib_SlipPrinted();

/*
 * Class:     BPOSLib
 * Method:    PanHash
 * Signature: 
 */
int BPOSLib_PanHash(char*);

/*
 * Class:     BPOSLib
 * Method:    DataFile
 * Signature: 
 */
int BPOSLib_DataFile(char*);

/*
 * Class:     BPOSLib
 * Method:    UseMac
 * Signature: 
 */
int BPOSLib_UseMac(unsigned char, char*);


#ifdef __cplusplus
}
#endif
#endif
