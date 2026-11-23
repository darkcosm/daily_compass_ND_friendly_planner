        const STORAGE_KEY = "daily-compass";
        const MIGRATED_KEY = "daily-compass-migrated";
        const MOODS = ["heavy", "low", "okay", "good", "light"];
        const ENERGIES = ["empty", "low", "some", "steady", "full"];
        const MOOD_LABEL = { heavy: "Heavy", low: "Low", okay: "Okay", good: "Good", light: "Light" };
        const ENERGY_LABEL = { empty: "Empty", low: "Low", some: "Some", steady: "Steady", full: "Full" };
        const MOOD_MAP = {
            "very-low": "heavy",
            low: "low",
            neutral: "okay",
            good: "good",
            excellent: "light",
            heavy: "heavy",
            okay: "okay",
            light: "light"
        };
        const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
        const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

        let state = emptyState();
        let viewKey = "";
        let ready = false;
        let lastSaveFailed = false;
        let carryItems = [];

        function emptyState() {
            return { version: 1, nearby: "", days: {}, legacy: null };
        }

        function storageGet(key) {
            try { return localStorage.getItem(key); } catch (err) { return null; }
        }

        function storageSet(key, value) {
            try {
                localStorage.setItem(key, value);
                return true;
            } catch (err) {
                return false;
            }
        }

        function keyFor(date) {
            const y = date.getFullYear();
            const m = String(date.getMonth() + 1).padStart(2, "0");
            const d = String(date.getDate()).padStart(2, "0");
            return y + "-" + m + "-" + d;
        }

        function parseKey(key) {
            const parts = key.split("-").map(Number);
            return new Date(parts[0], parts[1] - 1, parts[2]);
        }

        function todayKey() {
            return keyFor(new Date());
        }

        function shiftKey(key, delta) {
            const date = parseKey(key);
            date.setDate(date.getDate() + delta);
            return keyFor(date);
        }

        function formatDate(date) {
            return WEEKDAYS[date.getDay()] + ", " + MONTHS[date.getMonth()] + " " + date.getDate() + ", " + date.getFullYear();
        }

        function asText(value) {
            return typeof value === "string" ? value : "";
        }

        function mapEnergy(energy) {
            if (typeof energy === "string" && ENERGIES.indexOf(energy) !== -1) return energy;
            const level = typeof energy === "number" ? energy : energy && energy.level;
            return { 1: "empty", 2: "low", 3: "some", 4: "steady", 5: "full" }[level] || null;
        }

        function cleanTasks(list) {
            const source = Array.isArray(list) ? list : [];
            return [0, 1, 2].map(function (index) {
                const item = source[index];
                const text = typeof item === "string"
                    ? item.slice(0, 280)
                    : asText(item && item.text).slice(0, 280);
                const done = Boolean(item && (item.done || item.completed) && text.trim());
                return { text: text, done: done };
            });
        }

        function cleanDay(day) {
            const moodName = MOOD_MAP[day && day.mood] || null;
            return {
                mood: moodName && MOODS.indexOf(moodName) !== -1 ? moodName : null,
                energy: mapEnergy(day && day.energy),
                tasks: cleanTasks(day && day.tasks),
                dump: asText(day && (day.dump || "")).slice(0, 20000),
                updated: asText(day && (day.updated || day.lastModified || ""))
            };
        }

        function meaningful(day) {
            if (!day) return false;
            if (day.mood || day.energy) return true;
            if (asText(day.dump).trim()) return true;
            return (day.tasks || []).some(function (task) { return task.text && task.text.trim(); });
        }

        function normalizeState(data) {
            const next = emptyState();
            next.nearby = asText(data && data.nearby).slice(0, 8000);
            next.legacy = data && data.legacy != null ? data.legacy : null;
            const days = data && data.days && typeof data.days === "object" ? data.days : {};
            Object.keys(days).forEach(function (key) {
                if (!/^\d{4}-\d{2}-\d{2}$/.test(key)) return;
                const day = cleanDay(days[key]);
                if (meaningful(day)) next.days[key] = day;
            });
            return next;
        }

        function legacyBlock(entry, names, field, title) {
            if (!entry || !Array.isArray(entry[field]) || !Array.isArray(names)) return "";
            const done = names.filter(function (name, index) {
                return entry[field][index] && asText(name).trim();
            }).map(function (name) { return asText(name).trim(); });
            if (!done.length) return "";
            return title + ":\n" + done.join("\n");
        }

        function convertLegacy(entries, settings) {
            const map = {};
            (Array.isArray(settings) ? settings : []).forEach(function (item) {
                if (item && typeof item.key === "string") map[item.key] = item.value;
            });
            const selfCareNames = Array.isArray(map.selfCareItems) ? map.selfCareItems : [];
            const hygieneNames = Array.isArray(map.hygieneItems) ? map.hygieneItems : [];
            const days = {};

            (Array.isArray(entries) ? entries : []).forEach(function (entry) {
                if (!entry || typeof entry.date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(entry.date)) return;
                const fields = [
                    ["wins", "Wins"],
                    ["gratitude", "Gratitude"],
                    ["thoughts", "Thoughts"],
                    ["tomorrow", "Tomorrow"],
                    ["moodNotes", "Note"],
                    ["exercise", "Movement"],
                    ["water", "Water"],
                    ["sleep", "Sleep"],
                    ["meds", "Medications and supplements"]
                ];
                const parts = [];
                fields.forEach(function (pair) {
                    const value = asText(entry[pair[0]]).trim();
                    if (value) parts.push(pair[1] + ":\n" + value);
                });
                const care = legacyBlock(entry, selfCareNames, "selfCare", "Self-care");
                const hygiene = legacyBlock(entry, hygieneNames, "hygiene", "Hygiene");
                if (care) parts.push(care);
                if (hygiene) parts.push(hygiene);
                const tasks = Array.isArray(entry.tasks) ? entry.tasks : [];
                const extra = tasks.slice(3).map(function (task) {
                    return asText(task && task.text).trim();
                }).filter(Boolean);
                if (extra.length) parts.push("Also on the list:\n" + extra.join("\n"));
                const day = cleanDay({
                    mood: entry.mood,
                    energy: entry.energy,
                    tasks: tasks,
                    dump: parts.join("\n\n"),
                    updated: entry.lastModified || ""
                });
                if (meaningful(day)) days[entry.date] = day;
            });

            const today = todayKey();
            const globalTasks = Array.isArray(map.tasks) ? map.tasks : [];
            const todayHasTasks = days[today] && days[today].tasks.some(function (task) { return task.text.trim(); });
            if (globalTasks.length && !todayHasTasks) {
                const base = days[today] || cleanDay({});
                const extras = globalTasks.slice(3).map(function (task) {
                    return asText(task && task.text).trim();
                }).filter(Boolean);
                base.tasks = cleanTasks(globalTasks);
                if (extras.length) {
                    const addition = "Also on the list:\n" + extras.join("\n");
                    base.dump = [base.dump, addition].filter(Boolean).join("\n\n");
                }
                if (!base.updated) base.updated = new Date().toISOString();
                if (meaningful(base)) days[today] = base;
            }

            return {
                version: 1,
                nearby: asText(map.persistentNotes).slice(0, 8000),
                days: days,
                legacy: { entries: entries || [], settings: settings || [] }
            };
        }

        const BANNED_KEYS = Object.create(null);
        BANNED_KEYS["__proto__"] = true;
        BANNED_KEYS.constructor = true;
        BANNED_KEYS.prototype = true;
        const NEW_ROOT_KEYS = ["app", "version", "exportedAt", "nearby", "days", "legacy"];
        const DAY_KEYS = ["mood", "energy", "tasks", "dump", "updated"];
        const NEW_TASK_KEYS = ["text", "done"];
        const OLD_ROOT_KEYS = ["entries", "settings", "exportDate", "version"];
        const ENTRY_KEYS = ["date", "mood", "energy", "moodNotes", "wins", "gratitude", "thoughts", "tomorrow", "exercise", "water", "sleep", "meds", "selfCare", "hygiene", "tasks", "lastModified"];
        const OLD_TASK_KEYS = ["text", "completed", "done", "priority", "estimate", "createdAt"];
        const ENERGY_KEYS = ["level", "intensity"];
        const SETTING_KEYS = ["key", "value"];
        const TIMER_VALUE_KEYS = ["focusSessions", "focusMinutes", "breaks"];
        const MOOD_INPUT = ["very-low", "low", "neutral", "good", "excellent", "heavy", "okay", "light"];
        const SETTING_NAME = /^(persistentNotes|selfCareItems|hygieneItems|tasks|timerStats_\d{4}-\d{2}-\d{2})$/;
        const MAX_DAYS = 4000;
        const MAX_TEXT = 20000;

        function assertPlain(value) {
            if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("bad");
        }

        function assertKeys(obj, allowed) {
            Object.keys(obj).forEach(function (key) {
                if (BANNED_KEYS[key] || allowed.indexOf(key) === -1) throw new Error("bad");
            });
        }

        function assertShortString(value, max) {
            if (typeof value !== "string" || value.length > max) throw new Error("bad");
        }

        function assertMood(value) {
            if (value == null) return;
            if (typeof value !== "string" || MOOD_INPUT.indexOf(value) === -1) throw new Error("bad");
        }

        function assertEnergy(value) {
            if (value == null) return;
            if (typeof value === "number") {
                if (!Number.isFinite(value) || value < 1 || value > 5) throw new Error("bad");
                return;
            }
            assertPlain(value);
            assertKeys(value, ENERGY_KEYS);
            if (value.level != null && (typeof value.level !== "number" || value.level < 1 || value.level > 5)) throw new Error("bad");
            if (value.intensity != null && (typeof value.intensity !== "number" || value.intensity < 0 || value.intensity > 5)) throw new Error("bad");
        }

        function assertBoolList(value) {
            if (!Array.isArray(value) || value.length > 100) throw new Error("bad");
            value.forEach(function (item) {
                if (typeof item !== "boolean") throw new Error("bad");
            });
        }

        function assertOldTask(task) {
            assertPlain(task);
            assertKeys(task, OLD_TASK_KEYS);
            if (task.text != null) assertShortString(task.text, 280);
            if (task.completed != null && typeof task.completed !== "boolean") throw new Error("bad");
            if (task.done != null && typeof task.done !== "boolean") throw new Error("bad");
            if (task.priority != null) assertShortString(task.priority, 20);
            if (task.estimate != null) assertShortString(task.estimate, 40);
            if (task.createdAt != null) assertShortString(task.createdAt, 40);
        }

        function assertNewTask(task) {
            assertPlain(task);
            assertKeys(task, NEW_TASK_KEYS);
            if (typeof task.text !== "string" || task.text.length > 280) throw new Error("bad");
            if (task.done != null && typeof task.done !== "boolean") throw new Error("bad");
        }

        function assertTaskList(list, mode) {
            if (!Array.isArray(list) || list.length > 50) throw new Error("bad");
            list.forEach(function (task) {
                if (mode === "new") assertNewTask(task);
                else assertOldTask(task);
            });
        }

        function assertEntry(entry) {
            assertPlain(entry);
            assertKeys(entry, ENTRY_KEYS);
            if (typeof entry.date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(entry.date)) throw new Error("bad");
            assertMood(entry.mood);
            assertEnergy(entry.energy);
            ["moodNotes", "wins", "gratitude", "thoughts", "tomorrow", "exercise", "water", "sleep", "meds", "lastModified"].forEach(function (field) {
                if (entry[field] != null) assertShortString(entry[field], MAX_TEXT);
            });
            if (entry.selfCare != null) assertBoolList(entry.selfCare);
            if (entry.hygiene != null) assertBoolList(entry.hygiene);
            if (entry.tasks != null) assertTaskList(entry.tasks, "old");
        }

        function assertSettingValue(value, depth) {
            if (depth > 4) throw new Error("bad");
            if (value == null || typeof value === "boolean") return;
            if (typeof value === "number") {
                if (!Number.isFinite(value)) throw new Error("bad");
                return;
            }
            if (typeof value === "string") {
                if (value.length > MAX_TEXT) throw new Error("bad");
                return;
            }
            if (Array.isArray(value)) {
                if (value.length > 200) throw new Error("bad");
                value.forEach(function (item) { assertSettingValue(item, depth + 1); });
                return;
            }
            if (typeof value === "object") {
                assertKeys(value, OLD_TASK_KEYS.concat(TIMER_VALUE_KEYS));
                Object.keys(value).forEach(function (key) { assertSettingValue(value[key], depth + 1); });
                return;
            }
            throw new Error("bad");
        }

        function assertSetting(item) {
            assertPlain(item);
            assertKeys(item, SETTING_KEYS);
            if (typeof item.key !== "string" || !SETTING_NAME.test(item.key)) throw new Error("bad");
            assertSettingValue(item.value, 0);
        }

        function assertOldBundle(data) {
            assertKeys(data, OLD_ROOT_KEYS);
            if (data.entries != null) {
                if (!Array.isArray(data.entries) || data.entries.length > MAX_DAYS) throw new Error("bad");
                data.entries.forEach(assertEntry);
            }
            if (data.settings != null) {
                if (!Array.isArray(data.settings) || data.settings.length > 500) throw new Error("bad");
                data.settings.forEach(assertSetting);
            }
            if (data.exportDate != null) assertShortString(data.exportDate, 40);
            if (data.version != null && (typeof data.version !== "number" || !Number.isFinite(data.version) || data.version < 0 || data.version > 20)) throw new Error("bad");
            if (!Array.isArray(data.entries) && !Array.isArray(data.settings)) throw new Error("bad");
        }

        function assertDay(day) {
            assertPlain(day);
            assertKeys(day, DAY_KEYS);
            assertMood(day.mood);
            if (day.energy != null) {
                if (typeof day.energy !== "string" || ENERGIES.indexOf(day.energy) === -1) throw new Error("bad");
            }
            if (day.tasks != null) assertTaskList(day.tasks, "new");
            if (day.dump != null) assertShortString(day.dump, MAX_TEXT);
            if (day.updated != null) assertShortString(day.updated, 40);
        }

        function assertNewFile(data) {
            assertKeys(data, NEW_ROOT_KEYS);
            if (data.app !== "daily-compass") throw new Error("bad");
            if (data.version !== 1) throw new Error("bad");
            if (data.exportedAt != null) assertShortString(data.exportedAt, 40);
            if (data.nearby != null) assertShortString(data.nearby, 8000);
            if (!data.days || typeof data.days !== "object" || Array.isArray(data.days)) throw new Error("bad");
            const dates = Object.keys(data.days);
            if (dates.length > MAX_DAYS) throw new Error("bad");
            dates.forEach(function (date) {
                if (BANNED_KEYS[date] || !/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error("bad");
                assertDay(data.days[date]);
            });
            if (data.legacy != null) {
                assertPlain(data.legacy);
                assertOldBundle(data.legacy);
            }
        }

        function parseBackup(data) {
            if (!data || typeof data !== "object" || Array.isArray(data)) throw new Error("bad");
            if (data.app === "daily-compass") {
                assertNewFile(data);
                return normalizeState(data);
            }
            if (data.app != null) throw new Error("bad");
            assertOldBundle(data);
            return normalizeState(convertLegacy(data.entries || [], data.settings || []));
        }

        function migrateIndexedDB() {
            return new Promise(function (resolve) {
                let finished = false;
                function done(value) {
                    if (finished) return;
                    finished = true;
                    resolve(value);
                }
                if (!("indexedDB" in window) || typeof indexedDB.databases !== "function") {
                    done(null);
                    return;
                }
                indexedDB.databases().then(function (dbs) {
                    const found = (dbs || []).some(function (db) { return db && db.name === "DailyCompassDB"; });
                    if (!found) {
                        done(null);
                        return;
                    }
                    const request = indexedDB.open("DailyCompassDB");
                    request.onerror = function () { done(null); };
                    request.onupgradeneeded = function () {
                        try { request.transaction.abort(); } catch (err) {}
                        done(null);
                    };
                    request.onsuccess = function () {
                        const db = request.result;
                        try {
                            if (!db.objectStoreNames.contains("entries")) {
                                db.close();
                                done(null);
                                return;
                            }
                            const hasSettings = db.objectStoreNames.contains("settings");
                            const tx = db.transaction(hasSettings ? ["entries", "settings"] : ["entries"], "readonly");
                            let entries = [];
                            let settings = [];
                            const entriesRequest = tx.objectStore("entries").getAll();
                            entriesRequest.onsuccess = function () { entries = entriesRequest.result || []; };
                            if (hasSettings) {
                                const settingsRequest = tx.objectStore("settings").getAll();
                                settingsRequest.onsuccess = function () { settings = settingsRequest.result || []; };
                            }
                            tx.oncomplete = function () {
                                db.close();
                                if (!entries.length && !settings.length) {
                                    done(null);
                                    return;
                                }
                                done(convertLegacy(entries, settings));
                            };
                            tx.onerror = function () {
                                db.close();
                                done(null);
                            };
                        } catch (err) {
                            try { db.close(); } catch (closeErr) {}
                            done(null);
                        }
                    };
                }).catch(function () { done(null); });
            });
        }

        function setStatus(message) {
            document.getElementById("status").textContent = message || "";
        }

        function setLocked(locked) {
            document.querySelectorAll("main button, main input, main textarea, .dateblock button").forEach(function (el) {
                el.disabled = locked;
            });
        }

        function readDay() {
            const mood = document.querySelector('input[name="mood"]:checked');
            const energy = document.querySelector('input[name="energy"]:checked');
            return cleanDay({
                mood: mood ? mood.value : null,
                energy: energy ? energy.value : null,
                tasks: [0, 1, 2].map(function (index) {
                    const text = document.getElementById("task-" + index).value;
                    const done = document.getElementById("done-" + index).checked;
                    return { text: text, done: done };
                }),
                dump: document.getElementById("dump").value,
                updated: new Date().toISOString()
            });
        }

        function sameDay(a, b) {
            if (!a || !b) return false;
            if (a.mood !== b.mood || a.energy !== b.energy || a.dump !== b.dump) return false;
            for (let i = 0; i < 3; i++) {
                if (a.tasks[i].text !== b.tasks[i].text || a.tasks[i].done !== b.tasks[i].done) return false;
            }
            return true;
        }

        function flush() {
            if (!viewKey) return;
            const day = readDay();
            const prev = state.days[viewKey];
            if (prev && sameDay(prev, day)) day.updated = prev.updated;
            if (meaningful(day)) state.days[viewKey] = day;
            else delete state.days[viewKey];
            state.nearby = document.getElementById("nearby").value.slice(0, 8000);
        }

        function persist() {
            const ok = storageSet(STORAGE_KEY, JSON.stringify(state));
            if (!ok) {
                lastSaveFailed = true;
                setStatus("Could not save in this browser. Export a copy if you can.");
            } else if (lastSaveFailed) {
                lastSaveFailed = false;
                setStatus("Saved in this browser.");
            }
        }

        function fill() {
            const day = state.days[viewKey] || cleanDay({});
            document.querySelectorAll('input[name="mood"]').forEach(function (input) {
                input.checked = input.value === day.mood;
            });
            document.querySelectorAll('input[name="energy"]').forEach(function (input) {
                input.checked = input.value === day.energy;
            });
            [0, 1, 2].forEach(function (index) {
                const task = day.tasks[index] || { text: "", done: false };
                document.getElementById("task-" + index).value = task.text || "";
                document.getElementById("done-" + index).checked = Boolean(task.done && task.text && task.text.trim());
            });
            document.getElementById("dump").value = day.dump || "";
            document.getElementById("nearby").value = state.nearby || "";
        }

        function renderChrome() {
            const today = todayKey();
            document.getElementById("whenLabel").textContent = viewKey === today
                ? "Today"
                : (viewKey < today ? "An earlier day" : "A later day");
            document.getElementById("dateHeading").textContent = formatDate(parseKey(viewKey));
            document.getElementById("backToday").hidden = viewKey === today;
        }

        function renderCarry() {
            const box = document.getElementById("carry");
            const list = document.getElementById("carryList");
            list.replaceChildren();
            carryItems = [];
            if (viewKey !== todayKey()) {
                box.hidden = true;
                return;
            }
            const yesterday = state.days[shiftKey(todayKey(), -1)];
            const used = new Set([0, 1, 2].map(function (index) {
                return document.getElementById("task-" + index).value.trim();
            }).filter(Boolean));
            const emptySlots = [0, 1, 2].filter(function (index) {
                return !document.getElementById("task-" + index).value.trim();
            }).length;
            const open = !yesterday ? [] : yesterday.tasks.filter(function (task) {
                const text = task && task.text ? task.text.trim() : "";
                return text && !task.done && !used.has(text);
            });
            if (!open.length || emptySlots === 0) {
                box.hidden = true;
                return;
            }
            open.forEach(function (task) {
                const text = task.text.trim();
                const item = document.createElement("li");
                const span = document.createElement("span");
                span.textContent = text;
                const button = document.createElement("button");
                button.type = "button";
                button.className = "texty";
                button.dataset.index = String(carryItems.length);
                button.textContent = "Add to today";
                carryItems.push(text);
                item.append(span, button);
                list.append(item);
            });
            box.hidden = false;
        }

        function showDay(nextKey, focusHeading) {
            if (ready) flush();
            viewKey = nextKey;
            fill();
            renderCarry();
            renderChrome();
            if (focusHeading) document.getElementById("dateHeading").focus();
        }

        function addText(parent, tag, className, text) {
            const node = document.createElement(tag);
            if (className) node.className = className;
            if (text != null) node.textContent = text;
            parent.append(node);
            return node;
        }

        function renderPrint() {
            const sheet = document.getElementById("printSheet");
            sheet.replaceChildren();
            const day = state.days[viewKey] || readDay();
            addText(sheet, "div", "print-rule", "");
            addText(sheet, "p", "print-kicker", "Her Own Terms");
            addText(sheet, "h1", "", "Daily Compass");
            addText(sheet, "p", "", formatDate(parseKey(viewKey)));
            const bits = [];
            if (day.mood && MOOD_LABEL[day.mood]) bits.push("Mood: " + MOOD_LABEL[day.mood]);
            if (day.energy && ENERGY_LABEL[day.energy]) bits.push("Energy: " + ENERGY_LABEL[day.energy]);
            if (bits.length) addText(sheet, "p", "", bits.join(". "));
            const tasks = (day.tasks || []).filter(function (task) { return task.text && task.text.trim(); });
            if (tasks.length) {
                addText(sheet, "h2", "", "Three things");
                const list = document.createElement("ul");
                tasks.forEach(function (task) {
                    const prefix = task.done ? "Done. " : "";
                    addText(list, "li", "", prefix + task.text.trim());
                });
                sheet.append(list);
            }
            if (asText(day.dump).trim()) {
                addText(sheet, "h2", "", "Brain dump");
                addText(sheet, "p", "pre", day.dump);
            }
            if (asText(state.nearby).trim()) {
                addText(sheet, "h2", "", "Keep nearby");
                addText(sheet, "p", "pre", state.nearby);
            }
            addText(sheet, "p", "print-kicker", "A free tool from Her Own Terms. herownterms.me");
        }

        function downloadExport() {
            flush();
            const payload = {
                app: "daily-compass",
                version: 1,
                exportedAt: new Date().toISOString(),
                nearby: state.nearby,
                days: state.days,
                legacy: state.legacy
            };
            const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
            const url = URL.createObjectURL(blob);
            const link = document.createElement("a");
            link.href = url;
            link.download = "daily-compass-" + todayKey() + ".json";
            document.body.append(link);
            link.click();
            link.remove();
            URL.revokeObjectURL(url);
            setStatus("Downloaded a copy.");
        }

        function mergeState(incoming) {
            Object.keys(incoming.days).forEach(function (key) {
                const current = state.days[key];
                const next = incoming.days[key];
                if (!current || String(next.updated || "") >= String(current.updated || "")) {
                    state.days[key] = next;
                }
            });
            if (!asText(state.nearby).trim() && incoming.nearby) state.nearby = incoming.nearby;
            if (state.legacy == null && incoming.legacy != null) state.legacy = incoming.legacy;
        }

        function ask(opts) {
            const dialog = document.getElementById("choiceDialog");
            document.getElementById("choiceTitle").textContent = opts.title;
            document.getElementById("choiceBody").textContent = opts.body;
            document.getElementById("choicePrimary").textContent = opts.primary;
            const alt = document.getElementById("choiceAlt");
            alt.hidden = !opts.alt;
            if (opts.alt) alt.textContent = opts.alt;
            return new Promise(function (resolve) {
                if (typeof dialog.showModal !== "function") {
                    const message = opts.body;
                    if (opts.alt) {
                        const replace = confirm(message + "\n\nOK replaces what is saved here. Cancel is the next question.");
                        if (replace) resolve("primary");
                        else resolve(confirm("Merge the file with what is already here?") ? "alt" : "cancel");
                    } else {
                        resolve(confirm(message) ? "primary" : "cancel");
                    }
                    return;
                }
                let settled = false;
                function finish(value) {
                    if (settled) return;
                    settled = true;
                    if (dialog.open) dialog.close();
                    resolve(value);
                }
                document.getElementById("choiceCancel").onclick = function () { finish("cancel"); };
                alt.onclick = function () { finish("alt"); };
                document.getElementById("choicePrimary").onclick = function () { finish("primary"); };
                dialog.addEventListener("close", function () { finish("cancel"); }, { once: true });
                dialog.showModal();
            });
        }

        function refresh() {
            fill();
            renderCarry();
            renderChrome();
        }

        document.getElementById("prevDay").addEventListener("click", function () {
            if (!ready) return;
            showDay(shiftKey(viewKey, -1), true);
        });

        document.getElementById("nextDay").addEventListener("click", function () {
            if (!ready) return;
            showDay(shiftKey(viewKey, 1), true);
        });

        document.getElementById("backToday").addEventListener("click", function () {
            if (!ready) return;
            showDay(todayKey(), true);
        });

        document.getElementById("today").addEventListener("input", function (event) {
            if (!ready) return;
            const target = event.target;
            if (target.matches("[data-task]")) {
                const box = document.getElementById("done-" + target.getAttribute("data-task"));
                if (!target.value.trim()) box.checked = false;
            }
            flush();
            persist();
            if (viewKey === todayKey()) renderCarry();
        });

        document.getElementById("clearMood").addEventListener("click", function () {
            if (!ready) return;
            document.querySelectorAll('input[name="mood"]').forEach(function (input) { input.checked = false; });
            flush();
            persist();
        });

        document.getElementById("clearEnergy").addEventListener("click", function () {
            if (!ready) return;
            document.querySelectorAll('input[name="energy"]').forEach(function (input) { input.checked = false; });
            flush();
            persist();
        });

        document.getElementById("carry").addEventListener("click", function (event) {
            const button = event.target.closest("button[data-index]");
            if (!button || !ready) return;
            const text = carryItems[Number(button.dataset.index)];
            if (!text) return;
            const slot = [0, 1, 2].map(function (index) {
                return document.getElementById("task-" + index);
            }).find(function (input) { return !input.value.trim(); });
            if (!slot) return;
            slot.value = text;
            flush();
            persist();
            renderCarry();
            slot.focus();
        });

        document.getElementById("exportBtn").addEventListener("click", function () {
            if (!ready) return;
            downloadExport();
        });

        document.getElementById("importBtn").addEventListener("click", function () {
            if (!ready) return;
            document.getElementById("fileInput").click();
        });

        document.getElementById("fileInput").addEventListener("change", function (event) {
            const file = event.target.files && event.target.files[0];
            event.target.value = "";
            if (!file || !ready) return;
            if (file.size > 5000000) {
                setStatus("That file is too large to import.");
                return;
            }
            const reader = new FileReader();
            reader.onload = function () {
                let parsed;
                try {
                    parsed = parseBackup(JSON.parse(String(reader.result || "")));
                } catch (err) {
                    setStatus("That file could not be read. Choose a Daily Compass JSON file.");
                    return;
                }
                ask({
                    title: "Bring in a file",
                    body: "Replace the planner in this browser, or merge the file with what is already here.",
                    primary: "Replace",
                    alt: "Merge"
                }).then(function (choice) {
                    if (choice === "cancel") return;
                    flush();
                    if (choice === "primary") state = parsed;
                    else mergeState(parsed);
                    persist();
                    refresh();
                    setStatus(choice === "primary" ? "Imported. Replaced what was here." : "Imported. Merged with what was here.");
                });
            };
            reader.onerror = function () {
                setStatus("That file could not be read. Choose a Daily Compass JSON file.");
            };
            reader.readAsText(file);
        });

        document.getElementById("printBtn").addEventListener("click", function () {
            if (!ready) return;
            flush();
            renderPrint();
            window.print();
        });

        window.addEventListener("beforeprint", function () {
            if (!ready) return;
            flush();
            renderPrint();
        });

        document.getElementById("clearBtn").addEventListener("click", function () {
            if (!ready) return;
            ask({
                title: "Clear everything?",
                body: "This removes the planner saved in this browser. Export a copy first if you want to keep it.",
                primary: "Clear"
            }).then(function (choice) {
                if (choice !== "primary") return;
                state = emptyState();
                storageSet(STORAGE_KEY, JSON.stringify(state));
                try { indexedDB.deleteDatabase("DailyCompassDB"); } catch (err) {}
                refresh();
                setStatus("Cleared.");
            });
        });

        [0, 1, 2].forEach(function (index) {
            document.getElementById("task-" + index).addEventListener("keydown", function (event) {
                if (event.key !== "Enter") return;
                event.preventDefault();
                const next = document.getElementById("task-" + (index + 1)) || document.getElementById("dump");
                next.focus();
            });
        });

        window.addEventListener("storage", function (event) {
            if (event.key !== STORAGE_KEY || !ready) return;
            const active = document.activeElement;
            if (active && active.matches("input, textarea")) return;
            try {
                state = normalizeState(JSON.parse(event.newValue || "null"));
                refresh();
            } catch (err) {}
        });

        async function init() {
            setLocked(true);
            const raw = storageGet(STORAGE_KEY);
            const migrated = storageGet(MIGRATED_KEY) === "1";
            if (raw) {
                try { state = normalizeState(JSON.parse(raw)); }
                catch (err) { state = emptyState(); }
            } else if (!migrated) {
                const legacy = await migrateIndexedDB();
                state = legacy ? normalizeState(legacy) : emptyState();
                if (legacy) storageSet(STORAGE_KEY, JSON.stringify(state));
            } else {
                state = emptyState();
            }
            storageSet(MIGRATED_KEY, "1");
            viewKey = todayKey();
            refresh();
            ready = true;
            setLocked(false);
        }

        if (document.readyState === "loading") {
            document.addEventListener("DOMContentLoaded", init);
        } else {
            init();
        }
    
