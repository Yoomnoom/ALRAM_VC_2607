const clockEl = document.getElementById("clock");
const timeDisplayBtn = document.getElementById("timeDisplayBtn");
const alarmLabelInput = document.getElementById("alarmLabel");
const addBtn = document.getElementById("addBtn");
const alarmListEl = document.getElementById("alarmList");
const ringingOverlay = document.getElementById("ringingOverlay");
const ringingLabel = document.getElementById("ringingLabel");
const ringingTime = document.getElementById("ringingTime");
const stopBtn = document.getElementById("stopBtn");
const snoozeBtn = document.getElementById("snoozeBtn");
const hourHand = document.getElementById("hourHand");
const minuteHand = document.getElementById("minuteHand");
const secondHand = document.getElementById("secondHand");
const weatherEl = document.getElementById("weather");
const weatherBg = document.getElementById("weatherBg");
const weatherPreviewSelect = document.getElementById("weatherPreviewSelect");
const dayPicker = document.getElementById("dayPicker");
const dayButtons = dayPicker.querySelectorAll(".day-btn");
const alarmSoundSelect = document.getElementById("alarmSound");
const snoozePicker = document.getElementById("snoozePicker");
const snoozeMinButtons = snoozePicker.querySelectorAll(".snooze-min-btn");
const openAddBtn = document.getElementById("openAddBtn");
const addAlarmOverlay = document.getElementById("addAlarmOverlay");
const cancelAddBtn = document.getElementById("cancelAddBtn");
const repeatTypeSelect = document.getElementById("repeatType");
const customDaysGroup = document.getElementById("customDaysGroup");
const intervalGroup = document.getElementById("intervalGroup");
const intervalStartDate = document.getElementById("intervalStartDate");
const intervalDaysInput = document.getElementById("intervalDays");

const timePickerOverlay = document.getElementById("timePickerOverlay");
const hourInput = document.getElementById("hourInput");
const minuteInput = document.getElementById("minuteInput");
const ampmToggle = document.getElementById("ampmToggle");
const ampmButtons = ampmToggle.querySelectorAll(".ampm-btn");
const modeToggle = document.getElementById("modeToggle");
const modeButtons = modeToggle.querySelectorAll(".mode-btn");
const analogClock = document.getElementById("analogClock");
const pickHourHand = document.getElementById("pickHourHand");
const pickMinuteHand = document.getElementById("pickMinuteHand");
const timePickerCancel = document.getElementById("timePickerCancel");
const timePickerConfirm = document.getElementById("timePickerConfirm");

const STORAGE_KEY = "alarms";
const DAY_NAMES = ["일", "월", "화", "수", "목", "금", "토"];
const SOUND_NAMES = { beep: "삐삐", chime: "차임벨", digital: "디지털음" };
let alarms = loadAlarms();
let ringingAlarmId = null;
let ringingAlarm = null;
let beepInterval = null;
let audioCtx = null;
let selectedDays = [];
let snoozeTimeoutId = null;
let vibrateIntervalId = null;
let selectedSnoozeMinutes = 5;

let selectedTime = null;
let pickHour = 7;
let pickMinute = 0;
let pickAmPm = "PM";
let activeMode = "hour";
let draggingClock = false;

function formatTimeDisplay(hhmm) {
  const [h, m] = hhmm.split(":").map(Number);
  const ampmText = h < 12 ? "오전" : "오후";
  let h12 = h % 12;
  if (h12 === 0) h12 = 12;
  return `${ampmText} ${pad(h12)}:${pad(m)}`;
}

function updatePickerUI() {
  hourInput.value = pickHour;
  minuteInput.value = pad(pickMinute);
  ampmButtons.forEach((btn) => btn.classList.toggle("selected", btn.dataset.ampm === pickAmPm));
  modeButtons.forEach((btn) => btn.classList.toggle("selected", btn.dataset.mode === activeMode));
  const hourDeg = (pickHour % 12) * 30 + pickMinute * 0.5;
  const minuteDeg = pickMinute * 6;
  pickHourHand.style.transform = `rotate(${hourDeg}deg)`;
  pickMinuteHand.style.transform = `rotate(${minuteDeg}deg)`;
  pickHourHand.style.opacity = activeMode === "hour" ? "1" : "0.35";
  pickMinuteHand.style.opacity = activeMode === "minute" ? "1" : "0.35";
}

