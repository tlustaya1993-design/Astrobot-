import crypto from "node:crypto";

type YooKassaCreatePaymentPayload = {
  amount: {
    value: string;
    currency: "RUB";
  };
  capture: boolean;
  confirmation: {
    type: "redirect";
    return_url: string;
  };
  description?: string;
  metadata?: Record<string, string>;
  receipt?: {
    customer?: {
      email?: string;
      phone?: string;
    };
    items: Array<{
      description: string;
      quantity: string;
      amount: {
        value: string;
        currency: "RUB";
      };
      vat_code: number;
      payment_mode:
        | "full_prepayment"
        | "prepayment"
        | "advance"
        | "full_payment"
        | "partial_payment"
        | "credit"
        | "credit_payment";
      payment_subject:
        | "commodity"
        | "excise"
        | "job"
        | "service"
        | "gambling_bet"
        | "gambling_prize"
        | "lottery"
        | "lottery_prize"
        | "intellectual_activity"
        | "payment"
        | "agent_commission"
        | "composite"
        | "another";
      country_of_origin_code?: string;
      customs_declaration_number?: string;
      excise?: string;
      supplier?: {
        name: string;
        phone?: string;
        inn?: string;
      };
    }>;
    tax_system_code?: 1 | 2 | 3 | 4 | 5 | 6;
  };
};

type YooKassaCreatePaymentResponse = {
  id: string;
  status: string;
  paid: boolean;
  amount: {
    value: string;
    currency: string;
  };
  confirmation?: {
    type: string;
    confirmation_url?: string;
  };
  metadata?: Record<string, string>;
};

type YooKassaPaymentObject = {
  id: string;
  status: string;
  paid: boolean;
  metadata?: Record<string, string>;
  amount?: {
    value: string;
    currency: string;
  };
};

type YooKassaWebhookEvent = {
  type: string;
  event: string;
  object: YooKassaPaymentObject;
};

export type YooKassaErrorKind =
  | "http"
  | "timeout"
  | "network"
  | "config"
  | "unknown";

export class YooKassaError extends Error {
  readonly kind: YooKassaErrorKind;
  readonly status?: number;
  readonly body?: string;
  readonly requestId?: string;
  readonly operation: "create_payment" | "get_payment" | "create_refund";

  constructor(params: {
    message: string;
    kind: YooKassaErrorKind;
    operation: "create_payment" | "get_payment" | "create_refund";
    status?: number;
    body?: string;
    requestId?: string;
    cause?: unknown;
  }) {
    super(params.message);
    this.name = "YooKassaError";
    this.kind = params.kind;
    this.operation = params.operation;
    this.status = params.status;
    this.body = params.body;
    this.requestId = params.requestId;
    if (params.cause !== undefined) {
      // Node 18+ supports ErrorOptions.cause, but keep backward-compatible assignment.
      (this as Error & { cause?: unknown }).cause = params.cause;
    }
  }
}

function getRequiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new YooKassaError({
      kind: "config",
      operation: "create_payment",
      message: `${name} is required for YooKassa integration`,
    });
  }
  return value;
}

function getAuthHeader(): string {
  const shopId = getRequiredEnv("YOOKASSA_SHOP_ID");
  const secret = getRequiredEnv("YOOKASSA_SECRET_KEY");
  const token = Buffer.from(`${shopId}:${secret}`).toString("base64");
  return `Basic ${token}`;
}

function getBaseUrl(): string {
  return process.env.YOOKASSA_API_BASE_URL || "https://api.yookassa.ru/v3";
}

function getTimeoutMs(): number {
  const raw = Number.parseInt(process.env.YOOKASSA_TIMEOUT_MS ?? "", 10);
  if (!Number.isFinite(raw) || raw < 1000) return 15_000;
  return raw;
}

export async function createYooKassaPayment(
  payload: YooKassaCreatePaymentPayload,
  options?: { idempotenceKey?: string },
): Promise<YooKassaCreatePaymentResponse> {
  const idempotenceKey = options?.idempotenceKey ?? crypto.randomUUID();
  try {
    const response = await fetch(`${getBaseUrl()}/payments`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: getAuthHeader(),
        "Idempotence-Key": idempotenceKey,
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(getTimeoutMs()),
    });

    if (!response.ok) {
      const body = await response.text();
      const requestId =
        response.headers.get("x-request-id") ??
        response.headers.get("X-Request-Id") ??
        undefined;
      throw new YooKassaError({
        kind: "http",
        operation: "create_payment",
        status: response.status,
        body,
        requestId,
        message: `YooKassa create payment failed: ${response.status}`,
      });
    }

    return (await response.json()) as YooKassaCreatePaymentResponse;
  } catch (error) {
    if (error instanceof YooKassaError) throw error;
    if (error instanceof Error && error.name === "TimeoutError") {
      throw new YooKassaError({
        kind: "timeout",
        operation: "create_payment",
        message: "YooKassa create payment timed out",
        cause: error,
      });
    }
    if (error instanceof Error) {
      throw new YooKassaError({
        kind: "network",
        operation: "create_payment",
        message: error.message || "YooKassa network error while creating payment",
        cause: error,
      });
    }
    throw new YooKassaError({
      kind: "unknown",
      operation: "create_payment",
      message: "Unknown YooKassa error while creating payment",
      cause: error,
    });
  }
}

