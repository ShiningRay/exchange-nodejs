// 新建 TRX/USDT 交易对：用户A有100USDT，用户B有100TRX；
// 用户B挂限价单以 0.3 USDT 卖出 3 TRX，然后用户A以同样价格购买 3 TRX，并进行基本断言。

import { createClients } from './client'

const ADDRESS = 'localhost:8888'
const MARKET = 'TRX/USDT'
const USER_A = 'user_trx_a'
const USER_B = 'user_trx_b'

// 精度缩放：SCALE = 1e10，所有金额/数量/价格使用字符串并按 SCALE 缩放，避免 JS 精度问题
const SCALE = 10n ** 10n
const toScaledInt = (n: number): string => (BigInt(Math.round(n * 1e10))).toString()
const toScaledPrice = (p: number): string => toScaledInt(p)
const toScaledAmount = (a: number): string => toScaledInt(a)

function expect(cond: boolean, msg: string) {
  if (!cond) throw new Error(`Assertion failed: ${msg}`)
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
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

  const PRICE = 0.3
  const AMOUNT = 3

  // 1) 创建 TRX/USDT 市场（幂等）
  try {
    const res = await Market.CreateMarket({
      name: MARKET,
      token1: 'TRX',
      token2: 'USDT',
      minAmount: toScaledAmount(10),
      takerFee: 100,
      makerFee: 80,
      // takerFee: '300000', // 1%
      // makerFee: '200000',  // 0.8%
    })
    expect(!!res.success || res.success === undefined, 'CreateMarket should succeed or be already created')
    console.log('CreateMarket:', res)
  } catch (err) {
    console.warn('CreateMarket warn (maybe already exists):', err)
  }

  // 2) 创建用户 A/B
  try {
    const a = await Account.CreateAccount({ userId: USER_A })
    expect(a.userId === USER_A, 'CreateAccount A userId matches')
    const b = await Account.CreateAccount({ userId: USER_B })
    expect(b.userId === USER_B, 'CreateAccount B userId matches')
    console.log('CreateAccount A/B:', a, b)
  } catch (err) {
    console.error('CreateAccount error:', err)
  }

  // 3) 入金：A 100 USDT，B 100 TRX
  let aInitUSDT = 0n
  let bInitTRX = 0n
  try {
    await Account.Alter({
      token: 'USDT', action: '1', amount: toScaledAmount(100), fee: '0',
      userId: USER_A, bizType: '4', bizId: 'dep-a-usdt-100',
    })
    await Account.Alter({
      token: 'TRX', action: '1', amount: toScaledAmount(100), fee: '0',
      userId: USER_B, bizType: '4', bizId: 'dep-b-trx-100',
    })
    const balA = await Account.QueryBalance({ userId: USER_A, tokens: ['USDT', 'TRX'] })
    const balB = await Account.QueryBalance({ userId: USER_B, tokens: ['USDT', 'TRX'] })
    const aUSDT = pickBalance(balA, 'USDT')
    const bTRX = pickBalance(balB, 'TRX')
    aInitUSDT = aUSDT.available
    bInitTRX = bTRX.available
    expect(aUSDT.available === BigInt(toScaledAmount(100)), 'A USDT available should be 100 * SCALE')
    expect(aUSDT.frozen === 0n, 'A USDT frozen should be 0 at start')
    expect(bTRX.available === BigInt(toScaledAmount(100)), 'B TRX available should be 100 * SCALE')
    expect(bTRX.frozen === 0n, 'B TRX frozen should be 0 at start')
    console.log('Initial balances:', { A: balA, B: balB })
  } catch (err) {
    console.error('Deposit/QueryBalance error:', err)
  }

  // 4) B 挂限价卖单：以 0.3 USDT 卖出 3 TRX（ASK）
  let bOrderId: string | undefined
  const priceScaled = toScaledPrice(PRICE)
  const amountScaled = toScaledAmount(AMOUNT)
  try {
    const orderRes = await Account.PutOrder({
      market: MARKET,
      userId: USER_B,
      id: '',
      price: priceScaled,
      amount: amountScaled,
      side: '2',  // ASK
      type: '1',  // 限价单
      source: 'test-trx-usdt',
    })
    console.log('B PutOrder ASK:', JSON.stringify(orderRes, null, 2))
    expect(orderRes.success === true, 'B PutOrder should succeed')
    bOrderId = orderRes.order?.Id
    expect(!!bOrderId, 'B order id should exist')

    // B 的 TRX 冻结应增加
    const balB = await Account.QueryBalance({ userId: USER_B, tokens: ['TRX', 'USDT'] })
    const bTRX = pickBalance(balB, 'TRX')
    expect(bTRX.frozen >= BigInt(amountScaled), 'B TRX frozen >= sell amount')
    expect(bTRX.available + bTRX.frozen === BigInt(toScaledAmount(100)), 'B TRX total remains consistent')
  } catch (err) {
    console.error('B PutOrder error:', err)
  }

  // 5) A 以同样价格限价买入 3 TRX（BID），吃掉 B 的单子
  try {
    await sleep(100) // 等待订单上架
    const buyRes = await Account.PutOrder({
      market: MARKET,
      userId: USER_A,
      id: '',
      price: priceScaled + '0',
      amount: amountScaled,
      side: '1',  // BID
      type: '1',  // 限价单
      source: 'test-trx-usdt',
    })
    console.log('A PutOrder BID:', JSON.stringify(buyRes, null, 2))
    expect(buyRes.success === true, 'A PutOrder should succeed')

    await sleep(200) // 等待成交与账务结算

    // 校验：B 的订单应被完全吃掉（不在当前挂单或 LeftAmount 为 0）
    const curB = await Account.QueryUserOrder({ market: MARKET, userId: USER_B, limit: 50, offset: 0 })
    const foundB = (curB.orders || []).find(o => o.Id === bOrderId)
    expect(!foundB || BigInt(foundB.LeftAmount as string) === 0n, 'B order should be fully consumed')

    // 校验余额的单调变化（不对手续费做精确断言）：
    const balAEnd = await Account.QueryBalance({ userId: USER_A, tokens: ['USDT', 'TRX'] })
    const balBEnd = await Account.QueryBalance({ userId: USER_B, tokens: ['USDT', 'TRX'] })
    const aUSDTEnd = pickBalance(balAEnd, 'USDT')
    const aTRXEnd = pickBalance(balAEnd, 'TRX')
    const bUSDTEnd = pickBalance(balBEnd, 'USDT')
    const bTRXEnd = pickBalance(balBEnd, 'TRX')

    expect(aTRXEnd.available > 0n, 'A TRX should increase after buy')
    expect(aUSDTEnd.available < aInitUSDT, 'A USDT should decrease after buy')
    expect(bTRXEnd.available < bInitTRX, 'B TRX should decrease after sell')
    expect(bUSDTEnd.available > 0n, 'B USDT should increase after sell')

    console.log('Final balances:')
    console.dir({ A: balAEnd, B: balBEnd }, {depth: 10})
  } catch (err) {
    console.error('A PutOrder / Assertions error:', err)
  }
}

main().catch(err => {
  console.error('Fatal error in test_trx_usdt:', err)
})