function openTimePicker() {
  if (selectedTime) {
    const [h, m] = selectedTime.split(":").map(Number);
    pickAmPm = h < 12 ? "AM" : "PM";
    pickHour = h % 12 === 0 ? 12 : h % 12;
    pickMinute = m;
  } else {
    const now = new Date();
    pickAmPm = now.getHours() < 12 ? "AM" : "PM";
    pickHour = now.getHours() % 12 === 0 ? 12 : now.getHours() % 12;
    pickMinute = now.getMinutes();
  }
  activeMode = "hour";
  updatePickerUI();
  timePickerOverlay.classList.add("show");
}

function closeTimePicker() {
  timePickerOverlay.classList.remove("show");
}

timeDisplayBtn.addEventListener("click", openTimePicker);
timePickerCancel.addEventListener("click", closeTimePicker);

timePickerConfirm.addEventListener("click", () => {
  let hour24 = pickHour % 12;
  if (pickAmPm === "PM") hour24 += 12;
  selectedTime = `${pad(hour24)}:${pad(pickMinute)}`;
  timeDisplayBtn.textContent = formatTimeDisplay(selectedTime);
  closeTimePicker();
});

hourInput.addEventListener("focus", () => {
  activeMode = "hour";
  updatePickerUI();
});

hourInput.addEventListener("input", () => {
  let v = parseInt(hourInput.value, 10);
  if (Number.isNaN(v)) return;
  v = Math.min(12, Math.max(1, v));
  pickHour = v;
  updatePickerUI();
});

minuteInput.addEventListener("focus", () => {
  activeMode = "minute";
  updatePickerUI();
});

minuteInput.addEventListener("input", () => {
  let v = parseInt(minuteInput.value, 10);
  if (Number.isNaN(v)) return;
  v = Math.min(59, Math.max(0, v));
  pickMinute = v;
  updatePickerUI();
});

ampmButtons.forEach((btn) => {
  btn.addEventListener("click", () => {
    pickAmPm = btn.dataset.ampm;
    updatePickerUI();
  });
});

modeButtons.forEach((btn) => {
  btn.addEventListener("click", () => {
    activeMode = btn.dataset.mode;
    updatePickerUI();
  });
});

function handleClockPointer(e) {
  const rect = analogClock.getBoundingClientRect();
  const cx = rect.left + rect.width / 2;
  const cy = rect.top + rect.height / 2;
  const dx = e.clientX - cx;
  const dy = e.clientY - cy;
  const angle = ((Math.atan2(dy, dx) * 180) / Math.PI + 90 + 360) % 360;

  if (activeMode === "minute") {
    pickMinute = Math.round(angle / 6) % 60;
  } else {
    let h = Math.round(angle / 30) % 12;
    if (h === 0) h = 12;
    pickHour = h;
  }
  updatePickerUI();
}

analogClock.addEventListener("pointerdown", (e) => {
  draggingClock = true;
  analogClock.setPointerCapture(e.pointerId);
  handleClockPointer(e);
});

analogClock.addEventListener("pointermove", (e) => {
  if (!draggingClock) return;
  handleClockPointer(e);
});

analogClock.addEventListener("pointerup", () => {
  draggingClock = false;
  if (activeMode === "hour") {
    activeMode = "minute";
    updatePickerUI();
  }
});

analogClock.addEventListener("pointercancel", () => {
  draggingClock = false;
});

snoozeMinButtons.forEach((btn) => {
  if (Number(btn.dataset.min) === selectedSnoozeMinutes) btn.classList.add("selected");
  btn.addEventListener("click", () => {
    selectedSnoozeMinutes = Number(btn.dataset.min);
    snoozeMinButtons.forEach((b) => b.classList.remove("selected"));
    btn.classList.add("selected");
  });
});

dayButtons.forEach((btn) => {
  btn.addEventListener("click", () => {
    const day = Number(btn.dataset.day);
    if (selectedDays.includes(day)) {
      selectedDays = selectedDays.filter((d) => d !== day);
      btn.classList.remove("selected");
    } else {
      selectedDays.push(day);
      btn.classList.add("selected");
    }
  });
});

function formatDays(days) {
  if (!days || days.length === 0) return "요일 미선택";
  return [...days]
    .sort((a, b) => a - b)
    .map((d) => DAY_NAMES[d])
    .join("");
}

