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
    prefill?: {
        name?: string;
        email?: string;
        contact?: string;
    };
}
export interface RazorpayAdapterOptions {
    /** Merchant name shown in tool descriptions and Checkout. */
    merchant: string;
    plans?: () => Promise<RazorpayPlan[]>;
    createSubscription?: (planId: string) => Promise<RazorpayCheckoutSession>;
    subscriptionStatus?: () => Promise<Record<string, unknown>>;
    cancelSubscription?: () => Promise<void>;
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
type CheckoutOutcome = {
    outcome: 'submitted';
    response: Record<string, unknown>;
} | {
    outcome: 'dismissed';
} | {
    outcome: 'failed';
    reason: string;
} | {
    outcome: 'timed_out';
} | {
    outcome: 'aborted';
};
/** Open Checkout and wait until the user pays, closes it, or the call is aborted. */
export declare function openRazorpayCheckout(session: RazorpayCheckoutSession, opts?: {
    merchant: string;
    timeoutMs?: number;
    signal?: AbortSignal;
}): Promise<CheckoutOutcome>;
/**
 * Register Razorpay Checkout tools. Each tool is registered only when its hook is
 * supplied. Silently no-ops in browsers without WebMCP.
 */
export declare function razorpay(options: RazorpayAdapterOptions): Promise<RazorpayAdapterHandle>;
export {};
//# sourceMappingURL=razorpay.d.ts.map