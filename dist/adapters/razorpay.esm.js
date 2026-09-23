// src/registry.ts
function getModelContext() {
  if (typeof document !== "undefined" && document.modelContext)
    return document.modelContext;
  if (typeof navigator !== "undefined" && navigator.modelContext)
    return navigator.modelContext;
  return null;
}
async function registerToolDefinition(toolDef, debug = false) {
  const ctx = getModelContext();
  if (!ctx)
    return null;
  const controller = new AbortController();
  try {
    await ctx.registerTool(toolDef, { signal: controller.signal });
    return controller;
  } catch (err) {
    if (isDuplicateNameError(err) && typeof ctx.unregisterTool === "function") {
      try {
        await ctx.unregisterTool(toolDef.name);
        await ctx.registerTool(toolDef, { signal: controller.signal });
        return controller;
      } catch (retryErr) {
        err = retryErr;
      }
    }
    if (debug)
      warnRegistrationError(toolDef.name, err);
    return null;
  }
}
async function unregisterToolDefinition(name, controller) {
  controller?.abort();
  try {
    await getModelContext()?.unregisterTool?.(name);
  } catch {
  }
}
function isDuplicateNameError(err) {
  return err instanceof DOMException && err.name === "InvalidStateError";
}
function warnRegistrationError(name, err) {
  const kind = err instanceof DOMException ? err.name : "";
  const hint = kind === "NotAllowedError" ? ' The "tools" Permissions Policy blocks this document (cross-origin iframes need allow="tools").' : kind === "SecurityError" ? " WebMCP requires an origin-keyed agent cluster (is document.domain set?)." : kind === "InvalidStateError" ? " Check for a duplicate name, an invalid name (allowed: A-Z a-z 0-9 _ - .), or an empty description." : "";
  console.warn(`[auto-webmcp] registerTool("${name}") failed: ${String(err)}.${hint}`);
}

