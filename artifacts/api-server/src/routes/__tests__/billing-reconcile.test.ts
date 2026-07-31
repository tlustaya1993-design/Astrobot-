import { describe, expect, it, vi } from "vitest";
import { reconcileYookassaPaymentRows } from "../billing.js";

describe("reconcileYookassaPaymentRows", () => {
  it("applies an older paid payment even when a newer attempt is still pending", async () => {
    const localStatuses = new Map<number, string>([
      [2, "pending"],
      [1, "pending"],
    ]);
    const appliedPaymentIds = new Set<number>();

    const applyCredits = vi.fn(async (paymentId: number) => {
      if (localStatuses.get(paymentId) !== "succeeded" || appliedPaymentIds.has(paymentId)) {
        return 0;
      }
      appliedPaymentIds.add(paymentId);
      return paymentId === 1 ? 10 : 30;
    });
    const getProviderPayment = vi.fn(async (providerPaymentId: string) => ({
      status: providerPaymentId === "yk-old" ? "succeeded" : "pending",
    }));
    const updatePaymentFromProvider = vi.fn(async (paymentId: number, providerPayment: { status: string }) => {
      localStatuses.set(paymentId, providerPayment.status);
    });
    const warn = vi.fn();

    const result = await reconcileYookassaPaymentRows(
      [
        { id: 2, status: "pending", providerPaymentId: "yk-new" },
        { id: 1, status: "pending", providerPaymentId: "yk-old" },
      ],
      {
        sessionId: "session-1",
        applyCredits,
        getProviderPayment,
        updatePaymentFromProvider,
        warn,
      },
    );

    expect(result).toEqual({ applied: 10, status: "pending" });
    expect(appliedPaymentIds.has(1)).toBe(true);
    expect(getProviderPayment).toHaveBeenCalledWith("yk-new");
    expect(getProviderPayment).toHaveBeenCalledWith("yk-old");
    expect(warn).not.toHaveBeenCalled();
  });

  it("continues reconciling older rows when polling the latest payment fails", async () => {
    const localStatuses = new Map<number, string>([
      [2, "pending"],
      [1, "pending"],
    ]);

    const applyCredits = vi.fn(async (paymentId: number) => (
      localStatuses.get(paymentId) === "succeeded" ? 10 : 0
    ));
    const getProviderPayment = vi.fn(async (providerPaymentId: string) => {
      if (providerPaymentId === "yk-new") {
        throw new Error("provider unavailable");
      }
      return { status: "succeeded" };
    });
    const updatePaymentFromProvider = vi.fn(async (paymentId: number, providerPayment: { status: string }) => {
      localStatuses.set(paymentId, providerPayment.status);
    });
    const warn = vi.fn();

    const result = await reconcileYookassaPaymentRows(
      [
        { id: 2, status: "pending", providerPaymentId: "yk-new" },
        { id: 1, status: "pending", providerPaymentId: "yk-old" },
      ],
      {
        sessionId: "session-1",
        applyCredits,
        getProviderPayment,
        updatePaymentFromProvider,
        warn,
      },
    );

    expect(result).toEqual({ applied: 10, status: "pending" });
    expect(getProviderPayment).toHaveBeenCalledTimes(2);
    expect(updatePaymentFromProvider).toHaveBeenCalledWith(1, { status: "succeeded" });
    expect(warn).toHaveBeenCalledOnce();
  });
});
