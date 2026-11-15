"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type {
  WeatherLocationChoice,
  WeatherSettingsView,
} from "@/contracts/weather";

type Envelope<T> = { data?: T; error?: { code?: string } };
function placeName(place: WeatherLocationChoice): string {
  return [place.name, place.admin1, place.country].filter(Boolean).join(" · ");
}
function formatTime(value: string | null): string {
  return value
    ? new Intl.DateTimeFormat("vi-VN", {
        timeZone: "Asia/Ho_Chi_Minh",
        dateStyle: "short",
        timeStyle: "short",
      }).format(new Date(value))
    : "Chưa có";
}
const statusLabel: Record<WeatherSettingsView["status"], string> = {
  unconfigured: "Chưa chọn địa điểm",
  pending: "Đang chờ cập nhật thời tiết",
  fresh: "Dữ liệu mới",
  stale: "Dữ liệu cũ",
  error: "Chưa thể cập nhật thời tiết",
};
const conditionLabel: Record<
  NonNullable<WeatherSettingsView["condition"]>,
  string
> = {
  clear: "Trời quang",
  partly_cloudy: "Ít mây",
  cloudy: "Nhiều mây",
  rain: "Mưa",
  storm: "Dông",
  fog: "Sương mù",
  snow: "Tuyết",
  unknown: "Chưa rõ",
};
function newer(
  current: WeatherSettingsView,
  incoming: WeatherSettingsView,
): WeatherSettingsView {
  if (incoming.revision < current.revision) return current;
  if (incoming.revision > current.revision) return incoming;
  const oldTime = Date.parse(
    current.lastJobAt ?? current.fetchedAt ?? "1970-01-01T00:00:00Z",
  );
  const newTime = Date.parse(
    incoming.lastJobAt ?? incoming.fetchedAt ?? "1970-01-01T00:00:00Z",
  );
  if (
    newTime < oldTime ||
    (newTime === oldTime &&
      current.status === "fresh" &&
      incoming.status === "pending")
  )
    return current;
  return incoming;
}

