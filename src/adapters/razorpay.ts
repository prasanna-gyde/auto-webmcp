/**
 * adapters/razorpay.ts: WebMCP tools for Razorpay Checkout.
 *
 * Razorpay Checkout is a button that opens a hosted payment modal, not a form, so
 * form discovery cannot see it. This adapter registers imperative tools instead:
 *
 *   get_plans / get_order_summary   read-only
 *   start_subscription / start_payment   consequential; opens Checkout, the human pays
 *   get_subscription_status / get_payment_status   read-only; read what the webhook confirmed
 *   cancel_subscription   consequential; asks the user in-page before cancelling
 *
 * The agent never sees card, UPI or bank details: those are entered inside Razorpay's
 * modal. Payment state comes from the merchant's server (webhook-confirmed), never from
 * the browser callback.
 */

import { registerToolDefinition, unregisterToolDefinition, WebMCPTool } from '../registry.js';

export interface RazorpayPlan {
  id: string;
  name: string;
  /** Amount in minor units (paise, cents). */
  amount: number;
  currency: string;
  period?: string;
}

/** What Checkout needs, returned by the merchant's server after creating an order or subscription. */
export interface RazorpayCheckoutSession {
  keyId: string;
  subscriptionId?: string;
  orderId?: string;
  /** Needed for orders; subscriptions take the amount from the plan. */
  amount?: number;
  currency?: string;
  name?: string;
  description?: string;
  prefill?: { name?: string; email?: string; contact?: string };
}

export interface RazorpayAdapterOptions {
  /** Merchant name shown in tool descriptions and Checkout. */
  merchant: string;

  // Subscriptions
  plans?: () => Promise<RazorpayPlan[]>;
  createSubscription?: (planId: string) => Promise<RazorpayCheckoutSession>;
  subscriptionStatus?: () => Promise<Record<string, unknown>>;
  cancelSubscription?: () => Promise<void>;

  // One-time payments (Razorpay Orders)
  orderSummary?: () => Promise<Record<string, unknown>>;
  createOrder?: () => Promise<RazorpayCheckoutSession>;
  paymentStatus?: () => Promise<Record<string, unknown>>;

  /** Ask the user with window.confirm before cancel_subscription runs. Default true. */
  confirmCancel?: boolean;
  /** How long start_* waits for the user to finish Checkout. Default 10 minutes. */
  checkoutTimeoutMs?: number;
  /** Called after Razorpay reports a successful payment (before webhook confirmation). */
  onPaymentSubmitted?: (response: Record<string, unknown>) => void;
}

export interface RazorpayAdapterHandle {
  /** Unregister every tool this adapter registered. */
  destroy: () => Promise<void>;
  /** Names of the tools that were registered. */
  tools: string[];
}

type TextResult = { content: Array<{ type: 'text'; text: string }> };

function result(summary: string, data: Record<string, unknown>): TextResult {
  return { content: [{ type: 'text', text: summary }, { type: 'text', text: JSON.stringify(data) }] };
}

// ---------------------------------------------------------------------------
// Checkout
// ---------------------------------------------------------------------------

interface RazorpayInstance {
  open(): void;
  close(): void;
  on(event: string, cb: (response: Record<string, unknown>) => void): void;
}
type RazorpayCtor = new (options: Record<string, unknown>) => RazorpayInstance;

const CHECKOUT_SRC = 'https://checkout.razorpay.com/v1/checkout.js';

function loadCheckout(): Promise<RazorpayCtor> {
  const existing = (window as unknown as { Razorpay?: RazorpayCtor }).Razorpay;
  if (existing) return Promise.resolve(existing);
  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = CHECKOUT_SRC;
    script.onload = () => {
      const ctor = (window as unknown as { Razorpay?: RazorpayCtor }).Razorpay;
      if (ctor) resolve(ctor);
      else reject(new Error('Razorpay Checkout did not initialise'));
    };
    script.onerror = () => reject(new Error('Razorpay Checkout failed to load'));
    document.head.appendChild(script);
  });
}

