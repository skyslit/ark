import { CreditNote, Invoice, Order, OrderController, Product } from '.';
import moment from 'moment';

test('should generate credit note when quantity is reduced', async () => {
  const now = moment.utc('2023-01-01 00:00:00', 'YYYY-MM-DD HH:mm:ss');

  const invoices: Invoice[] = [];
  const creditNotes: CreditNote[] = [];

  const product: Product[] = [
    {
      productId: 'ws-storage',
      calculationStrategy: 'monthly',
      prices: {
        INR: 7000,
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

  orderController.vouchers = {
    async issueCreditNote(val) {
      val._id = 'cn-1001';
      creditNotes.push(val);
      return val;
    },
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

  expect(invoice.items[0].netAmount).toStrictEqual(14000);
  expect(invoice.netAmount).toStrictEqual(14000);

  expect(orders[0].expiryDateInUtc).toStrictEqual(1675209600000);
  expect(invoices.length).toStrictEqual(1);

  orders[0].quantity = 1;
  orders[0].changeLogs.push({
    accountId: '',
    dateInUtc: moment
      .utc('2023-01-15 00:00:00', 'YYYY-MM-DD HH:mm:ss')
      .valueOf(),
    field: 'quantity',
    orderId: 'orderid',
    value: 1,
    oldValue: 2,
    orderExpiryDateInUtc: orders[0].expiryDateInUtc,
  });

  const creditNote = await orderController.generateCreditNote(
    'acc-100',
    'test_id',
    moment.utc('2023-01-15 00:00:00', 'YYYY-MM-DD HH:mm:ss')
  );

  expect(creditNotes[0].netAmount).toStrictEqual(3500);
  expect(creditNotes[0].items[0].timeUnit).toStrictEqual(0.5);
});

test('should generate adjusted invoice when quantity is increased', async () => {
  const now = moment.utc('2023-01-01 00:00:00', 'YYYY-MM-DD HH:mm:ss');

  const invoices: Invoice[] = [];
  const creditNotes: CreditNote[] = [];

  const product: Product[] = [
    {
      productId: 'ws-storage',
      calculationStrategy: 'monthly',
      prices: {
        INR: 7000,
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

  orderController.vouchers = {
    async issueCreditNote(val) {
      val._id = 'cn-1001';
      creditNotes.push(val);
      return val;
    },
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

  expect(invoice.items[0].netAmount).toStrictEqual(14000);
  expect(invoice.netAmount).toStrictEqual(14000);

  expect(orders[0].expiryDateInUtc).toStrictEqual(1675209600000);
  expect(invoices.length).toStrictEqual(1);

  orders[0].quantity = 5;
  orders[0].changeLogs.push({
    accountId: '',
    dateInUtc: moment
      .utc('2023-01-15 00:00:00', 'YYYY-MM-DD HH:mm:ss')
      .valueOf(),
    field: 'quantity',
    orderId: 'orderid',
    value: 5,
    oldValue: 2,
    orderExpiryDateInUtc: orders[0].expiryDateInUtc,
  });

  const adjustedInvoice = await orderController.generateAdjustmentInvoice(
    'acc-100',
    'test_id',
    moment.utc('2023-01-15 00:00:00', 'YYYY-MM-DD HH:mm:ss')
  );

  expect(invoices[1].netAmount).toStrictEqual(10500);
  expect(invoices[1].items[0].timeUnit).toStrictEqual(0.5);
});
