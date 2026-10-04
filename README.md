# 🎃 HACK THE HALLOWEEN

A Halloween cybersecurity escape game for the **EmpaSoft** Halloween event.

> **EMPASOFT SYSTEM HAS BEEN HACKED.** A Halloween virus has locked the school's system.
> Teams solve 6 clues, collect 6 🔑 key fragments, and recover the MASTER PASSWORD to restore the system.

⚠️ **This is a fictional simulation.** It does no real hacking, scanning or exploitation, and it never connects to EmpaSoft's network. Every password in it is made up.

- **Players:** teams of 5–6, beginner-friendly (no cybersecurity major needed)
- **Duration:** 15-minute countdown by default (changeable for all PCs from the organizer page)
- **Tech:** plain HTML + CSS + vanilla JavaScript, plus a Firebase Realtime Database for the shared parts
- **Devices:** made for lab PCs (1366×768) and also works on phones. One stage happens on a phone through a QR code.

```text
hack-the-halloween/
├── index.html   ← page structure
├── style.css    ← Halloween + terminal design, responsive layout
├── script.js    ← all game logic + DEFAULT_CONFIG (default answers, timer, penalties, Firebase URL)
├── 404.html     ← "Night of the Bugs" error page (GitHub Pages shows it for unknown addresses)
├── assets/
│   └── night-of-the-bugs.jpg
└── README.md
```

### Three addresses

| Address | Who uses it |
|---|---|
| `https://<your-site>/` | Every team PC |
| `https://<your-site>/#admin` | Organizer only (PIN). Controls every PC. |
| `https://<your-site>/#leaderboard` | Projector |

---

## Game flow

```text
START (team name, shows STARTING SOON) → Mission Briefing (waits for the organizer)
→ organizer presses START → one countdown on every PC → all teams start together
→ Stage 1: Binary Code        → 🔑 fragment
→ Stage 2: Caesar Cipher      → 🔑 fragment
→ Stage 3: Hidden Message     → 🔑 fragment
→ Stage 4: QR Code (phone)    → 🔑 fragment
→ Stage 5: Fake Login System  → 🔑 fragment
→ Stage 6: Find the Bug       → 🔑 fragment
→ FINAL: unscramble the 6 fragments into the MASTER PASSWORD
→ 🔓 SYSTEM RESTORED → result goes to the shared leaderboard
```

### 🔑 Answer key

The answers are **not** written here, because a public GitHub repo (and its README) can be read by anyone. Organizers see them on the organizer page: `#admin` → **🔑 ANSWER KEY**.

Answers are **not case-sensitive**, and spaces and basic punctuation are ignored.
After each stage the game shows a short 🛡 **security note** (ASCII, AES, steganography, quishing, password managers, code review), so players learn something too.

---

## ⏱ How time and the leaderboard work

```text
TOTAL TIME = TIME PLAYED + HINT PENALTY
TIME LEFT  = TIME LIMIT − TOTAL TIME        (0 → TIME'S UP)
```

- Each stage (and the final) has 2 hints. The penalty grows with the **total** number of hints a team has used: 1st +30s, 2nd +45s, 3rd +60s, 4th +90s, 5th and later +120s. So 5 hints = 5:45 extra.
- A hint with a penalty needs two clicks, so nobody takes one by accident.
- The win screen shows the sum: `TIME PLAYED + HINT PENALTY = TOTAL TIME`.
- The leaderboard ranks by **TOTAL TIME** (lower wins). Equal times are ranked by fewer hints. Each row shows the hint penalty, and the team's own PC marks its row **(Your team)**.
- PC clocks are synced to the Firebase server clock, and refreshing the page does not reset or cheat the timer.

---

## 🛠 Organizer page (`#admin`)

Open `https://<your-site>/#admin` on your own laptop or phone and enter the PIN (ask the game owner; change it in ⚙ SETTINGS before the event). This page is not a team: it doesn't appear in LIVE TEAMS and RESET ALL doesn't touch it. There is no shortcut on the normal game link. The console only opens at `#admin`.

Everything here applies to **every PC at once**:

