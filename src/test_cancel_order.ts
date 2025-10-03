// 创建一个BTC_USDT交易对
// 创建一个测试用户，并存入BTC和USDT余额,查询并输出余额
// 测试用户测试挂单，并查询余额和当前挂单情况并打印
// 测试用户测试撤单，并查询余额和当前挂单情况并打印

import { createClients } from './client'

const ADDRESS = 'localhost:8888'
const MARKET = 'BTC/USDT'
const USER_ID = 'test_user_1'

// SCALE = 1e10；价格与数量按比例转换为字符串，避免 JS 精度问题
const SCALE = 10n ** 10n
const toScaledInt = (n: number): string => (BigInt(Math.round(n * 1e10)) ).toString()
const toScaledPrice = (p: number): string => (BigInt(Math.round(p * 1e10)) ).toString()
const toScaledAmount = (a: number): string => toScaledInt(a)

async function main() {
  const { Account, Market } = createClients({ address: ADDRESS, insecure: true })

  // 1) 创建 BTC/USDT 市场
  try {
    const res = await Market.CreateMarket({
      name: MARKET,
      token1: 'BTC',
      token2: 'USDT',
      minAmount: toScaledAmount(0.0001),
      takerFee: '100', // 1%
      makerFee: '80',  // 0.8%
    })
    console.log('CreateMarket:', res)
  } catch (err) {
    console.error('CreateMarket error:', err)
  }

  // 2) 创建测试用户
  try {
    const res = await Account.CreateAccount({ userId: USER_ID })
    console.log('CreateAccount:', res)
  } catch (err) {
    console.error('CreateAccount error:', err)
  }

  // 3) 存入 BTC 与 USDT 余额（按 SCALE）并查询余额
  try {
    // 入金 BTC 0.01
    await Account.Alter({
      token: 'BTC',
      action: '1',      // AddBalance
      amount: toScaledAmount(0.01),
      fee: '0',
      userId: USER_ID,
      bizType: '4',     // BizDeposit
      bizId: 'dep-btc-1',
    })
    // 入金 USDT 1000
    await Account.Alter({
      token: 'USDT',
      action: '1',
      amount: toScaledAmount(1000),
      fee: '0',
      userId: USER_ID,
      bizType: '4',
      bizId: 'dep-usdt-1',
    })

    const bal = await Account.QueryBalance({ userId: USER_ID, tokens: ['BTC', 'USDT'] })
    console.log('Balance after deposit:', JSON.stringify(bal, null, 2))
  } catch (err) {
    console.error('Deposit/QueryBalance error:', err)
  }

  // 4) 挂一笔限价买单，然后查询余额与当前挂单
  let placedOrderId: string | undefined
  try {
    const orderRes = await Account.PutOrder({
      market: MARKET,
      userId: USER_ID,
      id: '',
      price: toScaledPrice(30000), // 30000 USDT/BTC
      amount: toScaledAmount(0.005), // 买入 0.005 BTC
      side: '1',  // BID
      type: '1',  // 限价单
      source: 'test-script',
    })
    console.log('PutOrder:', JSON.stringify(orderRes, null, 2))
    placedOrderId = orderRes.order?.Id

    const bal2 = await Account.QueryBalance({ userId: USER_ID, tokens: ['BTC', 'USDT'] })
    console.log('Balance after put order:', JSON.stringify(bal2, null, 2))

    const curOrders = await Account.QueryUserOrder({ market: MARKET, userId: USER_ID, limit: 100, offset: 0 })
    console.log('Current orders:', JSON.stringify(curOrders, null, 2))
  } catch (err) {
    console.error('PutOrder/QueryUserOrder error:', err)
  }

  // 5) 撤单（若有订单）并再次查询余额与当前挂单
  try {
    if (!placedOrderId) {
      console.warn('No order id available to cancel.')
    } else {
      const cancelRes = await Account.CancelUserOrder({
        market: MARKET,
        userId: USER_ID,
        id: placedOrderId,
        price: toScaledPrice(30000),
        amount: toScaledAmount(0.005),
        side: '1',
        type: '1',
        source: 'test-script',
      })
      console.log('CancelUserOrder:', JSON.stringify(cancelRes, null, 2))
    }

    const bal3 = await Account.QueryBalance({ userId: USER_ID, tokens: ['BTC', 'USDT'] })
    console.log('Balance after cancel:', JSON.stringify(bal3, null, 2))

    const curOrders2 = await Account.QueryUserOrder({ market: MARKET, userId: USER_ID, limit: 100, offset: 0 })
    console.log('Current orders (after cancel):', JSON.stringify(curOrders2, null, 2))
  } catch (err) {
    console.error('Cancel/Query after cancel error:', err)
  }
}

main().catch(err => {
  console.error('Fatal error in test_cancel_order:', err)
})
