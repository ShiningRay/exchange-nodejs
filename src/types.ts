/**
 * Generated TypeScript interfaces mirroring service.proto messages.
 * Field names preserve original casing via proto-loader keepCase: true.
 */

// Account service messages
export interface CreateAccountRequest { userId: string }
export interface CreateAccountResponse { userId: string }

export interface AccountOrderRequest {
  market: string
  userId: string
  id: string
  price: number | string
  amount: number | string
  side: string
  type: string
  source: string
}

export interface AccountBatchOrderRequest { orders: AccountOrderRequest[] }

export interface AccountBatchOrderResponse { response: AccountOrderResponse[] }

export interface QueryOrderRequest {
  market: string
  userId: string
  limit: number
  offset: number
}

export interface AccountOrderModel {
  Id: string
  CreateTime: number | string
  Price: number | string
  UserId: string
  Side: string
  LeftAmount: number | string
  LeftFunds: number | string
  FilledFunds: number | string
  FilledAmount: number | string
  Market: string
  Type: string
}

export interface FinishOrder {
  Id: string
  CreateTime: number | string
  Price: number | string
  Amount: number | string
  Side: string
}

export interface AccountOrderResponse {
  success: boolean
  code: string
  order?: AccountOrderModel
}

export interface FinishedOrderResponse {
  success: boolean
  orders: AccountOrderModel[]
}

export interface AccountOrderList {
  success: boolean
  orders: AccountOrderModel[]
}

export interface BalanceQueryRequest {
  userId: string
  tokens: string[]
}

export interface BalanceRequest {
  token: string
  userId: string
  amount: number | string
  rid: string
}

export interface AlterRequest {
  token: string
  action: string
  amount: number | string
  fee: number | string
  userId: string
  bizType: string
  bizId: string
}

export interface AccountResponse { success: boolean; code: string }

export interface BalanceItem { total: number | string; frozen: number | string; available: number | string }

export interface BalanceResponse { success: boolean; data: Record<string, BalanceItem> }

// Market service messages
export interface CreateMarketRequest {
  name: string
  token1: string
  token2: string
  minAmount: number | string
  takerFee: number | string
  makerFee: number | string
}

export interface CreateMarketResponse { success: boolean }

export interface UpdateMarketRequest {
  name: string
  minAmount: number | string
  takerFee: number | string
  makerFee: number | string
  status: number | string
}

export interface UpdateMarketResponse { success: boolean }

export interface PublishRequest {
  startTime: string
  endTime: string
  market: string
}

export interface MarketOrderRequest {
  market: string
  userId: string
  id: string
  price: number | string
  amount: number | string
  funds: number | string
  side: string
  type: string
}

export interface MarketOrderModel {
  Id: string
  CreateTime: number | string
  UpdateTime: number | string
  Price: number | string
  LeftAmount: number | string
  FilledAmount: number | string
  LeftFunds: number | string
  FilledFunds: number | string
  Uid: string
  Side: string
}

export interface OrderReply { message: string }

export interface MarketResponse {
  success: boolean
  code: string
  current_price: number | string
  left: number | string
}

export interface DepthRequest {
  market: string
  limit: number
  group: number
}

export interface DepthResponse {
  success: boolean
  current_price: number | string
  bids: Record<string, string>
  asks: Record<string, string>
  current_side: string
}

export interface OrderBookResponse {
  success: boolean
  bids: MarketOrderModel[]
  asks: MarketOrderModel[]
}

export interface DealOrderModel {
  timestamp: number | string
  price: number | string
  amount: number | string
  side: string
}

export interface DealRecordResponse {
  success: boolean
  data: DealOrderModel[]
}

export interface OrderDetailResponse {
  success: boolean
  data?: MarketOrderModel
  code: string
}

export interface OrderCountResponse {
  success: boolean
  ask: number
  bid: number
}

export interface OrderExistResponse {
  success: boolean
  exists: boolean
}

// Quotation service messages
export interface MarketRequest { market: string; limit: number }

export interface MarketPriceResponse {
  success: boolean
  price: number | string
  change: number
  max: number | string
  min: number | string
  volume: number | string
  value: number | string
}

export interface MarketDealOrderResponse { success: boolean; dealOrders: DealOrderModel[] }

export interface MarketLatestResponse {
  success: boolean
  price: number | string
  change: number
  max: number | string
  min: number | string
  volume: number | string
  value: number | string
  dealOrders: DealOrderModel[]
}

export interface MarketSimplePrice {
  name: string
  price: number | string
  change: number
  volume: number | string
  value: number | string
  max: number | string
  min: number | string
}

export interface MarketListResponse { success: boolean; markets: MarketSimplePrice[] }