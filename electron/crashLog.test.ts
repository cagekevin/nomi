import { describe, expect, it, vi } from "vitest";
import { installCrashHandlers } from "./crashLog";

describe("installCrashHandlers", () => {
  it("只监控未捕获异常，不接管 Node 的默认退出", () => {
    const listeners = new Map<string, (...args: unknown[]) => void>();
    const target = {
      on: vi.fn((event: string, listener: (...args: unknown[]) => void) => {
        listeners.set(event, listener);
        return target;
      }),
    };
    const record = vi.fn();

    installCrashHandlers(target, record);

    expect([...listeners.keys()]).toEqual(["uncaughtExceptionMonitor"]);
    expect(listeners.has("uncaughtException")).toBe(false);
    expect(listeners.has("unhandledRejection")).toBe(false);
  });

  it("monitor 路径只同步落盘一次，不再写回坏掉的终端", () => {
    let monitor: ((error: Error, origin: string) => void) | undefined;
    const target = {
      on: vi.fn((event: string, listener: (...args: unknown[]) => void) => {
        if (event === "uncaughtExceptionMonitor") {
          monitor = listener as (error: Error, origin: string) => void;
        }
        return target;
      }),
    };
    const record = vi.fn();
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const error = Object.assign(new Error("write EIO"), { code: "EIO" });

    installCrashHandlers(target, record);
    monitor?.(error, "uncaughtException");

    expect(record).toHaveBeenCalledOnce();
    expect(record).toHaveBeenCalledWith("uncaughtException", error);
    expect(consoleError).not.toHaveBeenCalled();
    consoleError.mockRestore();
  });
});