export async function getYooKassaPayment(paymentId: string): Promise<YooKassaPaymentObject> {
  try {
    const response = await fetch(`${getBaseUrl()}/payments/${paymentId}`, {
      method: "GET",
      headers: {
        Authorization: getAuthHeader(),
      },
      signal: AbortSignal.timeout(getTimeoutMs()),
    });

    if (!response.ok) {
      const body = await response.text();
      const requestId =
        response.headers.get("x-request-id") ??
        response.headers.get("X-Request-Id") ??
        undefined;
      throw new YooKassaError({
        kind: "http",
        operation: "get_payment",
        status: response.status,
        body,
        requestId,
        message: `YooKassa get payment failed: ${response.status}`,
      });
    }

    return (await response.json()) as YooKassaPaymentObject;
  } catch (error) {
    if (error instanceof YooKassaError) throw error;
    if (error instanceof Error && error.name === "TimeoutError") {
      throw new YooKassaError({
        kind: "timeout",
        operation: "get_payment",
        message: "YooKassa get payment timed out",
        cause: error,
      });
    }
    if (error instanceof Error) {
      throw new YooKassaError({
        kind: "network",
        operation: "get_payment",
        message: error.message || "YooKassa network error while loading payment",
        cause: error,
      });
    }
    throw new YooKassaError({
      kind: "unknown",
      operation: "get_payment",
      message: "Unknown YooKassa error while loading payment",
      cause: error,
    });
  }
}

export function parseYooKassaWebhook(body: unknown): YooKassaWebhookEvent {
  if (!body || typeof body !== "object") {
    throw new Error("Invalid webhook payload");
  }
  const event = body as Partial<YooKassaWebhookEvent>;
  if (!event.event || !event.object || !event.object.id) {
    throw new Error("Webhook payload missing required fields");
  }
  return event as YooKassaWebhookEvent;
}

type YooKassaRefundResponse = {
  id: string;
  status: string;
  amount: { value: string; currency: string };
  payment_id: string;
};

export async function createYooKassaRefund(
  paymentId: string,
  amount: { value: string; currency: string },
  options?: { idempotenceKey?: string },
): Promise<YooKassaRefundResponse> {
  const idempotenceKey = options?.idempotenceKey ?? crypto.randomUUID();
  try {
    const response = await fetch(`${getBaseUrl()}/refunds`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: getAuthHeader(),
        "Idempotence-Key": idempotenceKey,
      },
      body: JSON.stringify({ payment_id: paymentId, amount }),
      signal: AbortSignal.timeout(getTimeoutMs()),
    });

    if (!response.ok) {
      const body = await response.text();
      const requestId =
        response.headers.get("x-request-id") ??
        response.headers.get("X-Request-Id") ??
        undefined;
      throw new YooKassaError({
        kind: "http",
        operation: "create_refund",
        status: response.status,
        body,
        requestId,
        message: `YooKassa create refund failed: ${response.status}`,
      });
    }

    return (await response.json()) as YooKassaRefundResponse;
  } catch (error) {
    if (error instanceof YooKassaError) throw error;
    if (error instanceof Error && error.name === "TimeoutError") {
      throw new YooKassaError({ kind: "timeout", operation: "create_refund", message: "YooKassa refund timed out", cause: error });
    }
    if (error instanceof Error) {
      throw new YooKassaError({ kind: "network", operation: "create_refund", message: error.message, cause: error });
    }
    throw new YooKassaError({ kind: "unknown", operation: "create_refund", message: "Unknown YooKassa refund error", cause: error });
  }
}

// Backward-compatible aliases for variant spellings.
export const createYookassaPayment = createYooKassaPayment;
export const getYookassaPayment = getYooKassaPayment;
export const createYookassaRefund = createYooKassaRefund;
export const parseYookassaNotification = parseYooKassaWebhook;

// Signature validation can be added later if/when YooKassa webhook signing is enabled.
export function validateYookassaWebhook(_req: { headers?: Record<string, unknown> }): boolean {
  return true;
}