type CheckoutOutcome =
  | { outcome: 'submitted'; response: Record<string, unknown> }
  | { outcome: 'dismissed' }
  | { outcome: 'failed'; reason: string }
  | { outcome: 'timed_out' }
  | { outcome: 'aborted' };

/** Open Checkout and wait until the user pays, closes it, or the call is aborted. */
export async function openRazorpayCheckout(
  session: RazorpayCheckoutSession,
  opts: { merchant: string; timeoutMs?: number; signal?: AbortSignal } = { merchant: '' },
): Promise<CheckoutOutcome> {
  const Razorpay = await loadCheckout();
  return new Promise<CheckoutOutcome>((resolve) => {
    let settled = false;
    let instance: RazorpayInstance | null = null;
    const finish = (value: CheckoutOutcome) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(value);
    };
    const timer = setTimeout(() => finish({ outcome: 'timed_out' }), opts.timeoutMs ?? 10 * 60 * 1000);

    instance = new Razorpay({
      key: session.keyId,
      ...(session.subscriptionId && { subscription_id: session.subscriptionId }),
      ...(session.orderId && { order_id: session.orderId }),
      ...(session.amount !== undefined && { amount: session.amount }),
      ...(session.currency && { currency: session.currency }),
      name: session.name ?? opts.merchant,
      ...(session.description && { description: session.description }),
      ...(session.prefill && { prefill: session.prefill }),
      handler: (response: Record<string, unknown>) => finish({ outcome: 'submitted', response }),
      modal: { ondismiss: () => finish({ outcome: 'dismissed' }) },
    });
    instance.on('payment.failed', (response) => {
      const error = (response['error'] ?? {}) as Record<string, unknown>;
      finish({ outcome: 'failed', reason: String(error['description'] ?? 'payment failed') });
    });
    opts.signal?.addEventListener('abort', () => {
      instance?.close();
      finish({ outcome: 'aborted' });
    }, { once: true });
    instance.open();
  });
}

// ---------------------------------------------------------------------------
// Adapter
// ---------------------------------------------------------------------------

function signalFrom(options: unknown): AbortSignal | undefined {
  const s = (options as { signal?: unknown } | undefined)?.signal;
  return s instanceof AbortSignal ? s : undefined;
}

function describeOutcome(outcome: CheckoutOutcome, statusTool: string): TextResult {
  switch (outcome.outcome) {
    case 'submitted':
      return result(
        `Payment submitted in Razorpay Checkout. The merchant confirms it by webhook; call ${statusTool} to check.`,
        { status: 'submitted', payment_id: outcome.response['razorpay_payment_id'] ?? null },
      );
    case 'dismissed':
      return result('The user closed Razorpay Checkout without paying.', { status: 'dismissed' });
    case 'failed':
      return result(`Payment failed: ${outcome.reason}.`, { status: 'failed', reason: outcome.reason });
    case 'timed_out':
      return result(`Checkout is still open. Call ${statusTool} later to see if the user paid.`, { status: 'awaiting_user_action' });
    case 'aborted':
      return result('Checkout was closed because the call was cancelled.', { status: 'cancelled' });
  }
}

/**
 * Register Razorpay Checkout tools. Each tool is registered only when its hook is
 * supplied. Silently no-ops in browsers without WebMCP.
 */