| Control | What happens on every PC |
|---|---|
| ▶ START IN 30s / 1 MIN / 1 MIN 30s / 2 MIN | One big countdown, then all teams start together. Until then, PCs show **STARTING SOON**. |
| ✕ CANCEL START | Back to STARTING SOON. |
| ⏱ TOTAL TIME → APPLY TO ALL | Changes the time limit everywhere, even for games already running. |
| ⏸ PAUSE ALL / ▶ RESUME ALL | Freezes every team's timer. |
| +1 MIN ALL / −1 MIN ALL | Gives or takes a minute from every team. |
| 🔄 RESET ALL PCs | Sends every PC back to the team-name screen for a new round. The leaderboard is kept. |
| 📡 LIVE TEAMS | Each PC's team, stage, time left and hints, updated every few seconds. |
| 🏆 LEADERBOARD | Delete a result (✕), add demo data for testing, 🗑 CLEAR ALL, open the projector view. |
| ⚙ SETTINGS → SAVE | Answers, master password, hint penalties, PIN, QR base URL. Every PC updates instantly, even mid-game (progress and hints are kept). |
| ↺ RESTORE DEFAULTS | Back to `DEFAULT_CONFIG` from `script.js` on every PC. |

> Change settings **before** a round starts. Changing an answer mid-game redraws the team's screen, and changing the master password changes the fragments they have already collected.

On a team's win or TIME'S UP screen, **↺ ДАХИН ЭХЛЭХ** (3 clicks to confirm) resets that one PC and removes that team's result from the leaderboard.

### Default values in `script.js`

`DEFAULT_CONFIG` at the top of `script.js` holds the timer, hint penalties, QR base URL and Firebase URL. The default answers, phone quiz and PIN hash are stored **encoded** in `SECRET_DEFAULTS`, so they can't be read from the source. Change answers and the PIN on the organizer page (⚙ SETTINGS). The puzzles rebuild themselves from the words: change the Stage 1 word and the binary changes to match, and the same goes for the cipher and the hidden sentences.

> If you set the Stage 5 password by hand, also update the Stage 5 note so the clue still makes sense.
> If you change the master password, also change the final hint, because the default hint is about "turning it off and on again".

---

## 🌐 Firebase (shared leaderboard, control and settings)

The game uses a free Firebase Realtime Database through its REST API (no SDK). The URL is `firebaseUrl` in `DEFAULT_CONFIG`.

To use your own database:

1. Go to <https://console.firebase.google.com> → **Add project** (Google Analytics not needed).
2. **Build → Realtime Database → Create database** → pick a region → **Start in test mode**.
3. Copy the database URL and put it in `firebaseUrl`, then redeploy.

Paths used: `/leaderboard`, `/control`, `/config`, `/teams`, `/clock`. Test-mode rules expire after 30 days, which is fine for a one-night event. Anyone who knows the URL can write to the database, so don't reuse it for anything else.

If a PC briefly loses internet, its game keeps running and unsent results are sent when it reconnects. A PC with no internet at the start can't receive the START signal and will stay on STARTING SOON.

---

## 🛡 Anti-cheat (DevTools / F12)

The game hides what a quick F12 look would reveal:

- Answers, the PIN, and each PC's game progress are stored **encoded** in `localStorage`, in Firebase `/config` and in `script.js`. Nothing readable shows up in the Application, Network or Sources tabs.
- Progress has a checksum: if someone edits it by hand (for example to jump to the final stage), the game rejects it and starts fresh.
- The PIN is stored only as a SHA-256 hash. Use **8+ characters**: a 4-digit PIN can be guessed by trying all 10,000 options.
- All code runs inside a closure, so `CONFIG` or `state` can't be changed from the DevTools console.

⚠ Without a server, a very determined student who reads and debugs the JavaScript can still decode it. The strongest protection is to **turn DevTools off on the lab PCs** (this also blocks `view-source:`). In an administrator Command Prompt on each PC:

```bat
reg add "HKLM\SOFTWARE\Policies\Google\Chrome" /v DeveloperToolsAvailability /t REG_DWORD /d 2 /f
reg add "HKLM\SOFTWARE\Policies\Microsoft\Edge" /v DeveloperToolsAvailability /t REG_DWORD /d 2 /f
```

Restart the browser and check `chrome://policy` (or `edge://policy`). To undo after the event:

```bat
reg delete "HKLM\SOFTWARE\Policies\Google\Chrome" /v DeveloperToolsAvailability /f
reg delete "HKLM\SOFTWARE\Policies\Microsoft\Edge" /v DeveloperToolsAvailability /f
```

For even less fiddling, start the game in kiosk mode: `chrome.exe --kiosk https://<your-site>/`.

Also note: the Firebase database is in test mode, so anyone who knows its URL can write to it directly. For a one-night event this is usually acceptable; locking it down needs Firebase Authentication and security rules.

