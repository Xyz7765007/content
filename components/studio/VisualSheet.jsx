"use client";

import { useRef, useState } from "react";
import { Camera, MagicWand, TextAa, UploadSimple } from "@phosphor-icons/react";
import { Button, Sheet, cx } from "../ui";
import { AllowanceTag, GateNote } from "../plan/PlanBits";
import { AllowanceNote } from "./StudioBits";
import { uploadFile } from "../../lib/studio/upload";

/**
 * How a creative gets its picture: made by AI from the concept's scene, the
 * person's own photo, or words and colour only. The first choice counts the
 * creative, and the sheet says so before anything happens.
 */
export default function VisualSheet({ open, onClose, concept, account, counted, imagesOn, used = 0, max = 4, onChoose, busy, error }) {
  const [file, setFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState(null);
  const input = useRef(null);

  const send = async (source) => {
    if (source === "upload") {
      if (!file) {
        input.current?.click();
        return;
      }
      setUploading(true);
      setUploadError(null);
      const r = await uploadFile(file, "photo");
      setUploading(false);
      if (r.error) {
        setUploadError(r.error);
        return;
      }
      onChoose({ source, uploadPath: r.path });
      return;
    }
    onChoose({ source });
  };

  const options = [
    {
      id: "ai",
      icon: MagicWand,
      title: "Make the photo with AI",
      body: concept?.visual ? `"${concept.visual}"` : "A photo made from the idea's scene.",
      disabled: !imagesOn,
      off: "AI photos aren't switched on yet. Use your own photo, or words and colour.",
    },
    { id: "upload", icon: Camera, title: "Use my own photo", body: file ? `Ready: ${file.name}` : "A product shot or a photo of your own. JPG, PNG or WebP, up to 15 MB." },
    { id: "design", icon: TextAa, title: "Words and colour only", body: "No photo. The headline carries it, on your colours." },
  ];

  return (
    <Sheet open={open} onClose={onClose} title="How should it look?" width={500}>
      <div className="flex flex-col gap-4">
        {!counted ? <AllowanceNote kind="creative" account={account} /> : <p className="text-[12.5px] text-muted">{`${used} of ${max} pictures used on this creative.`}</p>}
        <input
          ref={input}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          className="sr-only"
          tabIndex={-1}
          aria-hidden="true"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) setFile(f);
          }}
        />
        {options.map((o) => {
          const Icon = o.icon;
          return (
            <div key={o.id} className={cx("rounded-[20px] border p-4", o.disabled ? "border-line bg-sunken" : "border-line bg-surface")}>
              <div className="flex items-start gap-3">
                <span className={cx("flex h-10 w-10 shrink-0 items-center justify-center rounded-full", o.disabled ? "bg-surface text-faint" : "bg-accent-soft text-accent-deep")}>
                  <Icon size={18} weight="bold" aria-hidden="true" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-[15px] font-medium">{o.title}</p>
                  <p className="mt-0.5 text-[13px] leading-snug text-muted">{o.disabled ? o.off : o.body}</p>
                </div>
              </div>
              {!o.disabled ? (
                <div className="mt-3 flex flex-wrap gap-2 pl-[52px]">
                  {o.id === "upload" ? (
                    <>
                      <Button size="sm" variant={file ? "quiet" : "primary"} onClick={() => input.current?.click()} disabled={busy || uploading}>
                        <UploadSimple size={14} />
                        {file ? "Choose another" : "Choose a photo"}
                      </Button>
                      {file ? (
                        <Button size="sm" onClick={() => send("upload")} loading={uploading || busy === "upload"} disabled={busy || uploading}>
                          Use this photo
                          {!counted ? <AllowanceTag kind="creative" /> : null}
                        </Button>
                      ) : null}
                    </>
                  ) : (
                    <Button size="sm" variant={o.id === "ai" ? "primary" : "quiet"} onClick={() => send(o.id)} loading={busy === o.id} disabled={Boolean(busy)}>
                      {o.id === "ai" ? "Make it" : "Use words and colour"}
                      {!counted ? <AllowanceTag kind="creative" /> : null}
                    </Button>
                  )}
                </div>
              ) : null}
            </div>
          );
        })}
        <GateNote error={uploadError || error} />
      </div>
    </Sheet>
  );
}
