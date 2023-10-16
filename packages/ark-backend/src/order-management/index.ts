import moment from 'moment';

export type VoucherItem = {
  orderId: string;
  productId: string;
  notes: string;
  unitRate: number;
  unitPrice: number;
  netAmount: number;
  timeUnit: number;
  quantity: number;
};

export type Invoice = {
  _id?: any;
  timeInUtc: number;
  accountId: string;
  items: VoucherItem[];
  currency: string;
  appliedCoupons?: any[];
  netAmount: number;
};

export type CreditNote = {
  _id?: any;
  timeInUtc: number;
  accountId: string;
  items: VoucherItem[];
  currency: string;
  netAmount: number;
};

export type PriceCalculationStrategy = 'hourly' | 'daily' | 'monthly';
export type Product = {
  productId: string;
  prices: { [currency: string]: number };
  calculationStrategy: PriceCalculationStrategy;
};

export type ChangeLog = {
  accountId: string;
  orderId: string;
  dateInUtc: number;
  field: string;
  value: any;
  oldValue: any;
  orderExpiryDateInUtc: number;
};

export type RecurringOptions = {
  billingClass: 'monthly' | 'quarterly' | 'yearly';
};

export type Order = {
  _id?: any;
  accountId: string;
  productId: string;
  unitRate: number;
  quantity: number;
  unitPrice: number;
  priceCalculationStrategy: PriceCalculationStrategy;
  currencyCode: string;
  taxDetails?: any;
  changeLogs: ChangeLog[];
  type: 'one-time' | 'recurring';
  status:
    | 'pending'
    | 'placed'
    | 'confirmed'
    | 'closed'
    | 'activated'
    | 'deactivated';
  recurringOptions?: RecurringOptions;
  expiryDateInUtc: number;
  orderTimeInUtc: number;
  lastInvoiceInUtc?: number;
  lastCreditNoteInUtc?: number;
};

export interface IVoucherRepo {
  issueInvoice: (val: Invoice) => Promise<Invoice>;
  issueCreditNote: (val: CreditNote) => Promise<CreditNote>;
}

export interface IProductRepo {}
export interface IOrderRepo {
  fetchOrderById: (accountId: string, orderId: string) => Promise<Order[]>;
  fetchAllOrdersByAccountId: (accountId: string) => Promise<Order[]>;
  updateOrderById: (orderId: string, val: Partial<Order>) => Promise<any>;
}

export type InvoiceGeneratorOptions = {
  accountId: string;
  orderId?: string;
};

export type Voucher = 'invoice' | 'adj-invoice' | 'credit-note';

export class OrderController {
  products: IProductRepo;
  orders: IOrderRepo;
  vouchers: IVoucherRepo;

