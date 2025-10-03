import path from 'node:path'
import { credentials, loadPackageDefinition } from '@grpc/grpc-js'
import * as protoLoader from '@grpc/proto-loader'

import type {
  // Account
  CreateAccountRequest, CreateAccountResponse, AlterRequest, AccountResponse,
  BalanceQueryRequest, BalanceResponse, AccountOrderRequest, AccountBatchOrderRequest,
  AccountBatchOrderResponse, QueryOrderRequest, AccountOrderResponse, AccountOrderList,
  FinishedOrderResponse,
  // Market
  CreateMarketRequest, CreateMarketResponse, UpdateMarketRequest, UpdateMarketResponse,
  MarketOrderRequest, MarketResponse, DepthRequest, DepthResponse, OrderBookResponse,
  DealRecordResponse, PublishRequest, OrderDetailResponse, OrderCountResponse, OrderExistResponse,
  // Quotation
  MarketRequest, MarketDealOrderResponse, MarketPriceResponse, MarketLatestResponse,
} from './types'

const PROTO_PATH = path.resolve(__dirname, '..', 'service.proto')

const loaderOptions: protoLoader.Options = {
  keepCase: true,
  longs: String, // represent int64 as string to avoid precision loss
  enums: String,
  defaults: true,
  oneofs: true
}

type UnaryFn<Req, Res> = (req: Req) => Promise<Res>

function promisifyUnary<TClient, Req, Res>(client: any, methodName: string): UnaryFn<Req, Res> {
  return (req: Req) => new Promise<Res>((resolve, reject) => {
    client[methodName](req, (err: any, res: Res) => {
      if (err) return reject(err)
      resolve(res)
    })
  })
}

/**
 * Client creation options.
 * - `address`: gRPC server address, e.g. `localhost:50051`.
 * - `insecure`: when true (default), use plaintext. If false, use TLS.
 * - `ssl`: optional TLS credentials. If omitted and `insecure` is false, default CA is used.
 */
export interface ClientOptions {
  address: string
  insecure?: boolean
  ssl?: {
    rootCerts?: Buffer
    privateKey?: Buffer
    certChain?: Buffer
  }
}

export function createClients(opts: ClientOptions) {
  const packageDefinition = protoLoader.loadSync(PROTO_PATH, loaderOptions)
  const proto = loadPackageDefinition(packageDefinition) as any

  const exch = proto.exchange_service

  const creds = opts.insecure === false
    ? credentials.createSsl(opts.ssl?.rootCerts, opts.ssl?.privateKey, opts.ssl?.certChain)
    : credentials.createInsecure()

  // Account
  const accountClient = new exch.Account(opts.address, creds)
  const Account = {
    CreateAccount: promisifyUnary<typeof accountClient, CreateAccountRequest, CreateAccountResponse>(accountClient, 'CreateAccount'),
    Alter: promisifyUnary<typeof accountClient, AlterRequest, AccountResponse>(accountClient, 'Alter'),
    QueryBalance: promisifyUnary<typeof accountClient, BalanceQueryRequest, BalanceResponse>(accountClient, 'QueryBalance'),
    BatchPutOrder: promisifyUnary<typeof accountClient, AccountBatchOrderRequest, AccountBatchOrderResponse>(accountClient, 'BatchPutOrder'),
    PutOrder: promisifyUnary<typeof accountClient, AccountOrderRequest, AccountOrderResponse>(accountClient, 'PutOrder'),
    CancelAllOrder: promisifyUnary<typeof accountClient, QueryOrderRequest, AccountOrderResponse>(accountClient, 'CancelAllOrder'),
    CancelUserOrder: promisifyUnary<typeof accountClient, AccountOrderRequest, AccountOrderResponse>(accountClient, 'CancelUserOrder'),
    BatchCancelUserOrder: promisifyUnary<typeof accountClient, AccountBatchOrderRequest, AccountBatchOrderResponse>(accountClient, 'BatchCancelUserOrder'),
    QueryUserOrder: promisifyUnary<typeof accountClient, QueryOrderRequest, AccountOrderList>(accountClient, 'QueryUserOrder'),
    QueryHistoryOrder: promisifyUnary<typeof accountClient, QueryOrderRequest, AccountOrderList>(accountClient, 'QueryHistoryOrder'),
    QueryFinishedOrder: promisifyUnary<typeof accountClient, QueryOrderRequest, FinishedOrderResponse>(accountClient, 'QueryFinishedOrder'),
  }

  // Market
  const marketClient = new exch.Market(opts.address, creds)
  const Market = {
    CreateMarket: promisifyUnary<typeof marketClient, CreateMarketRequest, CreateMarketResponse>(marketClient, 'CreateMarket'),
    UpdateMarket: promisifyUnary<typeof marketClient, UpdateMarketRequest, UpdateMarketResponse>(marketClient, 'UpdateMarket'),
    PutLimitOrder: promisifyUnary<typeof marketClient, MarketOrderRequest, MarketResponse>(marketClient, 'PutLimitOrder'),
    PutMarketOrder: promisifyUnary<typeof marketClient, MarketOrderRequest, MarketResponse>(marketClient, 'PutMarketOrder'),
    QueryOrderDetail: promisifyUnary<typeof marketClient, MarketOrderRequest, OrderDetailResponse>(marketClient, 'QueryOrderDetail'),
    CancelOrder: promisifyUnary<typeof marketClient, MarketOrderRequest, MarketResponse>(marketClient, 'CancelOrder'),
    QueryOrderBook: promisifyUnary<typeof marketClient, DepthRequest, OrderBookResponse>(marketClient, 'QueryOrderBook'),
    GetDepthMerge: promisifyUnary<typeof marketClient, DepthRequest, DepthResponse>(marketClient, 'GetDepthMerge'),
    QueryLatestDealRecord: promisifyUnary<typeof marketClient, DepthRequest, DealRecordResponse>(marketClient, 'QueryLatestDealRecord'),
    RePublishDealOrder: promisifyUnary<typeof marketClient, PublishRequest, MarketResponse>(marketClient, 'RePublishDealOrder'),
    QueryOrderCount: promisifyUnary<typeof marketClient, DepthRequest, OrderCountResponse>(marketClient, 'QueryOrderCount'),
    IsOrderExist: promisifyUnary<typeof marketClient, MarketOrderRequest, OrderExistResponse>(marketClient, 'IsOrderExist'),
  }

  // Quotation
  const quotationClient = new exch.Quotation(opts.address, creds)
  const Quotation = {
    QueryLatestDeal: promisifyUnary<typeof quotationClient, MarketRequest, MarketDealOrderResponse>(quotationClient, 'QueryLatestDeal'),
    QueryLatestPrice: promisifyUnary<typeof quotationClient, MarketRequest, MarketPriceResponse>(quotationClient, 'QueryLatestPrice'),
    QueryLatest: promisifyUnary<typeof quotationClient, MarketRequest, MarketLatestResponse>(quotationClient, 'QueryLatest'),
    QueryAllMarket: promisifyUnary<typeof quotationClient, MarketRequest, import('./types').MarketListResponse>(quotationClient, 'QueryAllMarket'),
  }

  return { Account, Market, Quotation }
}