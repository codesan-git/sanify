// pages/advanced-page.ts — showcase: For keyed list, persisted store, WebSocket

import { component, html, signal, For, Index, persisted, createWS } from "@sanify/core";

component("advanced-page", () => {
  // ── For (keyed list reconciliation) ──
  const [tasks, setTasks] = signal([
    { id: 1, text: "Belajar Sanify", done: false },
    { id: 2, text: "Baca dokumentasi", done: true },
    { id: 3, text: "Bangun aplikasi", done: false },
  ]);
  let nextTaskId = 4;

  const addTask = () => {
    setTasks((prev) => [...prev, { id: nextTaskId++, text: `Tugas ${nextTaskId - 1}`, done: false }]);
  };
  const toggleTask = (id: number) => {
    setTasks((prev) => prev.map((t) => (t.id === id ? { ...t, done: !t.done } : t)));
  };
  const removeTask = (id: number) => {
    setTasks((prev) => prev.filter((t) => t.id !== id));
  };

  // ── Index (position-based list, element reuse) ──
  const [colors, setColors] = signal(["Merah", "Hijau", "Biru"]);

  const shiftColor = () => {
    setColors((prev) => {
      const [first, ...rest] = prev;
      return first ? [...rest, first] : prev;
    });
  };

  // ── persisted (localStorage + cross-tab sync) ──
  const [persistedCount, setPersistedCount] = persisted("demo-count", 0);

  // ── WebSocket reaktif ──
  const [wsConnected, setWsConnected] = signal(false);
  const [wsMessages, setWsMessages] = signal<string[]>([]);
  let ws: ReturnType<typeof createWS> | null = null;

  const connectWS = () => {
    if (ws) return;
    try {
      ws = createWS<string>("wss://echo.websocket.org", {
        reconnectDelay: 2000,
        maxRetries: 3,
      });
      // Status reaktif
      setWsConnected(true);
      // Kirim pesan uji
      ws.send("Halo dari Sanify!");
      // Terima pesan
      const checkMsg = setInterval(() => {
        const d = ws!.data();
        if (d) {
          setWsMessages((prev) => [...prev, String(d)]);
        }
        if (ws!.status() === "closed") {
          setWsConnected(false);
          clearInterval(checkMsg);
        }
      }, 500);
    } catch {
      setWsMessages((prev) => [...prev, "WebSocket tidak tersedia di environment ini"]);
    }
  };

  const disconnectWS = () => {
    ws?.close();
    ws = null;
    setWsConnected(false);
  };

  return () => html`
    <div class="page stack">
      <!-- For — keyed list -->
      <div class="card stack">
        <h2>For — keyed list reconciliation</h2>
        <p class="muted">
          <code>For()</code> dengan key: item dengan key sama di-reuse (DOM dipertahankan, nilai di-update).
          Non-keyed list (<code>\${items.map(...)}</code>) di-render ulang penuh.
        </p>
        <button class="btn btn--primary" @click=${addTask}>Tambah Tugas</button>
        <div class="stack">
          ${For(
            () => tasks(),
            (task) => html`
              <div class="list-item cluster">
                <span style=${() => `text-decoration: ${task().done ? "line-through" : "none"}; opacity: ${task().done ? ".5" : "1"}`}>
                  ${() => task().text}
                </span>
                <button class="btn btn--ghost" @click=${() => toggleTask(task().id)}>
                  ${() => task().done ? "↩" : "✓"}
                </button>
                <button class="btn btn--ghost" @click=${() => removeTask(task().id)}>✕</button>
              </div>
            `,
            { key: (t) => t.id },
          )}
        </div>
      </div>

      <!-- Index — position-based -->
      <div class="card stack">
        <h2>Index — position-based reuse</h2>
        <p class="muted">
          <code>Index()</code>: elemen DOM dipertahankan per <strong>posisi</strong>, bukan key. Cocok untuk list data primitif yang sering berubah urutan.
        </p>
        <div class="cluster">
          ${Index(
            () => colors(),
            (color) => html`<span class="btn">${() => color()}</span>`,
          )}
        </div>
        <button class="btn btn--ghost" @click=${shiftColor}>Geser Kiri ↻</button>
      </div>

      <!-- persisted -->
      <div class="card stack">
        <h2>persisted() — localStorage + cross-tab sync</h2>
        <p class="muted">
          Signal yang otomatis tersimpan ke <code>localStorage</code>. Survive page refresh. Sinkron antar tab.
        </p>
        <div class="cluster">
          <button class="btn btn--ghost" @click=${() => setPersistedCount((v: number) => v - 1)}>−</button>
          <strong>${() => persistedCount()}</strong>
          <button class="btn btn--primary" @click=${() => setPersistedCount((v: number) => v + 1)}>+</button>
          <button class="btn btn--ghost" @click=${() => setPersistedCount(0)}>Reset</button>
        </div>
        <p class="muted" style="font-size: .75rem;">
          Coba refresh halaman — nilai tetap tersimpan. Buka dua tab — keduanya sinkron.
        </p>
      </div>

      <!-- WebSocket -->
      <div class="card stack">
        <h2>createWS() — WebSocket reaktif</h2>
        <p class="muted">
          WebSocket dengan auto-reconnect, status sebagai signal, dan data auto JSON parse.
        </p>
        <div class="cluster">
          <button class="btn btn--primary" @click=${connectWS}>Hubungkan</button>
          <button class="btn btn--ghost" @click=${disconnectWS}>Putuskan</button>
          <span class="muted" style="font-size: .75rem;">
            Status: ${() => wsConnected() ? "✅ Terhubung" : "⏺️ Terputus"}
          </span>
        </div>
        ${() => wsMessages().length > 0 ? html`
          <div class="stack" style="font-size: .8125rem; max-height: 8rem; overflow-y: auto;">
            ${wsMessages().map((m) => html`<p class="muted">↳ ${m}</p>`)}
          </div>
        ` : null}
      </div>
    </div>
  `;
});

if (import.meta.hot) import.meta.hot.accept();