  async calculatePriceForRecurringOrder(
    voucher: Voucher,
    order: Partial<Order>,
    timeInUtc: moment.Moment
  ): Promise<{
    notes: string;
    netAmount: number;
    subscriptionEndTime: moment.Moment;
    timeUnit: number;
  }> {
    const {
      recurringOptions,
      priceCalculationStrategy,
      unitPrice,
      quantity,
      productId,
      expiryDateInUtc,
    } = order;
    if (!recurringOptions) {
      throw new Error(`Order ${order._id} has no recurringOptions configured`);
    }

    const { billingClass } = recurringOptions;

    let subscriptionStartTime = timeInUtc.clone();
    let subscriptionEndTime: moment.Moment;

    if (voucher === 'invoice') {
      switch (billingClass) {
        case 'monthly': {
          subscriptionEndTime = subscriptionStartTime.clone().add(1, 'month');
          break;
        }
        case 'quarterly': {
          subscriptionEndTime = subscriptionStartTime.clone().add(3, 'month');
          break;
        }
        case 'yearly': {
          subscriptionEndTime = subscriptionStartTime.clone().add(1, 'year');
          break;
        }
        default: {
          throw new Error(`Billing class ${billingClass} not supported`);
        }
      }

      /** Adjust order if subscription is already running */
      if (expiryDateInUtc > -1) {
        const expiryM = moment.utc(expiryDateInUtc);
        const hasAlreadyExpired = expiryM.isBefore(timeInUtc, 'minute');
        if (hasAlreadyExpired === false) {
          subscriptionStartTime = expiryM.clone();
        }
      }
    } else {
      subscriptionEndTime = moment.utc(expiryDateInUtc);
    }

    let timeUnit: number = -1;
    let notes: string = '';

    const noteData = {
      intendLabel: 'usage',
    };

    if (voucher === 'credit-note') {
      noteData.intendLabel = 'refund';
    }

    switch (priceCalculationStrategy) {
      case 'hourly': {
        timeUnit = subscriptionEndTime.diff(
          subscriptionStartTime,
          'hours',
          false
        );
        notes = `For ${
          noteData.intendLabel
        } of product '${productId} x${quantity}' from ${subscriptionStartTime.format(
          'lll'
        )} to ${subscriptionEndTime.format(
          'lll'
        )}, i.e. ${timeUnit} hour(s) for unit price ${unitPrice}`;
        break;
      }
      case 'daily': {
        timeUnit = subscriptionEndTime.diff(
          subscriptionStartTime,
          'days',
          false
        );
        notes = `For ${
          noteData.intendLabel
        } of product '${productId} x${quantity}' from ${subscriptionStartTime.format(
          'lll'
        )} to ${subscriptionEndTime.format(
          'lll'
        )}, i.e. ${timeUnit} day(s) for unit price ${unitPrice}`;
        break;
      }
      case 'monthly': {
        let diffPrecision = false;

        /** Required to calculate differential refund */
        if (voucher === 'credit-note' || voucher === 'adj-invoice') {
          diffPrecision = true;
        }

        timeUnit = subscriptionEndTime.diff(
          subscriptionStartTime,
          'months',
          diffPrecision
        );

        if ((diffPrecision = true)) {
          timeUnit = Number(timeUnit.toFixed(1));
        }

        notes = `For ${
          noteData.intendLabel
        } of product '${productId} x${quantity}' from ${subscriptionStartTime.format(
          'lll'
        )} to ${subscriptionEndTime.format(
          'lll'
        )}, i.e. ${timeUnit} month(s) for unit price ${unitPrice}`;
        break;
      }
      default: {
        throw new Error(
          `priceCalculationStrategy ${priceCalculationStrategy} not supported`
        );
      }
    }

    const netAmount = Number((unitPrice * quantity * timeUnit).toFixed(2));

    return {
      notes,
      netAmount,
      subscriptionEndTime,
      timeUnit,
    };
  }

  async calculateItem(
    voucher: Voucher,
    order: Partial<Order>,
    timeInUtc: moment.Moment
  ): Promise<VoucherItem> {
    switch (order.type) {
      case 'one-time': {
        if (order.status !== 'pending') {
          throw new Error(`Order '${order._id}' is already ${order.status}`);
        }

        return {
          unitRate: order.unitRate,
          unitPrice: order.unitPrice,
          orderId: String(order._id),
          productId: order.productId,
          notes: `One time payment charged for quantity x${order.quantity} nos.`,
          netAmount: order.unitPrice * order.quantity,
          timeUnit: -1,
          quantity: order.quantity,
        };
      }
      case 'recurring': {
        const result = await this.calculatePriceForRecurringOrder(
          voucher,
          order,
          timeInUtc
        );
        return {
          orderId: String(order._id),
          productId: order.productId,
          unitRate: order.unitRate,
          unitPrice: order.unitPrice,
          quantity: order.quantity,
          ...result,
        };
      }
      default: {
        throw new Error(`Order type ${order.type} not supported`);
      }
    }
  }

  async generateInvoice(
    opts: InvoiceGeneratorOptions,
    timeInUtc: moment.Moment
  ) {
    const { accountId, orderId } = opts;

    const perOrder = Boolean(orderId);
    let orders: Order[] = [];

    if (perOrder === true) {
      orders = await this.orders.fetchOrderById(accountId, orderId);
    } else {
      orders = await this.orders.fetchAllOrdersByAccountId(accountId);
    }

    if (orders?.length < 1) {
      throw new Error(`Account ID ${accountId} has no orders to process`);
    }

    const invoice: Invoice = {
      timeInUtc: timeInUtc.valueOf(),
      accountId,
      currency: orders[0].currencyCode,
      items: [],
      netAmount: 0,
    };

    for (const order of orders) {
      if (order.currencyCode !== orders[0].currencyCode) {
        throw new Error(`All items in the order must be of same currency`);
      }

      const item = await this.calculateItem('invoice', order, timeInUtc);
      const { subscriptionEndTime, ...rest } = item as any;
      const { timeUnit } = rest;

      if (timeUnit > 0) {
        const payload = {
          expiryDateInUtc: subscriptionEndTime.valueOf(),
        };

        if (order.status === 'pending') {
          order.status = 'placed';
        }

        await this.orders.updateOrderById(order._id, payload);

        invoice.items.push(rest);
      }
    }

    invoice.netAmount = invoice.items.reduce((acc, item) => {
      return acc + item.netAmount;
    }, 0);

    if (invoice.items.length > 0) {
      await this.vouchers.issueInvoice(invoice);
    }

    return invoice;
  }

