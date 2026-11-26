// 📄 Stránka: a whole classic page on a board, until it has native widgets of its own. The page runs
// in an iframe (?page=X&embed=1: no menu, no config bar), so every button on it works as on the page;
// it reports its height to the board, which sizes the iframe (flowers.html, "sfl-embed-height").
const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
// A board inside a board would nest without end.
const NOT_EMBEDDABLE = new Set(["board", "dashboard"]);

export const pageEmbed = {
  type: "page-embed",
  title: "📄 Stránka",
  // opts (the pin preset): { page, label }
  titleFor: (o) => `📄 ${o.label || o.page || "Stránka"}`,
  page: "board",
  needs: () => ({}),
  // ctx: { pages: [page ids], embedUrl(page) → URL of the page in embed mode }
  view(data, ctx = {}, opts = {}) {
    const page = opts.page;
    if (!page || NOT_EMBEDDABLE.has(page) || !(ctx.pages || []).includes(page) || typeof ctx.embedUrl !== "function") {
      return { empty: "Tuhle stránku sem vložit nejde — připni ji tlačítkem 📌 celá stránka na ní samotné." };
    }
    return { html: `<iframe class="w-embed" data-auto="1" src="${esc(ctx.embedUrl(page))}" title="${esc(opts.label || page)}" loading="lazy"></iframe>` };
  },
};
