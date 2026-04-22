import { useEffect, useMemo, useState } from "react";
import QRCode from "qrcode";

export function QrCodeImage({
  value,
  size = 128,
  className,
}: {
  value: string;
  size?: number;
  className?: string;
}) {
  const [dataUrl, setDataUrl] = useState<string | null>(null);

  const safeValue = useMemo(() => value.trim(), [value]);

  useEffect(() => {
    let cancelled = false;
    if (!safeValue) {
      setDataUrl(null);
      return;
    }
    QRCode.toDataURL(safeValue, {
      margin: 1,
      width: size,
      errorCorrectionLevel: "M",
      color: { dark: "#0f172a", light: "#ffffff" },
    })
      .then((url: string) => {
        if (!cancelled) setDataUrl(url);
      })
      .catch(() => {
        if (!cancelled) setDataUrl(null);
      });

    return () => {
      cancelled = true;
    };
  }, [safeValue, size]);

  if (!dataUrl) {
    return (
      <div
        className={[
          "flex items-center justify-center rounded-2xl border border-slate-200 bg-slate-50 text-xs text-slate-500",
          className ?? "",
        ].join(" ")}
        style={{ width: size, height: size }}
      >
        QR…
      </div>
    );
  }

  return <img className={className} src={dataUrl} width={size} height={size} alt="QR-код" />;
}

