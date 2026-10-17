/**
 * Regole del controllo dell'impaginazione (usate da scripts/layout-audit.mjs
 * e dal test e2e "impaginazione"). `auditPage` gira DENTRO la pagina
 * (page.evaluate): niente import, niente variabili esterne.
 */
export /** Gira dentro la pagina: elenco dei problemi visibili. */
function auditPage() {
  const vw = document.documentElement.clientWidth;
  const issues = [];
  const describe = (el) => {
    const t = (el.getAttribute("aria-label") || el.textContent || el.getAttribute("placeholder") || el.value || el.tagName).trim().replace(/\s+/g, " ");
    return t.slice(0, 70);
  };
  const path = (el) => {
    const parts = [];
    for (let e = el; e && e !== document.body && parts.length < 4; e = e.parentElement) {
      const attrs = [...e.attributes].filter((a) => a.name.startsWith("data-") && a.name !== "data-nav").map((a) => `[${a.name}]`).join("");
      parts.unshift(e.tagName.toLowerCase() + attrs);
    }
    return parts.join(" > ");
  };
  for (const el of document.querySelectorAll("body *")) {
    const cs = getComputedStyle(el);
    if (cs.display === "none" || cs.visibility === "hidden" || cs.opacity === "0") continue;
    if (cs.position === "absolute" && cs.clip && cs.clip !== "auto") continue; // sr-only
    const r = el.getBoundingClientRect();
    if (r.width < 2 || r.height < 2) continue;
    const ownText = [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim());
    const control = ["INPUT", "TEXTAREA", "SELECT", "BUTTON", "IMG", "VIDEO"].includes(el.tagName);
    if (!ownText && !control) continue;
    // dentro a qualcosa di nascosto o fuori schermo apposta (menu che sparisce mentre scrivi, finestre chiuse)
    if (el.closest("[inert], [aria-hidden='true'], [data-bottom-nav]")) continue;
    // contenuto di un riquadro chiuso: non si vede
    let closed = false;
    for (let d = el.closest("details"); d; d = d.parentElement?.closest("details")) {
      if (!d.open && !el.closest("summary")?.parentElement?.isSameNode(d)) closed = true;
    }
    if (closed) continue;
    let scroller = null;
    let clipper = null;
    for (let a = el.parentElement; a && a !== document.documentElement; a = a.parentElement) {
      const acs = getComputedStyle(a);
      // scorre davvero in verticale (con overflow-x auto il browser mette auto anche in verticale)
      const scrollsY = (acs.overflowY === "auto" || acs.overflowY === "scroll") && a.scrollHeight > a.clientHeight + 1;
      // zona che scorre di lato apposta (settimane, tabelle); una zona che scorre in verticale
      // (chat, finestre) taglia quello che sfora di lato: lì va segnalato
      if ((acs.overflowX === "auto" || acs.overflowX === "scroll") && !scrollsY) {
        scroller = a;
        break;
      }
      if (!clipper && scrollsY) clipper = a;
      if (!clipper && a !== document.body && (acs.overflowX === "hidden" || acs.overflowX === "clip")) clipper = a;
    }
    if (scroller) continue;
    const cr = clipper ? clipper.getBoundingClientRect() : { left: 0, right: vw };
    const right = Math.min(vw, cr.right);
    const left = Math.max(0, cr.left);
    if (r.right > right + 1.5 || r.left < left - 1.5) {
      issues.push({ type: "fuori", what: describe(el), where: path(el), px: Math.round(Math.max(r.right - right, left - r.left)) });
      continue;
    }
    // caselle che non mostrano tutto quello che c'è scritto
    const textInput = el.tagName === "TEXTAREA" || (el.tagName === "INPUT" && ["text", "search", "email", "tel", ""].includes(el.getAttribute("type") || ""));
    if (textInput && el.value && !el.closest("[data-clamp-ok]")) {
      // una casella grande (oltre metà schermo) può scorrere dentro: è voluto
      const big = el.clientHeight > window.innerHeight * 0.45;
      if (el.scrollWidth > el.clientWidth + 2 || (el.tagName === "TEXTAREA" && !big && el.scrollHeight > el.clientHeight + 4)) {
        issues.push({ type: "casella", what: el.getAttribute("aria-label") || el.value.slice(0, 50), where: path(el), px: Math.max(el.scrollWidth - el.clientWidth, el.scrollHeight - el.clientHeight) });
        continue;
      }
    }
    // testo tagliato con i puntini (o dopo N righe): si legge solo a metà
    const clamped = (cs.textOverflow === "ellipsis" && el.scrollWidth > el.clientWidth + 1) || (cs.webkitLineClamp && cs.webkitLineClamp !== "none" && el.scrollHeight > el.clientHeight + 2);
    if (ownText && clamped && !el.closest("[data-clamp-ok]")) {
      issues.push({ type: "tagliato", what: describe(el), where: path(el), px: Math.max(el.scrollWidth - el.clientWidth, el.scrollHeight - el.clientHeight) });
      continue;
    }
    if (ownText && !(el instanceof SVGElement) && cs.overflowX === "visible" && el.scrollWidth > el.clientWidth + 2 && el.clientWidth > 0 && cs.display !== "inline") {
      issues.push({ type: "testo-esce", what: describe(el), where: path(el), px: el.scrollWidth - el.clientWidth });
      continue;
    }
    if (ownText && !textInput) {
      const text = el.textContent.trim();
      const words = text.split(/\s+/).filter((w) => w.length > 1).length;
      const lh = parseFloat(cs.lineHeight) || parseFloat(cs.fontSize) * 1.35;
      const lines = Math.round(r.height / lh);
      if (words >= 3 && lines >= 3 && lines >= words * 0.75 && r.width < 140) {
        issues.push({ type: "colonna", what: describe(el), where: path(el), px: Math.round(r.width) });
      }
    }
  }
  return issues;
}
