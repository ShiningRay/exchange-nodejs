import { createClients } from './client'

async function main() {
  const { Account, Market, Quotation } = createClients({ address: 'localhost:8888', insecure: true })

  try {
    const acc = await Account.CreateAccount({ userId: 'u1' })
    console.log('CreateAccount', acc)
  } catch (e) {
    console.error('CreateAccount error', e)
  }

  try {
    const price = await Quotation.QueryLatestPrice({ market: 'btc/eth', limit: 10 })
    console.log('QueryLatestPrice', price)
  } catch (e) {
    console.error('Quotation error', e)
  }
}

main()