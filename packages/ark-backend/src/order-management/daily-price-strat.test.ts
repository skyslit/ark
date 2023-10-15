import { Invoice, Order, OrderController, Product } from '.';
import moment from 'moment';

test('should generate invoice for a new order (i.e. without expiry date)', async () => {
  const now = moment.utc('2023-01-01 00:00:00', 'YYYY-MM-DD HH:mm:ss');

  const invoices: Invoice[] = [];

  const product: Product[] = [
    {
      productId: 'ws-storage',
      calculationStrategy: 'daily',
      prices: {
        INR: 250,
      },
    },
  ];

  const wsStorage = product.find((p) => p.productId === 'ws-storage');

  let orders: Order[] = [
    {
      _id: 'test_id',
      orderTimeInUtc: now.valueOf(),
      accountId: 'acc-100',
      changeLogs: [],
      currencyCode: 'INR',
      expiryDateInUtc: -1,
      unitRate: wsStorage.prices['INR'],
      quantity: 2,
      unitPrice: wsStorage.prices['INR'],
      priceCalculationStrategy: wsStorage.calculationStrategy,
      productId: 'ws-storage',
      type: 'recurring',
      recurringOptions: {
        billingClass: 'monthly',
      },
      status: 'activated',
    },
  ];

  const orderController = new OrderController();

  orderController.orders = {
    async fetchAllOrdersByAccountId(accountId) {
      return orders.filter(
        (o) =>
          o.accountId === accountId &&
          (o.status === 'pending' || o.status === 'activated')
      );
    },
    async fetchOrderById(accountId, orderId) {
      return [
        orders.find(
          (o) =>
            o.accountId === accountId &&
            String(o._id) === String(orderId) &&
            (o.status === 'pending' || o.status === 'activated')
        ),
      ].filter(Boolean);
    },
    async updateOrderById(orderId, val) {
      orders = orders.map((o) => {
        if (String(o._id) === String(orderId)) {
          return {
            ...o,
            ...val,
          };
        }
        return o;
      });
    },
  };

  orderController.invoices = {
    async issueInvoice(val) {
      val._id = 'inv-1001';
      invoices.push(val);
      return val;
    },
  };

  expect(orders[0].expiryDateInUtc).toStrictEqual(-1);

  const invoice = await orderController.generateInvoice(
    {
      accountId: 'acc-100',
      orderId: 'test_id',
    },
    moment.utc('2023-01-01 00:00:00', 'YYYY-MM-DD HH:mm:ss')
  );

  expect(invoice.items[0].netAmount).toStrictEqual(15500);
  expect(invoice.netAmount).toStrictEqual(15500);

  expect(orders[0].expiryDateInUtc).toStrictEqual(1675209600000);
  expect(invoices.length).toStrictEqual(1);

  // console.log('invoice', require('util').inspect(invoice, { depth: undefined }));
});

test('should generate invoice for a existing order with expiry date', async () => {
  const now = moment.utc('2023-01-01 00:00:00', 'YYYY-MM-DD HH:mm:ss');

  const invoices: Invoice[] = [];

  const product: Product[] = [
    {
      productId: 'ws-storage',
      calculationStrategy: 'daily',
      prices: {
        INR: 250,
      },
    },
  ];

  const wsStorage = product.find((p) => p.productId === 'ws-storage');

  let orders: Order[] = [
    {
      _id: 'test_id',
      orderTimeInUtc: now.valueOf(),
      accountId: 'acc-100',
      changeLogs: [],
      currencyCode: 'INR',
      expiryDateInUtc: moment
        .utc('2023-01-15 00:00:00', 'YYYY-MM-DD HH:mm:ss')
        .valueOf(),
      unitRate: wsStorage.prices['INR'],
      quantity: 2,
      unitPrice: wsStorage.prices['INR'],
      priceCalculationStrategy: wsStorage.calculationStrategy,
      productId: 'ws-storage',
      type: 'recurring',
      recurringOptions: {
        billingClass: 'monthly',
      },
      status: 'activated',
    },
  ];

  const orderController = new OrderController();

  orderController.orders = {
    async fetchAllOrdersByAccountId(accountId) {
      return orders.filter(
        (o) =>
          o.accountId === accountId &&
          (o.status === 'pending' || o.status === 'activated')
      );
    },
    async fetchOrderById(accountId, orderId) {
      return [
        orders.find(
          (o) =>
            o.accountId === accountId &&
            String(o._id) === String(orderId) &&
            (o.status === 'pending' || o.status === 'activated')
        ),
      ].filter(Boolean);
    },
    async updateOrderById(orderId, val) {
      orders = orders.map((o) => {
        if (String(o._id) === String(orderId)) {
          return {
            ...o,
            ...val,
          };
        }
        return o;
      });
    },
  };

  orderController.invoices = {
    async issueInvoice(val) {
      val._id = 'inv-1001';
      invoices.push(val);
      return val;
    },
  };

  const invoice = await orderController.generateInvoice(
    {
      accountId: 'acc-100',
      orderId: 'test_id',
    },
    moment.utc('2023-01-01 00:00:00', 'YYYY-MM-DD HH:mm:ss')
  );

  expect(invoices.length).toStrictEqual(1);
  expect(invoices[0].items[0].timeUnit).toStrictEqual(17);
  expect(invoices[0].items[0].netAmount).toStrictEqual(8500);

  // console.log('invoice', require('util').inspect(invoice, { depth: undefined }));
});