---

## 📱 How the QR code works

- The QR code is generated **automatically** in the browser by [qrcodejs](https://github.com/davidshimjs/qrcodejs) (loaded from cdnjs).
- It points to the same site: `https://<your-site>/#hidden-server/<token>`. The token holds the Stage 4 fragment **and the team name**, so the phone shows "👥 Холбогдсон баг: …".
- The phone page shows a short "connecting" bar, a one-tap security question, then the fragment. No app is needed: iPhone and Android cameras both open the link.
- The QR uses low error-correction (large dots) and turns off the scanline effect on that screen, so it scans fast from a monitor.
- If the auto-detected address is wrong (for example on `localhost`, which phones can't reach), set **QR BASE URL** in the organizer settings, e.g. `https://username.github.io/hack-the-halloween/`. The **📱 QR CODE** section shows the exact target and a test button.
- Opened as a local file (`index.html` double-clicked), the QR only holds plain text, because a phone can't open a file on your PC. Host the game for the event.

---

## Hosting on GitHub Pages (free, about 5 minutes)

1. Create a GitHub account (if needed), then click **New repository**. Name it `hack-the-halloween` and set it to **Public**.
2. Click **Add file → Upload files** and drag in `index.html`, `404.html`, `style.css`, `script.js`, `README.md` and the `assets` folder. Click **Commit changes**.
3. Go to **Settings → Pages**. Under **Build and deployment**, choose **Source: Deploy from a branch**, **Branch: `main`**, folder **`/ (root)`**, then click **Save**.
4. After 1–2 minutes the game is live at `https://<your-username>.github.io/hack-the-halloween/`.

To update the game later, edit the files and upload or push again, then refresh the PCs (Ctrl + F5).

---

## Running the event (30-PC lab)

### Before the event

- [ ] Host the game and test one full round with 2–3 PCs: START from `#admin`, play to the end, check the leaderboard, RESET ALL.
- [ ] Scan the Stage 4 QR with an iPhone and an Android phone.
- [ ] Change the PIN and, ideally, the answers in ⚙ SETTINGS (then press SAVE once, so Firebase only holds encoded data).
- [ ] Turn off DevTools on the lab PCs (see 🛡 Anti-cheat).
- [ ] Check that the lab network allows `*.github.io`, `cdnjs.cloudflare.com` and `*.firebasedatabase.app`, and that students' phones have internet.
- [ ] On every PC, open the game URL in **full screen (F11)** at 100% zoom, sound low (or 🔇).
- [ ] Projector: open `…/#leaderboard`. Organizer: open `…/#admin` on your own device.
- [ ] Clear test results: `#admin` → 🗑 CLEAR ALL.

### Suggested flow (≈ 20 minutes per round)

| Time | What happens |
|---|---|
| 0:00 | Teams type a team name and read the briefing. Screens show STARTING SOON. |
| 0:02 | Organizer presses **▶ START IN 30s**. Every PC counts down and starts together. |
| 0:02–0:17 | Teams play. Organizers watch 📡 LIVE TEAMS and help with technical problems only (not answers 😉). Use ⏸ PAUSE ALL for a fire alarm or a network problem. |
| as teams finish | Results appear on the projector leaderboard automatically. |
| 0:17 | Time's up 💀 for remaining teams. Announce the winners. |
| next round | `#admin` → **🔄 RESET ALL PCs**. |

### Troubleshooting

| Problem | Fix |
|---|---|
| A PC stays on STARTING SOON after START | That PC has no connection to Firebase. Check its internet and refresh it. |
| Phone can't open the QR link | Check that the game is hosted (not opened as a file) and that the phone has internet. Check the target in `#admin` → 📱 QR CODE. |
| QR doesn't scan | Move closer, raise screen brightness, try another phone. Hint 2 explains this too. |
| "QR код ачаалагдсангүй" | The PC can't reach cdnjs. Check the network. |
| Team refreshed the page | No problem: progress and the timer continue where they were. |
| One team needs to start over | On that PC's win/TIME'S UP screen: ↺ ДАХИН ЭХЛЭХ. |

---

## Safety and scope

- No real hacking, attacks, scanning of real IP addresses, or connection to EmpaSoft systems.
- Every "server", "password" and "virus" is fictional and lives only in this webpage.
- QR codes point only to this game's own page.
- Stored data: each PC's progress in its browser (`localStorage`); team names, results, live status and organizer settings in the Firebase database.

Have a spooky event! 🎃👻💀