  async generateCreditNote(
    accountId: string,
    orderId: string,
    timeInUtc: moment.Moment
  ) {
    const orders = await this.orders.fetchOrderById(accountId, orderId);

    if (orders?.length < 1) {
      throw new Error(`Account ID ${accountId} has no orders to process`);
    }

    const order = orders[0];
    let { lastCreditNoteInUtc, changeLogs } = order;

    if (isNaN(lastCreditNoteInUtc)) {
      lastCreditNoteInUtc = -1;
    }

    const creditNote: CreditNote = {
      timeInUtc: timeInUtc.valueOf(),
      accountId,
      currency: orders[0].currencyCode,
      items: [],
      netAmount: 0,
    };

    for (const log of changeLogs) {
      const hasNotIssuedACreditNote = lastCreditNoteInUtc < 0;
      const changeHappenedAfterLastInvoice = moment
        .utc(lastCreditNoteInUtc)
        .isSameOrBefore(moment.utc(log.dateInUtc), 'minute');
      if (
        hasNotIssuedACreditNote === true ||
        changeHappenedAfterLastInvoice === true
      ) {
        if (log.field === 'quantity') {
          const diff = log.oldValue - log.value;
          if (diff > 0) {
            const item = await this.calculateItem(
              'credit-note',
              { ...order, quantity: diff },
              moment.utc(log.dateInUtc)
            );
            const { subscriptionEndTime, ...rest } = item as any;
            creditNote.items.push(rest);
          }
        }
      }
    }

    creditNote.netAmount = creditNote.items.reduce((acc, item) => {
      return acc + item.netAmount;
    }, 0);

    if (creditNote.items.length > 0) {
      await this.orders.updateOrderById(order._id, {
        lastCreditNoteInUtc: timeInUtc.valueOf(),
      });

      await this.vouchers.issueCreditNote(creditNote);
    }

    return creditNote;
  }

  async generateAdjustmentInvoice(
    accountId: string,
    orderId: string,
    timeInUtc: moment.Moment
  ) {
    const orders = await this.orders.fetchOrderById(accountId, orderId);

    if (orders?.length < 1) {
      throw new Error(`Account ID ${accountId} has no orders to process`);
    }

    const order = orders[0];
    let { lastInvoiceInUtc, changeLogs } = order;

    if (isNaN(lastInvoiceInUtc)) {
      lastInvoiceInUtc = -1;
    }

    const invoice: Invoice = {
      timeInUtc: timeInUtc.valueOf(),
      accountId,
      currency: orders[0].currencyCode,
      items: [],
      netAmount: 0,
    };

    for (const log of changeLogs) {
      const hasNotIssuedACreditNote = lastInvoiceInUtc < 0;
      const changeHappenedAfterLastInvoice = moment
        .utc(lastInvoiceInUtc)
        .isSameOrBefore(moment.utc(log.dateInUtc), 'minute');
      if (
        hasNotIssuedACreditNote === true ||
        changeHappenedAfterLastInvoice === true
      ) {
        if (log.field === 'quantity') {
          const diff = log.value - log.oldValue;
          if (diff > 0) {
            const item = await this.calculateItem(
              'adj-invoice',
              { ...order, quantity: diff },
              moment.utc(log.dateInUtc)
            );
            const { subscriptionEndTime, ...rest } = item as any;
            invoice.items.push(rest);
          }
        }
      }
    }

    invoice.netAmount = invoice.items.reduce((acc, item) => {
      return acc + item.netAmount;
    }, 0);

    if (invoice.items.length > 0) {
      await this.orders.updateOrderById(order._id, {
        lastCreditNoteInUtc: timeInUtc.valueOf(),
      });

      await this.vouchers.issueInvoice(invoice);
    }

    return invoice;
  }
}
