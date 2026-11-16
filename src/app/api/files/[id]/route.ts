import { store } from "@/lib/store";

const SERVABLE = new Set(["image/jpeg", "image/png", "image/webp", "application/pdf"]);

/** Serves uploaded receipts. They are public proof, linked from the campaign page. */
export async function GET(_req: Request, ctx: RouteContext<"/api/files/[id]">) {
  const { id } = await ctx.params;
  const f = await store.getReceiptFile(id);
  if (!f) return new Response("Not found", { status: 404 });
  // Uploads are checked by content already; this is the second line of
  // defence, so nothing in a receipt can ever run on our domain.
  const type = SERVABLE.has(f.type) ? f.type : "application/octet-stream";
  const image = type.startsWith("image/");
  return new Response(new Uint8Array(f.data), {
    headers: {
      "Content-Type": type,
      "Content-Disposition": type === "application/octet-stream" ? "attachment" : "inline",
      // No `sandbox` for PDFs: it stops Chrome's built-in viewer opening them.
      "Content-Security-Policy": image
        ? "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; sandbox"
        : "default-src 'none'; frame-ancestors 'none'",
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": "public, max-age=86400, immutable",
    },
  });
}
