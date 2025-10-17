// 用户A挂限价卖单，然后用户B用市价买单逐步吃掉A的单子，并进行断言
import { createClients } from './client'

const ADDRESS = 'localhost:8888'
const MARKET = 'BTC/USDT'
const USER_A = 'user_A_market_test'
const USER_B = 'user_B_market_test'

// SCALE = 1e10；价格与数量按比例转换为字符串，避免 JS 精度问题
const SCALE = 10n ** 10n
const toScaledInt = (n: number): string => (BigInt(Math.round(n * 1e10))).toString()
const toScaledPrice = (p: number): string => toScaledInt(p)
const toScaledAmount = (a: number): string => toScaledInt(a)
const mulScaledFunds = (priceScaled: string, amountScaled: string): string => (
  (BigInt(priceScaled) * BigInt(amountScaled)) / SCALE
).toString()

function expect(cond: boolean, msg: string) {
  if (!cond) throw new Error(`Assertion failed: ${msg}`)
}

function pickBalance(bal: any, token: string) {
  const item = bal?.data?.[token]
  return {
    total: BigInt(item?.total ?? '0'),
    frozen: BigInt(item?.frozen ?? '0'),
    available: BigInt(item?.available ?? '0')
  }
}

async function main() {
  const { Account, Market } = createClients({ address: ADDRESS, insecure: true })

  const PRICE = 30000
  const SELL_TOTAL = 0.009
  const CHUNK = 0.003
  const CHUNKS = [CHUNK, CHUNK, CHUNK]

  // 1) 创建市场（幂等处理）
  try {
    const res = await Market.CreateMarket({
      name: MARKET,
      token1: 'BTC',
      token2: 'USDT',
      minAmount: toScaledAmount(0.0001),
      takerFee: '100',
      makerFee: '80',
    })
    expect(!!res.success || res.success === undefined, 'CreateMarket should succeed or be already created')
    console.log('CreateMarket:', res)
  } catch (err) {
    console.warn('CreateMarket warn (maybe already exists):', err)
  }

  // 2) 创建用户A/B
  try {
    const a = await Account.CreateAccount({ userId: USER_A })
    expect(a.userId === USER_A, 'CreateAccount A userId matches')
    const b = await Account.CreateAccount({ userId: USER_B })
    expect(b.userId === USER_B, 'CreateAccount B userId matches')
    console.log('CreateAccount A/B:', a, b)
  } catch (err) {
    console.error('CreateAccount error:', err)
  }

  // 3) 入金：A存BTC，B存USDT
  let aInitBTC = 0n
  let bInitUSDT = 0n
  try {
    await Account.Alter({
      token: 'BTC', action: '1', amount: toScaledAmount(0.01), fee: '0',
      userId: USER_A, bizType: '4', bizId: 'dep-a-btc-1',
    })
    await Account.Alter({
      token: 'USDT', action: '1', amount: toScaledAmount(1000), fee: '0',
      userId: USER_B, bizType: '4', bizId: 'dep-b-usdt-1',
    })
    const balA = await Account.QueryBalance({ userId: USER_A, tokens: ['BTC', 'USDT'] })
    const balB = await Account.QueryBalance({ userId: USER_B, tokens: ['BTC', 'USDT'] })
    const aBTC = pickBalance(balA, 'BTC')
    const bUSDT = pickBalance(balB, 'USDT')
    aInitBTC = aBTC.available
    bInitUSDT = bUSDT.available
    expect(aBTC.available === BigInt(toScaledAmount(0.01)), 'A BTC available should be 0.01 * SCALE')
    expect(aBTC.frozen === 0n, 'A BTC frozen should be 0 at start')
    expect(bUSDT.available === BigInt(toScaledAmount(1000)), 'B USDT available should be 1000 * SCALE')
    console.log('Initial balances:', { A: balA, B: balB })
  } catch (err) {
    console.error('Deposit/QueryBalance error:', err)
  }

  // 4) A挂限价卖单（ASK）
  let orderId: string | undefined
  const priceScaled = toScaledPrice(PRICE)
  const sellTotalScaled = toScaledAmount(SELL_TOTAL)
  try {
    const orderRes = await Account.PutOrder({
      market: MARKET,
      userId: USER_A,
      id: '',
      price: priceScaled,
      amount: sellTotalScaled,
      side: '2', // ASK
      type: '1', // 限价单
      source: 'test-market-order',
    })
    console.log('A PutOrder ASK:', JSON.stringify(orderRes, null, 2))
    expect(orderRes.success === true, 'A PutOrder should succeed')
    orderId = orderRes.order?.Id
    expect(!!orderId, 'A order id should exist')

    // A余额应冻结相应BTC数量
    const balA = await Account.QueryBalance({ userId: USER_A, tokens: ['BTC', 'USDT'] })
    const aBTC = pickBalance(balA, 'BTC')
    expect(aBTC.frozen >= BigInt(sellTotalScaled), 'A BTC frozen >= sell amount')
    expect(aBTC.available + aBTC.frozen === BigInt(toScaledAmount(0.01)), 'A BTC total remains consistent')

    // 当前挂单应包含该订单
    const curA = await Account.QueryUserOrder({ market: MARKET, userId: USER_A, limit: 100, offset: 0 })
    const found = (curA.orders || []).find(o => o.Id === orderId)
    expect(!!found, 'A order should be present in current orders')
    expect(BigInt(found!.LeftAmount as string) === BigInt(sellTotalScaled), 'A order LeftAmount equals sell total')
  } catch (err) {
    console.error('A PutOrder/QueryUserOrder error:', err)
  }

  // 5) B用市价买单逐步吃掉A的卖单
  let prevLeft = BigInt(sellTotalScaled)
  let prevBBTC = 0n
  try {
    // 初始B的BTC可用
    const balB0 = await Account.QueryBalance({ userId: USER_B, tokens: ['BTC', 'USDT'] })
    prevBBTC = pickBalance(balB0, 'BTC').available

    for (const amt of CHUNKS) {
      const amtScaled = toScaledAmount(amt)
      const fundsScaled = mulScaledFunds(priceScaled, amtScaled)
      const mktRes = await Market.PutMarketOrder({
        market: MARKET,
        userId: USER_B,
        id: '',
        price: '0', // 市价单忽略价格
        amount: amtScaled,
        funds: fundsScaled,
        side: '1', // BID
        type: '2', // 市价单
      })
      expect(mktRes.success === true, 'B market order should succeed')
      console.log('B PutMarketOrder chunk:', amt, mktRes)

      // A的剩余数量应减少
      const curA = await Account.QueryUserOrder({ market: MARKET, userId: USER_A, limit: 100, offset: 0 })
      const found = (curA.orders || []).find(o => o.Id === orderId)
      if (found) {
        const left = BigInt(found.LeftAmount as string)
        expect(left <= prevLeft, 'A LeftAmount should not increase')
        prevLeft = left
      } else {
        // 订单已不在当前挂单列表，视为吃完
        prevLeft = 0n
      }

      // B的BTC余额应增加（不校验精确手续费，验证单调性）
      const balB = await Account.QueryBalance({ userId: USER_B, tokens: ['BTC', 'USDT'] })
      const bBTC = pickBalance(balB, 'BTC').available
      expect(bBTC >= prevBBTC, 'B BTC available should not decrease after market buy')
      prevBBTC = bBTC
    }

    // 完成后，A的订单应被完全吃掉
    const curA2 = await Account.QueryUserOrder({ market: MARKET, userId: USER_A, limit: 100, offset: 0 })
    const found2 = (curA2.orders || []).find(o => o.Id === orderId)
    expect(!found2 || BigInt(found2.LeftAmount as string) === 0n, 'A order should be fully consumed')

    // A的BTC冻结应为0，BTC可用应为初始-卖出数量（忽略手续费影响到USDT收益）
    const balAEnd = await Account.QueryBalance({ userId: USER_A, tokens: ['BTC', 'USDT'] })
    const aBTCEnd = pickBalance(balAEnd, 'BTC')
    expect(aBTCEnd.frozen === 0n, 'A BTC frozen should be 0 after full fill')
    expect(aBTCEnd.available === aInitBTC - BigInt(sellTotalScaled), 'A BTC available equals initial minus sold amount')

    // B的BTC最终应大于初始
    const balBEnd = await Account.QueryBalance({ userId: USER_B, tokens: ['BTC', 'USDT'] })
    const bBTCEnd = pickBalance(balBEnd, 'BTC').available
    expect(bBTCEnd > prevBBTC || bBTCEnd > 0n, 'B BTC should increase overall after buys')

    console.log('Final balances:', { A: balAEnd, B: balBEnd })
  } catch (err) {
    console.error('B PutMarketOrder / Assertions error:', err)
  }
}

main().catch(err => {
  console.error('Fatal error in test_market_order:', err)
})