function todayISO() {
  const now = new Date();
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

function getRepeat(alarm) {
  if (alarm.repeat) return alarm.repeat;
  if (alarm.days && alarm.days.length > 0) return { type: "custom", days: alarm.days };
  return { type: "daily" };
}

function matchesRepeat(alarm, now) {
  const repeat = getRepeat(alarm);
  switch (repeat.type) {
    case "once":
    case "daily":
      return true;
    case "weekdays": {
      const day = now.getDay();
      return day >= 1 && day <= 5;
    }
    case "custom":
      return (repeat.days || []).includes(now.getDay());
    case "interval": {
      if (!repeat.startDate) return false;
      const [sy, sm, sd] = repeat.startDate.split("-").map(Number);
      const startMidnight = new Date(sy, sm - 1, sd);
      const todayMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const diffDays = Math.round((todayMidnight - startMidnight) / 86400000);
      const cycle = repeat.intervalDays || 1;
      return diffDays >= 0 && diffDays % cycle === 0;
    }
    default:
      return true;
  }
}

function formatRepeat(alarm) {
  const repeat = getRepeat(alarm);
  switch (repeat.type) {
    case "once":
      return "한 번만";
    case "daily":
      return "매일";
    case "weekdays":
      return "월-금";
    case "custom":
      return formatDays(repeat.days);
    case "interval":
      return `${repeat.intervalDays || 1}일마다`;
    default:
      return "매일";
  }
}

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
    if (
      alarm.enabled &&
      matchesRepeat(alarm, now) &&
      alarm.time === hhmm &&
      alarm.lastTriggered !== hhmm + "_" + now.toDateString()
    ) {
      alarm.lastTriggered = hhmm + "_" + now.toDateString();
      if (getRepeat(alarm).type === "once") {
        alarm.enabled = false;
      }
      saveAlarms();
      renderAlarms();
      triggerAlarm(alarm);
      break;
    }
  }
}

function triggerAlarm(alarm) {
  ringingAlarmId = alarm.id;
  ringingAlarm = alarm;
  ringingLabel.textContent = alarm.label || "알람";
  ringingTime.textContent = alarm.time;
  ringingOverlay.classList.add("show");
  startBeep(alarm);
  startVibrate();
}

