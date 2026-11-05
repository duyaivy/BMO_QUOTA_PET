"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type {
  DeviceConfig,
  DeviceScreen,
  ProviderView,
} from "@/contracts/dashboard";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { OledPreview } from "@/components/device/oled-preview";

type QuotaChoice = {
  value: string;
  providerId: ProviderView["providerId"];
  windowId: string;
  label: string;
};
function newScreenId(providerId: string) {
  return `q-${providerId}-${Math.random().toString(36).slice(2, 10)}`;
}

export function DeviceEditor({
  initialDevice,
  providers,
  generatedAt,
  freshnessThresholdSeconds,
}: {
  initialDevice: DeviceConfig;
  providers: ProviderView[];
  generatedAt: number;
  freshnessThresholdSeconds: number;
}) {
  const router = useRouter();
  const [saved, setSaved] = useState(initialDevice);
  const [name, setName] = useState(initialDevice.name);
  const [screens, setScreens] = useState<DeviceScreen[]>(initialDevice.screens);
  const [selection, setSelection] = useState("");
  const [previewId, setPreviewId] = useState(
    initialDevice.screens[0]?.screenId ?? "pet-home",
  );
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const choices = useMemo<QuotaChoice[]>(
    () =>
      providers
        .flatMap((provider) =>
          provider.windows.map(({ window }) => ({
            value: JSON.stringify([provider.providerId, window.windowId]),
            providerId: provider.providerId,
            windowId: window.windowId,
            label: `${provider.name} · ${window.label}`,
          })),
        )
        .filter(
          (choice) =>
            !screens.some(
              (screen) =>
                screen.kind === "quota" &&
                screen.providerId === choice.providerId &&
                screen.windowId === choice.windowId,
            ),
        ),
    [providers, screens],
  );
  const selectedValue =
    selection && choices.some((choice) => choice.value === selection)
      ? selection
      : (choices[0]?.value ?? "");
  const previewScreen =
    screens.find((screen) => screen.screenId === previewId) ?? screens[0];

  function move(index: number, delta: -1 | 1) {
    const target = index + delta;
    if (index === 0 || target < 1 || target >= screens.length) return;
    setScreens((current) => {
      const next = [...current];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  }
  function addScreen() {
    const choice = choices.find((item) => item.value === selectedValue);
    if (!choice || screens.length >= 16) return;
    const next: DeviceScreen = {
      screenId: newScreenId(choice.providerId),
      kind: "quota",
      providerId: choice.providerId,
      windowId: choice.windowId,
    };
    setScreens((current) => [...current, next]);
    setPreviewId(next.screenId);
  }
  async function save() {
    setBusy(true);
    setMessage("");
    try {
      const csrfResponse = await fetch("/api/auth/csrf", { cache: "no-store" });
      if (!csrfResponse.ok) throw new Error("CSRF");
      const { csrfToken } = (await csrfResponse.json()) as {
        csrfToken?: string;
      };
      if (!csrfToken) throw new Error("CSRF");
      const response = await fetch("/api/devices/config", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "X-CSRF-Token": csrfToken,
        },
        body: JSON.stringify({
          expectedRevision: saved.revision,
          name,
          screens,
        }),
      });
      const body = (await response.json().catch(() => null)) as {
        data?: DeviceConfig;
        error?: { code?: string };
      } | null;
      if (response.status === 409) {
        const latestResponse = await fetch("/api/devices/config", {
          cache: "no-store",
        });
        const latest = (await latestResponse.json().catch(() => null)) as {
          data?: DeviceConfig;
        } | null;
        if (latestResponse.ok && latest?.data) setSaved(latest.data);
        setMessage(
          "Cài đặt hiển thị đã thay đổi ở nơi khác. Các chỉnh sửa của bạn vẫn còn ở đây; hãy nhấn lưu lại để áp dụng trên phiên bản mới nhất.",
        );
        router.refresh();
        return;
      }
      if (!response.ok || !body?.data) throw new Error("SAVE_FAILED");
      setSaved(body.data);
      setName(body.data.name);
      setScreens(body.data.screens);
      setPreviewId(body.data.screens[0]?.screenId ?? "pet-home");
      setMessage("Đã lưu cài đặt hiển thị");
      router.refresh();
    } catch {
      setMessage(
        "Không thể lưu cài đặt hiển thị. Vui lòng kiểm tra kết nối và thử lại.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(260px,0.7fr)]">
      <Card>
        <CardHeader>
          <CardTitle>Cài đặt hiển thị</CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="grid gap-2">
            <label htmlFor="device-name" className="text-sm font-medium">
              Tên màn hình
            </label>
            <input
              id="device-name"
              value={name}
              maxLength={80}
              onChange={(event) => setName(event.target.value)}
              className="h-10 rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
          </div>
          <div className="grid gap-2">
            <label htmlFor="add-quota-screen" className="text-sm font-medium">
              Thêm màn hình hạn mức
            </label>
            <div className="flex flex-col gap-2 sm:flex-row">
              <select
                id="add-quota-screen"
                aria-label="Thêm màn hình hạn mức"
                value={selectedValue}
                disabled={!choices.length || screens.length >= 16}
                onChange={(event) => setSelection(event.target.value)}
                className="h-10 min-w-0 flex-1 rounded-md border border-input bg-background px-3 text-sm"
              >
                <option value="">
                  {choices.length
                    ? "Chọn một khung hạn mức"
                    : "Không còn khung hạn mức mới nào"}
                </option>
                {choices.map((choice) => (
                  <option key={choice.value} value={choice.value}>
                    {choice.label}
                  </option>
                ))}
              </select>
              <Button
                type="button"
                variant="outline"
                disabled={!choices.length || screens.length >= 16}
                onClick={addScreen}
              >
                Thêm màn hình
              </Button>
            </div>
          </div>
          <ol aria-label="Danh sách màn hình hiển thị" className="space-y-2">
            {screens.map((screen, index) => {
              const title =
                screen.kind === "pet"
                  ? "Màn hình chính BMO"
                  : `${providers.find((provider) => provider.providerId === screen.providerId)?.name ?? screen.providerId} · ${providers.find((provider) => provider.providerId === screen.providerId)?.windows.find(({ window }) => window.windowId === screen.windowId)?.window.label ?? screen.windowId}`;
              return (
                <li key={screen.screenId} className="rounded-lg border p-3">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <button
                      type="button"
                      onClick={() => setPreviewId(screen.screenId)}
                      aria-pressed={previewScreen.screenId === screen.screenId}
                      className="min-h-10 text-left text-sm font-medium underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      {index + 1}. {title}
                      {screen.kind === "pet" ? " (cố định đầu tiên)" : ""}
                    </button>
                    <div className="flex flex-wrap gap-2">
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        aria-label="Lên trên"
                        disabled={index < 2}
                        onClick={() => move(index, -1)}
                      >
                        Lên trên
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        aria-label="Xuống dưới"
                        disabled={index === 0 || index === screens.length - 1}
                        onClick={() => move(index, 1)}
                      >
                        Xuống dưới
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        aria-label="Xóa màn hình"
                        disabled={index === 0}
                        onClick={() => {
                          setScreens((current) =>
                            current.filter(
                              (item) => item.screenId !== screen.screenId,
                            ),
                          );
                          if (previewId === screen.screenId)
                            setPreviewId(screens[0]?.screenId ?? "pet-home");
                        }}
                      >
                        Xóa màn hình
                      </Button>
                    </div>
                  </div>
                </li>
              );
            })}
          </ol>
          <div className="flex flex-wrap items-center gap-3">
            <Button
              type="button"
              disabled={busy || !name.trim() || name.trim().length > 80}
              onClick={() => void save()}
            >
              {busy ? "Đang lưu…" : "Lưu cài đặt hiển thị"}
            </Button>
            <span className="text-xs text-muted-foreground">
              Phiên bản {saved.revision}
            </span>
          </div>
          {message ? (
            <p role="status" className="text-sm text-muted-foreground">
              {message}
            </p>
          ) : null}
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Xem trước màn hình OLED</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid gap-2">
            <label htmlFor="preview-screen" className="text-sm font-medium">
              Màn hình xem trước
            </label>
            <select
              id="preview-screen"
              value={previewScreen.screenId}
              onChange={(event) => setPreviewId(event.target.value)}
              className="h-10 rounded-md border border-input bg-background px-3 text-sm"
            >
              {screens.map((screen, index) => (
                <option key={screen.screenId} value={screen.screenId}>
                  {index + 1}.{" "}
                  {screen.kind === "pet"
                    ? "Màn hình chính BMO"
                    : screen.windowId}
                </option>
              ))}
            </select>
          </div>
          <OledPreview
            screen={previewScreen}
            providers={providers}
            generatedAt={generatedAt}
            freshnessThresholdSeconds={freshnessThresholdSeconds}
          />
        </CardContent>
      </Card>
    </div>
  );
}