// src/adapters/razorpay.ts
function result(summary, data) {
  return { content: [{ type: "text", text: summary }, { type: "text", text: JSON.stringify(data) }] };
}
var CHECKOUT_SRC = "https://checkout.razorpay.com/v1/checkout.js";
function loadCheckout() {
  const existing = window.Razorpay;
  if (existing)
    return Promise.resolve(existing);
  return new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = CHECKOUT_SRC;
    script.onload = () => {
      const ctor = window.Razorpay;
      if (ctor)
        resolve(ctor);
      else
        reject(new Error("Razorpay Checkout did not initialise"));
    };
    script.onerror = () => reject(new Error("Razorpay Checkout failed to load"));
    document.head.appendChild(script);
  });
}
async function openRazorpayCheckout(session, opts = { merchant: "" }) {
  const Razorpay = await loadCheckout();
  return new Promise((resolve) => {
    let settled = false;
    let instance = null;
    let lastFailure = null;
    const finish = (value) => {
      if (settled)
        return;
      settled = true;
      clearTimeout(timer);
      resolve(value);
    };
    const timer = setTimeout(
      () => finish(lastFailure ? { outcome: "failed", reason: lastFailure } : { outcome: "timed_out" }),
      opts.timeoutMs ?? 10 * 60 * 1e3
    );
    instance = new Razorpay({
      key: session.keyId,
      ...session.subscriptionId && { subscription_id: session.subscriptionId },
      ...session.orderId && { order_id: session.orderId },
      ...session.amount !== void 0 && { amount: session.amount },
      ...session.currency && { currency: session.currency },
      name: session.name ?? opts.merchant,
      ...session.description && { description: session.description },
      ...session.prefill && { prefill: session.prefill },
      handler: (response) => finish({ outcome: "submitted", response }),
      modal: { ondismiss: () => finish(lastFailure ? { outcome: "failed", reason: lastFailure } : { outcome: "dismissed" }) }
    });
    instance.on("payment.failed", (response) => {
      const error = response["error"] ?? {};
      lastFailure = String(error["description"] ?? "payment failed").trim().replace(/[.\s]+$/, "");
    });
    opts.signal?.addEventListener("abort", () => {
      instance?.close();
      finish({ outcome: "aborted" });
    }, { once: true });
    instance.open();
  });
}
function signalFrom(options) {
  const s = options?.signal;
  return s instanceof AbortSignal ? s : void 0;
}
function describeOutcome(outcome, statusTool) {
  switch (outcome.outcome) {
    case "submitted":
      return result(
        `Payment submitted in Razorpay Checkout. The merchant confirms it by webhook; call ${statusTool} to check.`,
        { status: "submitted", payment_id: outcome.response["razorpay_payment_id"] ?? null }
      );
    case "dismissed":
      return result("The user closed Razorpay Checkout without paying.", { status: "dismissed" });
    case "failed":
      return result(`Payment failed: ${outcome.reason}. The user closed Checkout without a successful retry.`, { status: "failed", reason: outcome.reason });
    case "timed_out":
      return result(`Checkout is still open. Call ${statusTool} later to see if the user paid.`, { status: "awaiting_user_action" });
    case "aborted":
      return result("Checkout was closed because the call was cancelled.", { status: "cancelled" });
  }
}
async function razorpay(options) {
  const merchant = options.merchant;
  const timeoutMs = options.checkoutTimeoutMs;
  const defs = [];
  const statusTool = options.subscriptionStatus ? "get_subscription_status" : "get_payment_status";
  const startCheckout = async (session, execOptions) => {
    const outcome = await openRazorpayCheckout(session, { merchant, ...timeoutMs !== void 0 && { timeoutMs }, ...signalFrom(execOptions) && { signal: signalFrom(execOptions) } });
    if (outcome.outcome === "submitted")
      options.onPaymentSubmitted?.(outcome.response);
    return describeOutcome(outcome, statusTool);
  };
  if (options.plans) {
    const plans = options.plans;
    defs.push({
      name: "get_plans",
      title: `${merchant} plans`,
      description: `List ${merchant} subscription plans with prices. Amounts are in minor units (paise or cents).`,
      inputSchema: { type: "object", properties: {} },
      annotations: { readOnlyHint: true },
      execute: async () => {
        const list = await plans();
        return result(`${list.length} plan(s) available.`, { plans: list });
      }
    });
  }
  if (options.createSubscription) {
    const create = options.createSubscription;
    defs.push({
      name: "start_subscription",
      title: `Subscribe to ${merchant}`,
      description: `Start a ${merchant} subscription. Opens Razorpay Checkout; the user enters payment details and approves (UPI PIN, card OTP). Use a plan id from get_plans.`,
      inputSchema: {
        type: "object",
        properties: { plan_id: { type: "string", description: "Plan id from get_plans" } },
        required: ["plan_id"]
      },
      annotations: { consequentialHint: true },
      execute: async (params, execOptions) => {
        const planId = String(params["plan_id"] ?? "");
        if (!planId)
          return result("plan_id is required. Call get_plans first.", { status: "error" });
        return startCheckout(await create(planId), execOptions);
      }
    });
  }
  if (options.createOrder) {
    const create = options.createOrder;
    defs.push({
      name: "start_payment",
      title: `Pay ${merchant}`,
      description: `Pay for the current ${merchant} order. Opens Razorpay Checkout; the user enters payment details and approves.`,
      inputSchema: { type: "object", properties: {} },
      annotations: { consequentialHint: true },
      execute: async (_params, execOptions) => startCheckout(await create(), execOptions)
    });
  }
  const readTool = (name, title, description, fn) => ({
    name,
    title,
    description,
    inputSchema: { type: "object", properties: {} },
    annotations: { readOnlyHint: true },
    execute: async () => {
      const data = await fn();
      return result(`${title}: ${JSON.stringify(data)}`, data);
    }
  });
  if (options.orderSummary) {
    defs.push(readTool("get_order_summary", "Order summary", `Items, totals and currency for the current ${merchant} order.`, options.orderSummary));
  }
  if (options.subscriptionStatus) {
    defs.push(readTool("get_subscription_status", "Subscription status", `Current ${merchant} plan and subscription state, as confirmed by Razorpay webhooks.`, options.subscriptionStatus));
  }
  if (options.paymentStatus) {
    defs.push(readTool("get_payment_status", "Payment status", `Payment state of the current ${merchant} order, as confirmed by Razorpay webhooks.`, options.paymentStatus));
  }
  if (options.cancelSubscription) {
    const cancel = options.cancelSubscription;
    const confirmFirst = options.confirmCancel !== false;
    defs.push({
      name: "cancel_subscription",
      title: `Cancel ${merchant} subscription`,
      description: `Cancel the current ${merchant} subscription. The user is asked to confirm first.`,
      inputSchema: { type: "object", properties: {} },
      annotations: { consequentialHint: true },
      execute: async () => {
        if (confirmFirst && !window.confirm(`An AI agent wants to cancel your ${merchant} subscription. Cancel it?`)) {
          return result("The user declined to cancel the subscription.", { status: "declined" });
        }
        await cancel();
        return result(`Cancellation requested. Call get_subscription_status to confirm.`, { status: "cancel_requested" });
      }
    });
  }
  const controllers = /* @__PURE__ */ new Map();
  for (const def of defs) {
    const controller = await registerToolDefinition(def);
    if (controller)
      controllers.set(def.name, controller);
  }
  return {
    tools: Array.from(controllers.keys()),
    destroy: async () => {
      await Promise.all(Array.from(controllers.entries()).map(([name, c]) => unregisterToolDefinition(name, c)));
      controllers.clear();
    }
  };
}
export {
  openRazorpayCheckout,
  razorpay
};
