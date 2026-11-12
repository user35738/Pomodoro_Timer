const DURATIONS = { focus: 25, short: 5, long: 15 }; // minutes — change freely
const LONG_BREAK_EVERY = 4;
const LABELS = { focus: "Time to focus", short: "Take a short break", long: "Take a long break" };
const CIRC = 2 * Math.PI * 120;

const $ = (id) => document.getElementById(id);
const root = document.documentElement;
const arc = $("arc"), timeEl = $("time"), startBtn = $("startBtn");

let mode = "focus", remaining = DURATIONS.focus * 60, total = remaining;
let timerId = null, endAt = 0, completed = 0;

/* ---------- Theme ---------- */
const savedTheme = safeGet("pomo-theme");
root.dataset.theme = savedTheme || (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
$("themeBtn").addEventListener("click", () => {
	root.dataset.theme = root.dataset.theme === "dark" ? "light" : "dark";
	safeSet("pomo-theme", root.dataset.theme);
});

/* ---------- Timer ---------- */
function render() {
	const m = String(Math.floor(remaining / 60)).padStart(2, "0");
	const s = String(remaining % 60).padStart(2, "0");
	timeEl.textContent = `${m}:${s}`;
	arc.style.strokeDashoffset = CIRC * (1 - remaining / total);
	document.title = `${m}:${s} · ${LABELS[mode]}`;
	startBtn.textContent = timerId ? "Pause" : (remaining < total ? "Resume" : "Start");
}

function setMode(next, autoStart = false) {
	pause();
	mode = next;
	total = remaining = DURATIONS[mode] * 60;
	root.dataset.mode = mode;
	$("label").textContent = LABELS[mode];
	document.querySelectorAll(".tab").forEach((t) => {
		const on = t.dataset.mode === mode;
		t.classList.toggle("active", on);
		t.setAttribute("aria-selected", on);
	});
	render();
	if (autoStart) start();
}

function start() {
	if (timerId) return;
	endAt = Date.now() + remaining * 1000; // survives background-tab throttling
	timerId = setInterval(tick, 250);
	render();
}
function pause() { clearInterval(timerId); timerId = null; render(); }

function tick() {
	remaining = Math.max(0, Math.round((endAt - Date.now()) / 1000));
	render();
	if (remaining === 0) finish();
}

function finish() {
	pause();
	beep();
	if (mode === "focus") {
		completed++;
		$("done").textContent = completed;
		drawDots();
		bumpActiveTask();
		setMode(completed % LONG_BREAK_EVERY === 0 ? "long" : "short");
	} else {
		setMode("focus");
	}
	if ("Notification" in window && Notification.permission === "granted") {
		new Notification("Pomodoro", { body: LABELS[mode] });
	}
}

function drawDots() {
	const filled = completed % LONG_BREAK_EVERY || (completed ? LONG_BREAK_EVERY : 0);
	$("dots").innerHTML = Array.from({ length: LONG_BREAK_EVERY }, (_, i) =>
		`<span class="dot ${i < filled ? "on" : ""}"></span>`).join("");
}

startBtn.addEventListener("click", () => {
	if ("Notification" in window && Notification.permission === "default") Notification.requestPermission();
	timerId ? pause() : start();
});
$("resetBtn").addEventListener("click", () => setMode(mode));
$("skipBtn").addEventListener("click", () =>
	setMode(mode === "focus" ? ((completed + 1) % LONG_BREAK_EVERY === 0 ? "long" : "short") : "focus"));
document.querySelectorAll(".tab").forEach((t) => t.addEventListener("click", () => setMode(t.dataset.mode)));
document.addEventListener("keydown", (e) => {
	if (e.code === "Space" && !/INPUT|BUTTON/.test(e.target.tagName)) { e.preventDefault(); startBtn.click(); }
});

/* ---------- Sound (Web Audio, no files needed) ---------- */
function beep() {
	if (!$("soundToggle").checked) return;
	try {
		const ctx = new (window.AudioContext || window.webkitAudioContext)();
		[660, 880, 1100].forEach((f, i) => {
			const o = ctx.createOscillator(), g = ctx.createGain();
			o.type = "sine"; o.frequency.value = f;
			const t = ctx.currentTime + i * 0.22;
			g.gain.setValueAtTime(0.0001, t);
			g.gain.exponentialRampToValueAtTime(0.25, t + 0.03);
			g.gain.exponentialRampToValueAtTime(0.0001, t + 0.2);
			o.connect(g).connect(ctx.destination);
			o.start(t); o.stop(t + 0.22);
		});
	} catch (_) {}
}

/* ---------- Tasks ---------- */
let tasks = JSON.parse(safeGet("pomo-tasks") || "[]"); // {id, text, done, pomos}
let activeId = null;

function saveTasks() { safeSet("pomo-tasks", JSON.stringify(tasks)); }
function bumpActiveTask() {
	const t = tasks.find((x) => x.id === activeId);
	if (t) { t.pomos = (t.pomos || 0) + 1; saveTasks(); renderTasks(); }
}
function renderTasks() {
	const list = $("taskList");
	list.innerHTML = "";
	$("empty").hidden = tasks.length > 0;
	tasks.forEach((t) => {
		const li = document.createElement("li");
		li.className = "task" + (t.done ? " done" : "") + (t.id === activeId ? " active" : "");
		const cb = document.createElement("input");
		cb.type = "checkbox"; cb.checked = t.done; cb.setAttribute("aria-label", "Mark done");
		cb.onchange = () => { t.done = cb.checked; saveTasks(); renderTasks(); };
		const label = document.createElement("span");
		label.textContent = t.text + (t.pomos ? `  ×${t.pomos}` : "");
		label.style.cursor = "pointer";
		label.title = "Click to set as current task";
		label.onclick = () => { activeId = activeId === t.id ? null : t.id; renderTasks(); };
		const del = document.createElement("button");
		del.className = "del"; del.textContent = "×"; del.setAttribute("aria-label", "Delete task");
		del.onclick = () => { tasks = tasks.filter((x) => x.id !== t.id); saveTasks(); renderTasks(); };
		li.append(cb, label, del);
		list.append(li);
	});
}
$("taskForm").addEventListener("submit", (e) => {
	e.preventDefault();
	const text = $("taskInput").value.trim();
	if (!text) return;
	tasks.unshift({ id: Date.now(), text, done: false, pomos: 0 });
	$("taskInput").value = "";
	saveTasks(); renderTasks();
});

/* ---------- Helpers ---------- */
function safeGet(k) { try { return localStorage.getItem(k); } catch (_) { return null; } }
function safeSet(k, v) { try { localStorage.setItem(k, v); } catch (_) {} }

drawDots(); renderTasks(); render();
