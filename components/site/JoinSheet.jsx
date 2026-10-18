"use client";

import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Sheet } from "../ui";
import JoinForm from "./JoinForm";
import { track } from "../../lib/site";

// Any button on the site can open the join sheet without scrolling the
// reader away from where they are: openJoin({ source, watch }).
export function openJoin(detail = {}) {
  window.dispatchEvent(new CustomEvent("huesy:open-join", { detail }));
}

export default function JoinSheet() {
  const [open, setOpen] = useState(false);
  const [detail, setDetail] = useState({});
  const params = useSearchParams();

  useEffect(() => {
    const onOpen = (e) => {
      setDetail(e.detail || {});
      setOpen(true);
      track("sheet_open", e.detail?.source || "sheet");
    };
    window.addEventListener("huesy:open-join", onOpen);
    return () => window.removeEventListener("huesy:open-join", onOpen);
  }, []);

  // /?join=1 (links from the app's waitlist screens and old Start free links)
  // opens it on arrival.
  useEffect(() => {
    if (params?.get("join") === "1") {
      setDetail({ source: "link" });
      setOpen(true);
    }
  }, [params]);

  const close = useCallback(() => setOpen(false), []);

  return (
    <Sheet open={open} onClose={close} title="Join the waitlist" width={480}>
      <p className="-mt-1 mb-5 text-[15px] leading-relaxed text-muted">
        Huesy finds the launches, collabs and campaigns worth posting about and drafts the post in your voice.
        We're opening it a few people at a time.
      </p>
      <JoinForm source={detail.source || "sheet"} watch={detail.watch} size="md" />
      <p className="mt-3 text-[12.5px] text-faint">Your email is only used to invite you.</p>
    </Sheet>
  );
}
