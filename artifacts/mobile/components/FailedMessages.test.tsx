import { act, fireEvent, render, screen } from "@testing-library/react";
import { Alert } from "react-native";
import { describe, expect, it, vi } from "vitest";

import {
  enqueueMessage,
  getOutbox,
  getOutboxFor,
  markFailed,
  type QueuedMessage,
} from "@/lib/offlineQueue";
import { FailedMessages } from "./FailedMessages";

type AlertButton = {
  text?: string;
  onPress?: () => void;
  style?: string;
};

async function makeFailed(content = "boom"): Promise<QueuedMessage> {
  const item = await enqueueMessage(1, { content });
  await markFailed(item.id, "network");
  const all = await getOutboxFor(1);
  return all.find((m) => m.id === item.id)!;
}

function pressAlertButton(label: string): void {
  const spy = Alert.alert as unknown as ReturnType<typeof vi.fn>;
  expect(spy).toHaveBeenCalled();
  const lastCall = spy.mock.calls[spy.mock.calls.length - 1];
  const buttons = lastCall[2] as AlertButton[];
  const btn = buttons.find((b) => b.text === label);
  if (!btn?.onPress) throw new Error(`No alert button labeled ${label}`);
  btn.onPress();
}

async function settle(): Promise<void> {
  await act(async () => {
    await new Promise((r) => setTimeout(r, 10));
  });
}

describe("FailedMessages", () => {
  it("renders nothing when there are no failed items", () => {
    const { container } = render(<FailedMessages items={[]} />);
    expect(container.textContent).toBe("");
  });

  it("shows a failed-message banner with the body content", async () => {
    const item = await makeFailed("hello world");
    render(<FailedMessages items={[item]} />);

    expect(screen.getByText("hello world")).toBeTruthy();
    expect(screen.getByText("1 message didn't send")).toBeTruthy();
  });

  it("Retry resets attempts and re-queues the message", async () => {
    const spy = vi.spyOn(Alert, "alert").mockImplementation(() => undefined);
    const item = await makeFailed("retry me");
    render(<FailedMessages items={[item]} />);

    fireEvent.click(
      screen.getByLabelText("Failed message, tap for retry options"),
    );
    pressAlertButton("Retry");
    await settle();

    const after = (await getOutboxFor(1)).find((m) => m.id === item.id)!;
    expect(after.status).toBe("pending");
    expect(after.attempts).toBe(0);
    expect(after.lastError).toBeUndefined();
    spy.mockRestore();
  });

  it("Delete removes the failed message from the outbox", async () => {
    const spy = vi.spyOn(Alert, "alert").mockImplementation(() => undefined);
    const item = await makeFailed("delete me");
    render(<FailedMessages items={[item]} />);

    fireEvent.click(
      screen.getByLabelText("Failed message, tap for retry options"),
    );
    pressAlertButton("Delete");
    await settle();

    expect(await getOutbox()).toHaveLength(0);
    spy.mockRestore();
  });

  it("Edit + Save & retry updates content and re-queues the message", async () => {
    const spy = vi.spyOn(Alert, "alert").mockImplementation(() => undefined);
    const item = await makeFailed("typo");
    render(<FailedMessages items={[item]} />);

    fireEvent.click(
      screen.getByLabelText("Failed message, tap for retry options"),
    );
    pressAlertButton("Edit");

    const input = await screen.findByPlaceholderText("Message");
    fireEvent.change(input, { target: { value: "fixed copy" } });
    fireEvent.click(screen.getByText("Save & retry"));
    await settle();

    const after = (await getOutboxFor(1)).find((m) => m.id === item.id)!;
    expect(after.data.content).toBe("fixed copy");
    expect(after.status).toBe("pending");
    expect(after.attempts).toBe(0);
    spy.mockRestore();
  });
});
