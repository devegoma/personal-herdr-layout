import { View, div, svg, image, PathBuilder } from "gpui-kit";
import { h_flex } from "gpui-base";
import { spaces, agents, theme, run, window as appWindow, keys } from "herdr";
import { claudeUsage, codexUsage, resetText } from "./usage.js";

// Which agents to show: name, icon, how to read its usage.
const SOURCES = [
  { id: "claude", name: "Claude Code", icon: "icons/claude.svg", read: claudeUsage },
  { id: "codex", name: "Codex", icon: "icons/codex.svg", read: codexUsage },
];
const REFRESH_MS = 5 * 60 * 1000;

const pt = (pct, a) => [`${50 + 50 * Math.sin(a)}%`, `${50 - 50 * Math.cos(a)}%`];

// A small pie: the used share filled clockwise from 12 o'clock over a track.
function pie(used, fill, track, size = 13) {
  const layer = (path, color) => globalThis.window.paint_path(path, color).absolute().top(0).left(0).size_full();
  const disc = () => PathBuilder.fill().move_to("50%", "0%").arc_to("50%", "50%", 0, false, true, "50%", "100%").arc_to("50%", "50%", 0, false, true, "50%", "0%").close().build();
  const el = div().relative().flex_none().size(size).child(layer(disc(), track));
  if (used >= 99.5) return el.child(layer(disc(), fill));
  if (used <= 0.5) return el;
  const a = (used / 100) * Math.PI * 2;
  const [x, y] = pt(used, a);
  const wedge = PathBuilder.fill().move_to("50%", "50%").line_to("50%", "0%")
    .arc_to("50%", "50%", 0, used > 50, true, x, y).close().build();
  return el.child(layer(wedge, fill));
}

export default class WorkspaceStatus extends View {
  init(_props, cx) {
    this.usage = {};
    this.refresh(cx);
    cx.timer.every(REFRESH_MS, (cx) => this.refresh(cx));
  }

  refresh(cx) {
    cx.spawn(async (cx) => {
      for (const s of SOURCES) {
        try {
          this.usage[s.id] = await s.read();
        } catch (e) {
          this.usage[s.id] = { error: String(e?.message ?? e) };
        }
      }
      cx.notify();
    });
  }

  usageView(t) {
    const color = (u) => (u >= 90 ? t.blocked : u >= 70 ? t.ansi3 : t.accent);
    return h_flex().gap(14).items_center().children(SOURCES.map((s) => {
      const u = this.usage[s.id];
      const tip = !u ? `${s.name}: 読み込み中` : u.error ? `${s.name}: ${u.error}` :
        `${s.name}\n` + u.windows.map((w) => `${w.label}: ${Math.round(w.used)}% 使用  ${resetText(w.resetsAt)}`).join("\n");
      const row = h_flex().id(`usage-${s.id}`).gap(5).items_center().tooltip(tip)
        .on_click((_e, cx) => this.refresh(cx))
        .child(image(s.icon).size(13).flex_none());
      if (!u || u.error || u.windows.length === 0) return row.child(div().text_color(t.dim).child("—"));
      return row.children(u.windows.map((w) =>
        h_flex().gap(3).items_center()
          .child(pie(w.used, color(w.used), t.border))
          .child(div().text_color(w.used >= 70 ? color(w.used) : t.muted).child(`${Math.round(w.used)}%`))));
    }));
  }

  // The palette key as actually bound, not a hardcoded one; without a
  // binding the hint stays useful ("commands") instead of lying.
  hint(t) {
    const mac = appWindow()?.platform === "macos";
    const mod = { cmd: mac ? "⌘" : "Ctrl+", ctrl: mac ? "⌃" : "Ctrl+", shift: mac ? "⇧" : "Shift+", alt: mac ? "⌥" : "Alt+", option: mac ? "⌥" : "Alt+" };
    const b = keys().find((k) => k.section === "global" && k.action === "app.palette");
    const parts = b && b.keys.endsWith("--") ? [...b.keys.slice(0, -2).split("-"), "-"] : b?.keys.split("-");
    const key = parts && parts.map((p) => mod[p.toLowerCase()] ?? p.toUpperCase()).join("");
    return key ? `${key}  commands` : "commands";
  }

  render() {
    const t = theme();
    const space = spaces().find(s => s.active);
    const list = agents();
    const needs = list.filter(a => a.status === "blocked").length;
    const label = (icon, text) => h_flex().gap(6).items_center().child(svg(`mods/workspace-chrome/${icon}.svg`).size(13)).child(text);
    return h_flex().size_full().px(14).gap(16).items_center().bg(t.chrome).border_t(1).border_color(t.border).text_size(11.8).text_color(t.muted)
      .child(label(space?.machine ? "server" : "monitor", space?.machine ?? "This computer"))
      .when(Boolean(space?.branch), el => el.child(label("branch", space.branch)))
      .child(h_flex().gap(6).items_center().child(div().size(6).rounded(3).bg(t.dim)).child(`${list.length} agents`)
        .when(needs > 0, el => el.child(div().text_color(t.blocked).child(`· ${needs} needs you`))))
      .child(this.usageView(t))
      .child(div().flex_1())
      .child(div().id("palette").text_color(t.dim).on_click(() => run("app.palette")).child(this.hint(t)));
  }
}
