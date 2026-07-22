const clockEl = document.getElementById("clock");
const alarmTimeInput = document.getElementById("alarmTime");
const alarmLabelInput = document.getElementById("alarmLabel");
const addBtn = document.getElementById("addBtn");
const alarmListEl = document.getElementById("alarmList");
const ringingOverlay = document.getElementById("ringingOverlay");
const ringingLabel = document.getElementById("ringingLabel");
const ringingTime = document.getElementById("ringingTime");
const stopBtn = document.getElementById("stopBtn");
const hourHand = document.getElementById("hourHand");
const minuteHand = document.getElementById("minuteHand");
const secondHand = document.getElementById("secondHand");

const STORAGE_KEY = "alarms";
let alarms = loadAlarms();
let ringingAlarmId = null;
let beepInterval = null;
let audioCtx = null;

function loadAlarms() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY)) || [];
  } catch {
    return [];
  }
}

function saveAlarms() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(alarms));
}

function pad(n) {
  return String(n).padStart(2, "0");
}

function updateClock() {
  const now = new Date();
  clockEl.textContent = `${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;
  updateHands(now);
  checkAlarms(now);
}

function updateHands(now) {
  const hours = now.getHours() % 12;
  const minutes = now.getMinutes();
  const seconds = now.getSeconds();

  const hourDeg = hours * 30 + minutes * 0.5;
  const minuteDeg = minutes * 6 + seconds * 0.1;
  const secondDeg = seconds * 6;

  hourHand.style.transform = `rotate(${hourDeg}deg)`;
  minuteHand.style.transform = `rotate(${minuteDeg}deg)`;
  secondHand.style.transform = `rotate(${secondDeg}deg)`;
}

function checkAlarms(now) {
  if (ringingAlarmId !== null) return;
  const hhmm = `${pad(now.getHours())}:${pad(now.getMinutes())}`;
  if (now.getSeconds() !== 0) return;

  for (const alarm of alarms) {
    if (alarm.enabled && alarm.time === hhmm && alarm.lastTriggered !== hhmm + "_" + now.toDateString()) {
      alarm.lastTriggered = hhmm + "_" + now.toDateString();
      saveAlarms();
      triggerAlarm(alarm);
      break;
    }
  }
}

function triggerAlarm(alarm) {
  ringingAlarmId = alarm.id;
  ringingLabel.textContent = alarm.label || "알람";
  ringingTime.textContent = alarm.time;
  ringingOverlay.classList.add("show");
  startBeep();
}

function startBeep() {
  audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  const playBeep = () => {
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = "sine";
    osc.frequency.value = 880;
    gain.gain.value = 0.2;
    osc.connect(gain).connect(audioCtx.destination);
    osc.start();
    osc.stop(audioCtx.currentTime + 0.35);
  };
  playBeep();
  beepInterval = setInterval(playBeep, 600);
}

function stopBeep() {
  if (beepInterval) {
    clearInterval(beepInterval);
    beepInterval = null;
  }
  if (audioCtx) {
    audioCtx.close();
    audioCtx = null;
  }
}

stopBtn.addEventListener("click", () => {
  stopBeep();
  ringingOverlay.classList.remove("show");
  ringingAlarmId = null;
});

addBtn.addEventListener("click", () => {
  const time = alarmTimeInput.value;
  if (!time) {
    alert("알람 시간을 선택해주세요.");
    return;
  }
  alarms.push({
    id: Date.now(),
    time,
    label: alarmLabelInput.value.trim(),
    enabled: true,
    lastTriggered: null,
  });
  alarms.sort((a, b) => a.time.localeCompare(b.time));
  saveAlarms();
  renderAlarms();
  alarmTimeInput.value = "";
  alarmLabelInput.value = "";
});

function toggleAlarm(id) {
  const alarm = alarms.find((a) => a.id === id);
  if (alarm) {
    alarm.enabled = !alarm.enabled;
    saveAlarms();
    renderAlarms();
  }
}

function deleteAlarm(id) {
  alarms = alarms.filter((a) => a.id !== id);
  saveAlarms();
  renderAlarms();
}

function renderAlarms() {
  alarmListEl.innerHTML = "";

  if (alarms.length === 0) {
    const empty = document.createElement("li");
    empty.className = "empty-msg";
    empty.textContent = "등록된 알람이 없습니다.";
    alarmListEl.appendChild(empty);
    return;
  }

  for (const alarm of alarms) {
    const li = document.createElement("li");
    li.className = "alarm-item" + (alarm.enabled ? "" : " disabled");

    const info = document.createElement("div");
    info.className = "alarm-info";
    const time = document.createElement("span");
    time.className = "time";
    time.textContent = alarm.time;
    const label = document.createElement("span");
    label.className = "label";
    label.textContent = alarm.label || "";
    info.appendChild(time);
    if (alarm.label) info.appendChild(label);

    const actions = document.createElement("div");
    actions.className = "alarm-actions";

    const toggleBtn = document.createElement("button");
    toggleBtn.className = "toggle-btn" + (alarm.enabled ? " on" : "");
    toggleBtn.addEventListener("click", () => toggleAlarm(alarm.id));

    const deleteBtn = document.createElement("button");
    deleteBtn.className = "delete-btn";
    deleteBtn.textContent = "✕";
    deleteBtn.addEventListener("click", () => deleteAlarm(alarm.id));

    actions.appendChild(toggleBtn);
    actions.appendChild(deleteBtn);

    li.appendChild(info);
    li.appendChild(actions);
    alarmListEl.appendChild(li);
  }
}

setInterval(updateClock, 1000);
updateClock();
renderAlarms();
