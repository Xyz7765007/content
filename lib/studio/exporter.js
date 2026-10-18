"use client";

// Turns the designs on screen into files: a PNG per creative or slide, every
// slide as a zip, or the whole carousel as one PDF (what LinkedIn takes).
// Everything renders in the browser at full size, so nothing is uploaded.

const loadLib = () => import("html-to-image");

async function render(node, { width, height, type = "png" }) {
  const lib = await loadLib();
  const opts = {
    width,
    height,
    pixelRatio: 1,
    cacheBust: true,
    // The preview is scaled down to fit the screen; the file is not.
    style: { transform: "none", transformOrigin: "top left", left: "0", top: "0" },
  };
  // Safari sometimes paints images only on the second pass.
  const fn = type === "jpeg" ? lib.toJpeg : lib.toPng;
  if (node.querySelector("img")) await fn(node, { ...opts, quality: 0.92 }).catch(() => null);
  return fn(node, { ...opts, quality: 0.92 });
}

const dataUrlToBytes = (url) => {
  const bin = atob(url.split(",")[1]);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
};

export function download(blobOrUrl, name) {
  const a = document.createElement("a");
  const url = typeof blobOrUrl === "string" ? blobOrUrl : URL.createObjectURL(blobOrUrl);
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  if (typeof blobOrUrl !== "string") setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export const fileSafe = (s) => String(s || "huesy").toLowerCase().replace(/[^\w]+/g, "-").replace(/^-|-$/g, "").slice(0, 48) || "huesy";

export async function exportPng(node, size, name) {
  const url = await render(node, size);
  download(url, `${fileSafe(name)}.png`);
  return url;
}

export async function exportZip(nodes, size, name) {
  const { zipSync } = await import("fflate");
  const files = {};
  for (let i = 0; i < nodes.length; i++) {
    const url = await render(nodes[i], size);
    files[`${fileSafe(name)}-${String(i + 1).padStart(2, "0")}.png`] = [dataUrlToBytes(url), { level: 0 }];
  }
  const zipped = zipSync(files);
  download(new Blob([zipped], { type: "application/zip" }), `${fileSafe(name)}.zip`);
}

export async function exportPdf(nodes, size, name) {
  const { jsPDF } = await import("jspdf");
  const pdf = new jsPDF({ orientation: size.height >= size.width ? "portrait" : "landscape", unit: "px", format: [size.width, size.height], hotfixes: ["px_scaling"], compress: true });
  for (let i = 0; i < nodes.length; i++) {
    const url = await render(nodes[i], { ...size, type: "jpeg" });
    if (i > 0) pdf.addPage([size.width, size.height], size.height >= size.width ? "portrait" : "landscape");
    pdf.addImage(url, "JPEG", 0, 0, size.width, size.height);
  }
  pdf.save(`${fileSafe(name)}.pdf`);
}

export async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}
