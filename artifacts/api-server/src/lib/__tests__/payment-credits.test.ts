import { describe, expect, it } from "vitest";
import { paymentsTable, usersTable } from "@workspace/db";
import { applyCreditsIfNeededByPaymentId } from "../payment-credits.js";

type ClaimedPayment = {
  sessionId: string;
  creditsGranted: number;
};

function createFakeDatabase(options: {
  claims: ClaimedPayment[];
  userExists?: boolean;
}) {
  const events: string[] = [];
  const userUpdates: Array<{ setValues: unknown }> = [];
  const claims = [...options.claims];
  const userExists = options.userExists ?? true;

  const tx = {
    update(table: unknown) {
      return {
        set(setValues: unknown) {
          return {
            where(_whereExpr: unknown) {
              return {
                returning(_shape: unknown) {
                  if (table === paymentsTable) {
                    events.push("claim-payment");
                    const claimed = claims.shift();
                    return Promise.resolve(claimed ? [claimed] : []);
                  }
                  if (table === usersTable) {
                    events.push("increment-user");
                    userUpdates.push({ setValues });
                    return Promise.resolve(userExists ? [{ id: 1 }] : []);
                  }
                  throw new Error("Unexpected table update");
                },
              };
            },
          };
        },
      };
    },
  };

  const database = {
    transaction<T>(fn: (transaction: typeof tx) => Promise<T>) {
      return fn(tx);
    },
  };

  return { database, events, userUpdates };
}

describe("applyCreditsIfNeededByPaymentId", () => {
  it("increments balance only after atomically claiming the payment row", async () => {
    const fake = createFakeDatabase({
      claims: [{ sessionId: "session-1", creditsGranted: 10 }],
    });

    await expect(
      applyCreditsIfNeededByPaymentId(123, fake.database as never),
    ).resolves.toBe(10);

    expect(fake.events).toEqual(["claim-payment", "increment-user"]);
    expect(fake.userUpdates).toHaveLength(1);
  });

  it("does not increment balance when another caller already claimed the payment", async () => {
    const fake = createFakeDatabase({ claims: [] });

    await expect(
      applyCreditsIfNeededByPaymentId(123, fake.database as never),
    ).resolves.toBe(0);

    expect(fake.events).toEqual(["claim-payment"]);
    expect(fake.userUpdates).toHaveLength(0);
  });

  it("fails the transaction if the owning session row is missing", async () => {
    const fake = createFakeDatabase({
      claims: [{ sessionId: "missing-session", creditsGranted: 10 }],
      userExists: false,
    });

    await expect(
      applyCreditsIfNeededByPaymentId(123, fake.database as never),
    ).rejects.toThrow("user session not found");
  });
});