function startBeep(alarm) {
  const sound = alarm.sound || "beep";
  audioCtx = new (window.AudioContext || window.webkitAudioContext)();

  const playTone = (type, freq, duration, gainValue) => {
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    gain.gain.value = gainValue;
    osc.connect(gain).connect(audioCtx.destination);
    osc.start();
    osc.stop(audioCtx.currentTime + duration);
  };

  let playBeep;
  let intervalMs;

  if (sound === "chime") {
    let toggle = false;
    playBeep = () => {
      playTone("triangle", toggle ? 1320 : 880, 0.3, 0.25);
      toggle = !toggle;
    };
    intervalMs = 350;
  } else if (sound === "digital") {
    playBeep = () => playTone("square", 660, 0.25, 0.15);
    intervalMs = 500;
  } else {
    playBeep = () => playTone("sine", 880, 0.35, 0.2);
    intervalMs = 600;
  }

  playBeep();
  beepInterval = setInterval(playBeep, intervalMs);
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

function startVibrate() {
  if (!navigator.vibrate) return;
  navigator.vibrate([500, 200, 500, 200, 500]);
  vibrateIntervalId = setInterval(() => {
    navigator.vibrate([500, 200, 500, 200, 500]);
  }, 2000);
}

function stopVibrate() {
  if (vibrateIntervalId) {
    clearInterval(vibrateIntervalId);
    vibrateIntervalId = null;
  }
  if (navigator.vibrate) navigator.vibrate(0);
}

function closeRinging() {
  stopBeep();
  stopVibrate();
  ringingOverlay.classList.remove("show");
  ringingAlarmId = null;
  ringingAlarm = null;
}

stopBtn.addEventListener("click", () => {
  closeRinging();
});

snoozeBtn.addEventListener("click", () => {
  const alarm = ringingAlarm;
  const minutes = selectedSnoozeMinutes;
  closeRinging();
  if (alarm) {
    snoozeTimeoutId = setTimeout(() => {
      triggerAlarm(alarm);
    }, minutes * 60 * 1000);
  }
});

function resetAddForm() {
  selectedTime = null;
  timeDisplayBtn.textContent = "시간을 선택하세요";
  alarmLabelInput.value = "";
  selectedDays = [];
  dayButtons.forEach((btn) => btn.classList.remove("selected"));
  alarmSoundSelect.value = "beep";
  repeatTypeSelect.value = "daily";
  customDaysGroup.hidden = true;
  intervalGroup.hidden = true;
  intervalStartDate.value = todayISO();
  intervalDaysInput.value = 2;
}

repeatTypeSelect.addEventListener("change", () => {
  const v = repeatTypeSelect.value;
  customDaysGroup.hidden = v !== "custom";
  intervalGroup.hidden = v !== "interval";
  if (v === "interval" && !intervalStartDate.value) {
    intervalStartDate.value = todayISO();
  }
});

openAddBtn.addEventListener("click", () => {
  addAlarmOverlay.classList.add("show");
});

cancelAddBtn.addEventListener("click", () => {
  resetAddForm();
  addAlarmOverlay.classList.remove("show");
});

addBtn.addEventListener("click", () => {
  if (!selectedTime) {
    alert("알람 시간을 선택해주세요.");
    return;
  }

  const repeatValue = repeatTypeSelect.value;
  let repeat;
  if (repeatValue === "custom") {
    if (selectedDays.length === 0) {
      alert("반복할 요일을 선택해주세요.");
      return;
    }
    repeat = { type: "custom", days: [...selectedDays].sort((a, b) => a - b) };
  } else if (repeatValue === "interval") {
    if (!intervalStartDate.value) {
      alert("시작일을 선택해주세요.");
      return;
    }
    repeat = {
      type: "interval",
      startDate: intervalStartDate.value,
      intervalDays: Number(intervalDaysInput.value) || 1,
    };
  } else {
    repeat = { type: repeatValue };
  }

  alarms.push({
    id: Date.now(),
    time: selectedTime,
    label: alarmLabelInput.value.trim(),
    repeat,
    sound: alarmSoundSelect.value,
    enabled: true,
    lastTriggered: null,
  });
  alarms.sort((a, b) => a.time.localeCompare(b.time));
  saveAlarms();
  renderAlarms();
  resetAddForm();
  addAlarmOverlay.classList.remove("show");
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
    const days = document.createElement("span");
    days.className = "days";
    days.textContent = formatRepeat(alarm);
    const label = document.createElement("span");
    label.className = "label";
    label.textContent = alarm.label || "";
    const meta = document.createElement("span");
    meta.className = "meta";
    const soundName = SOUND_NAMES[alarm.sound] || SOUND_NAMES.beep;
    meta.textContent = `🔔 ${soundName}`;
    info.appendChild(time);
    info.appendChild(days);
    if (alarm.label) info.appendChild(label);
    info.appendChild(meta);

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

const WEATHER_URL =
  "https://api.openweathermap.org/data/2.5/weather?lat=37.5665&lon=126.978&appid=7aeb250b3e494925d6b0217fa62ea065&units=metric";

const WEATHER_EMOJI = {
  Clear: "☀️",
  Clouds: "☁️",
  Rain: "🌧️",
  Drizzle: "🌦️",
  Thunderstorm: "⛈️",
  Snow: "❄️",
  Mist: "🌫️",
  Fog: "🌫️",
  Haze: "🌫️",
  Smoke: "🌫️",
  Dust: "🌫️",
  Sand: "🌫️",
  Ash: "🌫️",
  Squall: "🌬️",
  Tornado: "🌪️",
};

function clearWeatherBg() {
  weatherBg.className = "weather-bg";
  weatherBg.innerHTML = "";
}

function renderRain(count, dropHeight) {
  for (let i = 0; i < count; i++) {
    const drop = document.createElement("div");
    drop.className = "raindrop";
    const duration = 0.5 + Math.random() * 0.5;
    drop.style.left = Math.random() * 100 + "%";
    drop.style.height = (dropHeight || 16) + "px";
    drop.style.animationDuration = duration + "s";
    drop.style.animationDelay = -Math.random() * duration + "s";
    weatherBg.appendChild(drop);
  }
}

function renderSnow(count) {
  for (let i = 0; i < count; i++) {
    const flake = document.createElement("div");
    flake.className = "snowflake";
    const duration = 4 + Math.random() * 4;
    const size = 4 + Math.random() * 4;
    flake.style.left = Math.random() * 100 + "%";
    flake.style.width = size + "px";
    flake.style.height = size + "px";
    flake.style.animationDuration = duration + "s";
    flake.style.animationDelay = -Math.random() * duration + "s";
    weatherBg.appendChild(flake);
  }
}

function renderClouds(count) {
  for (let i = 0; i < count; i++) {
    const cloud = document.createElement("div");
    cloud.className = "cloud";
    const duration = 40 + Math.random() * 30;
    const scale = 0.7 + Math.random() * 0.8;
    cloud.style.top = 5 + Math.random() * 30 + "%";
    cloud.style.transform = `scale(${scale})`;
    cloud.style.animationDuration = duration + "s";
    cloud.style.animationDelay = -Math.random() * duration + "s";
    weatherBg.appendChild(cloud);
  }
}

function renderSun() {
  const sun = document.createElement("div");
  sun.className = "sun";
  weatherBg.appendChild(sun);
}

function renderFog(count) {
  for (let i = 0; i < count; i++) {
    const band = document.createElement("div");
    band.className = "fog-band";
    band.style.top = 10 + i * 22 + "%";
    band.style.opacity = 0.5 + Math.random() * 0.4;
    band.style.animationDuration = 10 + Math.random() * 6 + "s";
    weatherBg.appendChild(band);
  }
}

function renderThunderFlash(delay) {
  const flash = document.createElement("div");
  flash.className = "thunder-flash";
  flash.style.animationDelay = delay + "s";
  weatherBg.appendChild(flash);
}

function renderLightning(count, delay) {
  for (let i = 0; i < count; i++) {
    const bolt = document.createElement("div");
    bolt.className = "lightning-bolt";
    bolt.style.left = 15 + Math.random() * 60 + "%";
    bolt.style.animationDelay = delay + "s";
    weatherBg.appendChild(bolt);
  }
}

function setWeatherBackground(condition) {
  clearWeatherBg();
  switch (condition) {
    case "Clear":
      weatherBg.classList.add("clear");
      renderSun();
      break;
    case "Clouds":
      weatherBg.classList.add("clouds");
      renderClouds(4);
      break;
    case "Rain":
      weatherBg.classList.add("rain");
      renderClouds(2);
      renderRain(60);
      break;
    case "Drizzle":
      weatherBg.classList.add("drizzle");
      renderClouds(2);
      renderRain(30, 10);
      break;
    case "Thunderstorm": {
      weatherBg.classList.add("thunderstorm");
      renderRain(60);
      const delay = -Math.random() * 6;
      renderThunderFlash(delay);
      renderLightning(1, delay);
      break;
    }
    case "Snow":
      weatherBg.classList.add("snow");
      renderSnow(50);
      break;
    case "Mist":
    case "Fog":
    case "Haze":
    case "Smoke":
    case "Dust":
    case "Sand":
    case "Ash":
      weatherBg.classList.add("mist");
      renderFog(4);
      break;
    default:
      weatherBg.classList.add("clouds");
      renderClouds(2);
  }
}

async function loadWeather() {
  try {
    const res = await fetch(WEATHER_URL);
    if (!res.ok) throw new Error("weather request failed: " + res.status);
    const data = await res.json();
    const celsius = data.main?.temp;
    if (typeof celsius !== "number") throw new Error("no temp field in response");
    const condition = data.weather?.[0]?.main;
    const emoji = WEATHER_EMOJI[condition] || "🌡️";
    weatherEl.textContent = `${emoji} 서울 ${celsius.toFixed(1)}°C`;
    setWeatherBackground(condition);
  } catch (err) {
    weatherEl.textContent = "기온 정보를 불러올 수 없습니다.";
    console.error(err);
  }
}

weatherPreviewSelect.addEventListener("change", () => {
  const condition = weatherPreviewSelect.value;
  if (!condition) {
    loadWeather();
    return;
  }
  const emoji = WEATHER_EMOJI[condition] || "🌡️";
  weatherEl.textContent = `${emoji} 미리보기: ${weatherPreviewSelect.selectedOptions[0].textContent}`;
  setWeatherBackground(condition);
});

setInterval(updateClock, 1000);
updateClock();
resetAddForm();
renderAlarms();
loadWeather();