export function WeatherSettings({
  initialSettings,
}: {
  initialSettings: WeatherSettingsView;
}) {
  const [saved, setSaved] = useState(initialSettings);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<WeatherLocationChoice[]>([]);
  const [selected, setSelected] = useState<number | null>(null);
  const [searching, setSearching] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const searchSeq = useRef(0);
  const searchAbort = useRef<AbortController | null>(null);

  useEffect(() => {
    let active = true;
    void fetch("/api/settings/weather", { cache: "no-store" })
      .then(async (response) => {
        const body = (await response.json()) as Envelope<WeatherSettingsView>;
        if (active && response.ok && body.data)
          setSaved((current) => newer(current, body.data!));
      })
      .catch(() => {});
    return () => {
      active = false;
      searchAbort.current?.abort();
    };
  }, []);
  useEffect(() => {
    if (saved.status !== "pending") return;
    const started = Date.now();
    let stopped = false;
    const timer = setInterval(() => {
      if (Date.now() - started >= 30000) {
        setMessage("Đã lưu địa điểm, đang chờ lần cập nhật tiếp theo");
        clearInterval(timer);
        return;
      }
      if (stopped || document.visibilityState !== "visible") return;
      void fetch("/api/settings/weather", { cache: "no-store" })
        .then(async (response) => {
          const body = (await response.json()) as Envelope<WeatherSettingsView>;
          if (!stopped && response.ok && body.data)
            setSaved((current) => newer(current, body.data!));
        })
        .catch(() => {});
    }, 5000);
    return () => {
      stopped = true;
      clearInterval(timer);
    };
  }, [saved.revision, saved.status]);
  async function search(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmed = query.trim();
    if (trimmed.length < 3 || trimmed.length > 100) {
      setMessage("Nhập từ 3 đến 100 ký tự để tìm địa điểm");
      return;
    }
    searchAbort.current?.abort();
    const controller = new AbortController();
    searchAbort.current = controller;
    const sequence = ++searchSeq.current;
    setSearching(true);
    setMessage("");
    try {
      const response = await fetch(
        `/api/weather/locations?q=${encodeURIComponent(trimmed)}`,
        { cache: "no-store", signal: controller.signal },
      );
      const body = (await response.json()) as Envelope<WeatherLocationChoice[]>;
      if (sequence !== searchSeq.current) return;
      if (!response.ok || !body.data) throw new Error(String(response.status));
      setResults(body.data);
      setSelected(null);
      if (!body.data.length) setMessage("Không tìm thấy địa điểm phù hợp");
    } catch (error) {
      if (sequence !== searchSeq.current || controller.signal.aborted) return;
      setMessage(
        error instanceof Error && error.message === "429"
          ? "Bạn đã tìm quá nhiều lần. Vui lòng thử lại sau một phút."
          : "Không thể tìm địa điểm lúc này. Vui lòng thử lại.",
      );
    } finally {
      if (sequence === searchSeq.current) setSearching(false);
    }
  }
  async function save() {
    if (selected === null) return;
    setSaving(true);
    setMessage("");
    try {
      const csrfResponse = await fetch("/api/auth/csrf", { cache: "no-store" });
      if (!csrfResponse.ok) throw new Error("CSRF");
      const csrf = ((await csrfResponse.json()) as { csrfToken?: string })
        .csrfToken;
      if (!csrf) throw new Error("CSRF");
      const response = await fetch("/api/settings/weather", {
        method: "POST",
        headers: { "content-type": "application/json", "X-CSRF-Token": csrf },
        body: JSON.stringify({
          expectedRevision: saved.revision,
          locationId: selected,
        }),
      });
      const body = (await response
        .json()
        .catch(() => null)) as Envelope<WeatherSettingsView> | null;
      if (response.status === 409) {
        const latest = await fetch("/api/settings/weather", {
          cache: "no-store",
        });
        const latestBody = (await latest
          .json()
          .catch(() => null)) as Envelope<WeatherSettingsView> | null;
        if (latest.ok && latestBody?.data)
          setSaved((current) => newer(current, latestBody.data!));
        setMessage(
          "Địa điểm đã thay đổi ở nơi khác. Lựa chọn của bạn vẫn còn; hãy xem địa điểm mới rồi bấm lưu lại.",
        );
        return;
      }
      if (!response.ok || !body?.data) throw new Error(String(response.status));
      setSaved((current) => newer(current, body.data!));
      setMessage("Đã lưu địa điểm. Đang chờ cập nhật thời tiết.");
    } catch (error) {
      setMessage(
        error instanceof Error && error.message === "429"
          ? "Bạn đã dùng hết lượt tìm địa điểm. Vui lòng thử lại sau một phút."
          : "Không thể lưu địa điểm lúc này. Lựa chọn của bạn vẫn còn.",
      );
    } finally {
      setSaving(false);
    }
  }
  return (
    <section aria-label="Thời tiết trên BMO">
      <Card>
        <CardHeader>
          <CardTitle>Thời tiết trên BMO</CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="space-y-1 text-sm">
            <p>
              <span className="font-medium">Địa điểm đã lưu:</span>{" "}
              {saved.location
                ? placeName(saved.location)
                : "Chưa chọn địa điểm"}
            </p>
            <p>Trạng thái: {statusLabel[saved.status]}</p>
            {saved.temperatureC !== null && saved.status === "fresh" && (
              <p>
                {saved.temperatureC} °C ·{" "}
                {conditionLabel[saved.condition ?? "unknown"]}
              </p>
            )}
            <p>Dữ liệu lúc: {formatTime(saved.dataAt)}</p>
            <p>Lấy thành công: {formatTime(saved.fetchedAt)}</p>
            <p>Giờ thiết bị: Việt Nam (UTC+7)</p>
            <p>BMO nhận cập nhật khi bạn đánh thức thiết bị</p>
          </div>
          <form onSubmit={search} className="space-y-2">
            <label
              htmlFor="weather-place-query"
              className="block text-sm font-medium"
            >
              Tìm thành phố hoặc tỉnh
            </label>
            <div className="flex flex-col gap-2 sm:flex-row">
              <input
                id="weather-place-query"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                maxLength={100}
                className="h-11 min-w-0 flex-1 rounded-lg border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
              <Button
                type="submit"
                disabled={searching || query.trim().length < 3}
              >
                {searching ? "Đang tìm..." : "Tìm địa điểm"}
              </Button>
            </div>
          </form>
          {results.length > 0 && (
            <fieldset className="space-y-2">
              <legend className="text-sm font-medium">Kết quả tìm kiếm</legend>
              {results.map((place) => (
                <label
                  key={place.id}
                  className="flex min-h-11 items-center gap-2 rounded-lg border border-border p-2 text-sm"
                >
                  <input
                    type="radio"
                    name="weather-location"
                    checked={selected === place.id}
                    onChange={() => setSelected(place.id)}
                  />
                  <span>{placeName(place)}</span>
                </label>
              ))}
            </fieldset>
          )}
          <Button
            type="button"
            onClick={save}
            disabled={selected === null || saving}
          >
            {saving ? "Đang lưu..." : "Lưu địa điểm"}
          </Button>
          <p
            role="status"
            aria-live="polite"
            className="text-sm text-muted-foreground"
          >
            {message}
          </p>
          <p className="text-xs text-muted-foreground">
            Dữ liệu thời tiết: Open-Meteo. Địa điểm do Open-Meteo Geocoding cung
            cấp.
          </p>
        </CardContent>
      </Card>
    </section>
  );
}