export async function razorpay(options: RazorpayAdapterOptions): Promise<RazorpayAdapterHandle> {
  const merchant = options.merchant;
  const timeoutMs = options.checkoutTimeoutMs;
  const defs: WebMCPTool[] = [];
  const statusTool = options.subscriptionStatus ? 'get_subscription_status' : 'get_payment_status';

  const startCheckout = async (session: RazorpayCheckoutSession, execOptions: unknown) => {
    const outcome = await openRazorpayCheckout(session, { merchant, ...(timeoutMs !== undefined && { timeoutMs }), ...(signalFrom(execOptions) && { signal: signalFrom(execOptions)! }) });
    if (outcome.outcome === 'submitted') options.onPaymentSubmitted?.(outcome.response);
    return describeOutcome(outcome, statusTool);
  };

  if (options.plans) {
    const plans = options.plans;
    defs.push({
      name: 'get_plans',
      title: `${merchant} plans`,
      description: `List ${merchant} subscription plans with prices. Amounts are in minor units (paise or cents).`,
      inputSchema: { type: 'object', properties: {} },
      annotations: { readOnlyHint: true },
      execute: async () => {
        const list = await plans();
        return result(`${list.length} plan(s) available.`, { plans: list });
      },
    });
  }

  if (options.createSubscription) {
    const create = options.createSubscription;
    defs.push({
      name: 'start_subscription',
      title: `Subscribe to ${merchant}`,
      description: `Start a ${merchant} subscription. Opens Razorpay Checkout; the user enters payment details and approves (UPI PIN, card OTP). Use a plan id from get_plans.`,
      inputSchema: {
        type: 'object',
        properties: { plan_id: { type: 'string', description: 'Plan id from get_plans' } },
        required: ['plan_id'],
      },
      annotations: { consequentialHint: true },
      execute: async (params, execOptions) => {
        const planId = String(params['plan_id'] ?? '');
        if (!planId) return result('plan_id is required. Call get_plans first.', { status: 'error' });
        return startCheckout(await create(planId), execOptions);
      },
    });
  }

  if (options.createOrder) {
    const create = options.createOrder;
    defs.push({
      name: 'start_payment',
      title: `Pay ${merchant}`,
      description: `Pay for the current ${merchant} order. Opens Razorpay Checkout; the user enters payment details and approves.`,
      inputSchema: { type: 'object', properties: {} },
      annotations: { consequentialHint: true },
      execute: async (_params, execOptions) => startCheckout(await create(), execOptions),
    });
  }

  const readTool = (name: string, title: string, description: string, fn: () => Promise<Record<string, unknown>>): WebMCPTool => ({
    name,
    title,
    description,
    inputSchema: { type: 'object', properties: {} },
    annotations: { readOnlyHint: true },
    execute: async () => {
      const data = await fn();
      return result(`${title}: ${JSON.stringify(data)}`, data);
    },
  });

  if (options.orderSummary) {
    defs.push(readTool('get_order_summary', 'Order summary', `Items, totals and currency for the current ${merchant} order.`, options.orderSummary));
  }
  if (options.subscriptionStatus) {
    defs.push(readTool('get_subscription_status', 'Subscription status', `Current ${merchant} plan and subscription state, as confirmed by Razorpay webhooks.`, options.subscriptionStatus));
  }
  if (options.paymentStatus) {
    defs.push(readTool('get_payment_status', 'Payment status', `Payment state of the current ${merchant} order, as confirmed by Razorpay webhooks.`, options.paymentStatus));
  }

  if (options.cancelSubscription) {
    const cancel = options.cancelSubscription;
    const confirmFirst = options.confirmCancel !== false;
    defs.push({
      name: 'cancel_subscription',
      title: `Cancel ${merchant} subscription`,
      description: `Cancel the current ${merchant} subscription. The user is asked to confirm first.`,
      inputSchema: { type: 'object', properties: {} },
      annotations: { consequentialHint: true },
      execute: async () => {
        if (confirmFirst && !window.confirm(`An AI agent wants to cancel your ${merchant} subscription. Cancel it?`)) {
          return result('The user declined to cancel the subscription.', { status: 'declined' });
        }
        await cancel();
        return result(`Cancellation requested. Call get_subscription_status to confirm.`, { status: 'cancel_requested' });
      },
    });
  }

  const controllers = new Map<string, AbortController>();
  for (const def of defs) {
    const controller = await registerToolDefinition(def);
    if (controller) controllers.set(def.name, controller);
  }

  return {
    tools: Array.from(controllers.keys()),
    destroy: async () => {
      await Promise.all(Array.from(controllers.entries()).map(([name, c]) => unregisterToolDefinition(name, c)));
      controllers.clear();
    },
  };
}
