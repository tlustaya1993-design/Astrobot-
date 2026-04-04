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

function getRequiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} is required for YooKassa integration`);
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

export async function createYooKassaPayment(
  payload: YooKassaCreatePaymentPayload,
  options?: { idempotenceKey?: string },
): Promise<YooKassaCreatePaymentResponse> {
  const idempotenceKey = options?.idempotenceKey ?? crypto.randomUUID();
  const response = await fetch(`${getBaseUrl()}/payments`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: getAuthHeader(),
      "Idempotence-Key": idempotenceKey,
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`YooKassa create payment failed: ${response.status} ${body}`);
  }

  return (await response.json()) as YooKassaCreatePaymentResponse;
}

export async function getYooKassaPayment(paymentId: string): Promise<YooKassaPaymentObject> {
  const response = await fetch(`${getBaseUrl()}/payments/${paymentId}`, {
    method: "GET",
    headers: {
      Authorization: getAuthHeader(),
    },
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`YooKassa get payment failed: ${response.status} ${body}`);
  }

  return (await response.json()) as YooKassaPaymentObject;
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

// Backward-compatible aliases for variant spellings.
export const createYookassaPayment = createYooKassaPayment;
export const getYookassaPayment = getYooKassaPayment;
export const parseYookassaNotification = parseYooKassaWebhook;

// Signature validation can be added later if/when YooKassa webhook signing is enabled.
export function validateYookassaWebhook(_req: { headers?: Record<string, unknown> }): boolean {
  return true;
}

