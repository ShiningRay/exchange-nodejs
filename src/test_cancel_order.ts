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

// 断言与 BigInt 工具
const assert = (cond: boolean, msg: string): void => { if (!cond) throw new Error(`Assertion failed: ${msg}`) }
const toBig = (v: number | string | undefined): bigint => {
  if (v === undefined) return 0n
  if (typeof v === 'string') return BigInt(v)
  // proto-loader 设置 longs:String；如果出现 number 则兜底转换
  return BigInt(Math.round(v))
}
const mulScaledFunds = (priceScaled: string, amountScaled: string): string => ((BigInt(priceScaled) * BigInt(amountScaled)) / SCALE).toString()

// 测试常量
const DEPOSIT_BTC = toScaledAmount(0.01)
const DEPOSIT_USDT = toScaledAmount(1000)
const ORDER_PRICE = toScaledPrice(30000)
const ORDER_AMOUNT = toScaledAmount(0.005)
const ORDER_SIDE = '1' // BID
const ORDER_TYPE = '1' // 限价
const EXPECT_FROZEN_USDT = mulScaledFunds(ORDER_PRICE, ORDER_AMOUNT)

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
    // 断言创建成功
    assert((res as any).success === true, 'CreateMarket should succeed')
  } catch (err) {
    console.error('CreateMarket error:', err)
  }

  // 2) 创建测试用户
  try {
    const res = await Account.CreateAccount({ userId: USER_ID })
    console.log('CreateAccount:', res)
    // 断言用户ID一致
    assert(res.userId === USER_ID, 'CreateAccount userId mismatch')
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
      bizId: 'dep-btc-'+Date.now(),
    })
    // 入金 USDT 1000
    await Account.Alter({
      token: 'USDT',
      action: '1',
      amount: toScaledAmount(1000),
      fee: '0',
      userId: USER_ID,
      bizType: '4',
      bizId: 'dep-usdt-'+Date.now(),
    })

    const bal = await Account.QueryBalance({ userId: USER_ID, tokens: ['BTC', 'USDT'] })
    console.log('Balance after deposit:', JSON.stringify(bal, null, 2))
    // 断言余额成功且与入金一致（无冻结）
    assert(bal.success === true, 'QueryBalance after deposit should succeed')
    const btc = bal.data['BTC']
    const usdt = bal.data['USDT']
    assert(!!btc && !!usdt, 'BTC and USDT balances should exist after deposit')
    assert(toBig(btc.available) === BigInt(DEPOSIT_BTC), 'BTC available should equal deposit')
    assert(toBig(btc.frozen) === 0n, 'BTC frozen should be 0 after deposit')
    assert(toBig(usdt.available) === BigInt(DEPOSIT_USDT), 'USDT available should equal deposit')
    assert(toBig(usdt.frozen) === 0n, 'USDT frozen should be 0 after deposit')
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
      price: ORDER_PRICE, // 30000 USDT/BTC
      amount: ORDER_AMOUNT, // 买入 0.005 BTC
      side: ORDER_SIDE,  // BID
      type: ORDER_TYPE,  // 限价单
      source: 'test-script',
    })
    console.log('PutOrder:', JSON.stringify(orderRes, null, 2))
    placedOrderId = orderRes.order?.Id
    // 断言挂单成功与订单属性
    assert(orderRes.success === true, 'PutOrder should succeed')
    assert(!!placedOrderId, 'PutOrder should return an order Id')
    if (orderRes.order?.Price !== undefined) {
      assert(toBig(orderRes.order.Price) === BigInt(ORDER_PRICE), 'Order price should equal requested price')
    }
    if (orderRes.order?.LeftAmount !== undefined) {
      assert(toBig(orderRes.order.LeftAmount) === BigInt(ORDER_AMOUNT), 'LeftAmount should equal requested amount')
    }

    const bal2 = await Account.QueryBalance({ userId: USER_ID, tokens: ['BTC', 'USDT'] })
    console.log('Balance after put order:', JSON.stringify(bal2, null, 2))
    assert(bal2.success === true, 'QueryBalance after put order should succeed')
    const usdt2 = bal2.data['USDT']
    const btc2 = bal2.data['BTC']
    assert(!!usdt2 && !!btc2, 'Balances should exist after put order')
    const expectedFrozen = BigInt(EXPECT_FROZEN_USDT)
    const expectedAvailable = BigInt(DEPOSIT_USDT) - expectedFrozen
    // 买单冻结USDT，BTC余额不变（若未成交）
    assert(toBig(usdt2.frozen) === expectedFrozen, 'USDT frozen should equal price*amount scaled')
    assert(toBig(usdt2.available) === expectedAvailable, 'USDT available should decrease by frozen funds')
    assert(toBig(btc2.available) === BigInt(DEPOSIT_BTC), 'BTC available should remain unchanged before fill')

    const curOrders = await Account.QueryUserOrder({ market: MARKET, userId: USER_ID, limit: 100, offset: 0 })
    console.log('Current orders:', JSON.stringify(curOrders, null, 2))
    assert(curOrders.success === true, 'QueryUserOrder should succeed')
    const exists = (curOrders.orders || []).some(o => o.Id === placedOrderId)
    assert(exists, 'Placed order should appear in current orders')
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
        price: ORDER_PRICE,
        amount: ORDER_AMOUNT,
        side: ORDER_SIDE,
        type: ORDER_TYPE,
        source: 'test-script',
      })
      console.log('CancelUserOrder:', JSON.stringify(cancelRes, null, 2))
      assert(cancelRes.success === true, 'CancelUserOrder should succeed')
    }

    const bal3 = await Account.QueryBalance({ userId: USER_ID, tokens: ['BTC', 'USDT'] })
    console.log('Balance after cancel:', JSON.stringify(bal3, null, 2))
    assert(bal3.success === true, 'QueryBalance after cancel should succeed')
    const usdt3 = bal3.data['USDT']
    const btc3 = bal3.data['BTC']
    assert(!!usdt3 && !!btc3, 'Balances should exist after cancel')
    // 撤单后 USDT 解冻，余额回到初始；BTC 未成交则保持初始
    assert(toBig(usdt3.frozen) === 0n, 'USDT frozen should be 0 after cancel')
    assert(toBig(usdt3.available) === BigInt(DEPOSIT_USDT), 'USDT available should return to initial deposit after cancel')
    assert(toBig(btc3.available) === BigInt(DEPOSIT_BTC), 'BTC available should remain initial after cancel')

    const curOrders2 = await Account.QueryUserOrder({ market: MARKET, userId: USER_ID, limit: 100, offset: 0 })
    console.log('Current orders (after cancel):', JSON.stringify(curOrders2, null, 2))
    assert(curOrders2.success === true, 'QueryUserOrder after cancel should succeed')
    const stillExists = (curOrders2.orders || []).some(o => o.Id === placedOrderId)
    assert(!stillExists, 'Canceled order should be absent from current orders')
  } catch (err) {
    console.error('Cancel/Query after cancel error:', err)
  }
}

main().catch(err => {
  console.error('Fatal error in test_cancel_order:', err)
})
