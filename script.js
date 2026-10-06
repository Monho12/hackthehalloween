"use strict";
// Бүх код IIFE дотор: DevTools console-оос CONFIG, state-д шууд хандах боломжгүй
(() => {
  /* ================================================================
   🎃 HACK THE HALLOWEEN — EMPASOFT Halloween cyber escape game
   ----------------------------------------------------------------
   ЗӨВХӨН ЗОХИОМОЛ ТОГЛООМ. Бодит систем, сүлжээ, IP хаяг, нууц үгтэй
   ямар ч холбоогүй.
   • PC бүр өөрийн тоглоомыг ажиллуулна (явц нь localStorage-д).
   • Онооны самбар, Organizer-ийн удирдлага, тохиргоо Firebase Realtime
     Database-ээр бүх PC-д хуваалцагдана.
   • Organizer: <линк>#admin   ·   Проектор: <линк>#leaderboard
   ================================================================ */

  /* ================================================================
   0. 🛡 F12-ЭЭС ХАМГААЛАХ
   • Хариултууд кодонд, Firebase-д, localStorage-д ХААНА Ч байхгүй.
     Шат бүрийн түлхүүрийн хэсгийг тухайн шатны ЗӨВ ХАРИУЛТААР шифрлэнэ
     (PBKDF2 → AES-GCM). Зөв хариулт бичвэл л тайлагдана — JS-ийг уншиж,
     debug хийгээд ч хариулт, түлхүүрийн хэсэг, мастер нууц үг олдохгүй.
   • Organizer-ийн тохиргоо (хариултын түлхүүр) ORGANIZER PASSWORD-оор
     шифрлэгдсэн "vault"-д байна.
   • Тоглоомын явцыг (localStorage) гараар засахаас obfuscate() сэргийлнэ.
   ================================================================ */
  // === SEAL BEGIN === (build-defaults.mjs энэ хэсгийг ашиглан анхны тохиргоог шифрлэнэ)
  const ANSWER_ITER = 150000; // буруу хариулт бүрийг шалгахад ~0.1 сек зарцуулна
  const VAULT_ITER = 600000;
  // Мастер нууц үгийн 6 хэсгийг шат бүрт ямар (холилдсон) дарааллаар өгөх
  // (мастер үгийг 6 хэсэгт хуваагаад: Шат1 = 6-р хэсэг, Шат2 = 4-р хэсэг, …)
  const FRAGMENT_ORDER = [5, 3, 2, 0, 4, 1];
  const TOTAL_STAGES = 6;
  // 📱 Утсан дээрх аюулгүй байдлын асуулт. Зөв сонголт кодонд байхгүй —
  // зөв сонголтоор л 4-р шатны хэсэг тайлагдана (qrLock).
  const MOBILE_QUIZ = {
    question: "SECURITY CHECK: Аль нууц үг нь хамгийн ХҮЧТЭЙ вэ?",
    options: ["password123", "ghost2026", "Pumpk1n!-Night_#31"],
  };
  const b64e = (u8) => {
    let s = "";
    for (const b of u8) s += String.fromCharCode(b);
    return btoa(s);
  };
  const b64d = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
  const randSalt = () => b64e(crypto.getRandomValues(new Uint8Array(16)));
  // Хариултыг харьцуулахад бэлтгэнэ: том үсэг, хоосон зай/цэг таслал хасна (":" үлдэнэ)
  const norm = (s) =>
    String(s ?? "")
      .normalize("NFKC")
      .toUpperCase()
      .replace(/[\s\-_.,'"!?`]/g, "");
  const lettersOnly = (s) => norm(s).replace(/[^A-Z]/g, "");

  async function deriveKey(secret, salt, iterations) {
    const base = await crypto.subtle.importKey(
      "raw",
      new TextEncoder().encode(secret),
      "PBKDF2",
      false,
      ["deriveKey"],
    );
    return crypto.subtle.deriveKey(
      { name: "PBKDF2", hash: "SHA-256", salt: b64d(salt), iterations },
      base,
      { name: "AES-GCM", length: 256 },
      false,
      ["encrypt", "decrypt"],
    );
  }
  async function boxSeal(key, value) {
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const ct = await crypto.subtle.encrypt(
      { name: "AES-GCM", iv },
      key,
      new TextEncoder().encode(JSON.stringify(value)),
    );
    return { iv: b64e(iv), ct: b64e(new Uint8Array(ct)) };
  }
  // Буруу түлхүүр бол null (AES-GCM-ийн шалгах tag таарахгүй)
  async function boxOpen(key, box) {
    try {
      const pt = await crypto.subtle.decrypt(
        { name: "AES-GCM", iv: b64d(box.iv) },
        key,
        b64d(box.ct),
      );
      return JSON.parse(new TextDecoder().decode(pt));
    } catch (e) {
      return null;
    }
  }
  // 🔐 "Цоож": зөвшөөрөгдсөн хариулт бүрээр payload-ыг тусад нь шифрлэнэ
  async function makeLock(answers, payload) {
    const salt = randSalt();
    const boxes = [];
    for (const a of new Set(answers.map(norm).filter(Boolean)))
      boxes.push(await boxSeal(await deriveKey(a, salt, ANSWER_ITER), payload));
    // Хэдэн хариулт зөвшөөрөгдсөн нь дарааллаас мэдэгдэхгүйн тулд холино
    for (let i = boxes.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [boxes[i], boxes[j]] = [boxes[j], boxes[i]];
    }
    return { salt, boxes };
  }
  // Зөв хариулт бол payload, буруу бол null
  async function openLock(lock, answer) {
    const a = norm(answer);
    if (!lock || !a) return null;
    const key = await deriveKey(a, lock.salt, ANSWER_ITER);
    for (const box of lock.boxes) {
      const v = await boxOpen(key, box);
      if (v != null) return v;
    }
    return null;
  }
  async function openVault(vault, password) {
    if (!vault || !password) return null;
    return boxOpen(
      await deriveKey(password, vault.salt, VAULT_ITER),
      vault.box,
    );
  }

  function caesar(word, shift) {
    return word.replace(/[A-Z]/g, (ch) =>
      String.fromCharCode(((ch.charCodeAt(0) - 65 + shift) % 26) + 65),
    );
  }
  const shiftOf = (p) => (((parseInt(p.stage2Shift, 10) || 3) % 26) + 26) % 26;
  // Мастер нууц үгийг 6 хэсэгт хуваана
  function masterChunks(master) {
    const m = norm(master);
    const base = Math.floor(m.length / TOTAL_STAGES),
      extra = m.length % TOTAL_STAGES;
    const out = [];
    let i = 0;
    for (let k = 0; k < TOTAL_STAGES; k++) {
      const len = base + (k < extra ? 1 : 0);
      out.push(m.slice(i, i + len));
      i += len;
    }
    return out;
  }
  // Шат бүрт олгох түлхүүрийн хэсэг
  const plainFragments = (p) =>
    FRAGMENT_ORDER.map((idx) => masterChunks(p.masterPassword)[idx]);
  function stage5Password(p) {
    return (
      String(p.stage5Password || "").trim() ||
      norm(p.stage4Fragment) + lettersOnly(p.stage2Word).length
    );
  }
  // Шат бүрийн зөвшөөрөгдсөн хариултууд (зөвхөн organizer-ийн нээлттэй тохиргооноос)
  const plainAnswers = (p) => [
    [lettersOnly(p.stage1Word)],
    [lettersOnly(p.stage2Word)],
    [lettersOnly(p.stage3Word)],
    [norm(p.stage4Fragment)],
    [stage5Password(p)],
    p.stage6Answers,
  ];

  // Organizer-ийн нээлттэй тохиргоо → тоглогчдод очих шифрлэгдсэн тохиргоо.
  // Тааврын агуулгыг (binary, шифр, өгүүлбэр) энд урьдчилан үүсгэдэг тул
  // хариултын үг өөрөө тоглогчийн PC-д хэзээ ч очихгүй.
  async function sealConfig(p, password, acrosticLines) {
    const shift = shiftOf(p);
    const frags = plainFragments(p);
    const answers = plainAnswers(p);
    const stages = [];
    for (let k = 0; k < TOTAL_STAGES; k++)
      stages.push(await makeLock(answers[k], { f: frags[k] }));
    const vaultSalt = randSalt();
    return {
      v: 2,
      hintPenalties: p.hintPenalties,
      hintPenaltyEnabled: p.hintPenaltyEnabled,
      qrBaseUrl: p.qrBaseUrl || "",
      finalHint: p.finalHint,
      stage1Bin: [...lettersOnly(p.stage1Word)].map((ch) =>
        ch.charCodeAt(0).toString(2).padStart(8, "0"),
      ),
      stage2Cipher: caesar(lettersOnly(p.stage2Word), shift),
      stage2Shift: shift,
      stage3Lines: acrosticLines(lettersOnly(p.stage3Word)),
      stage5Note: p.stage5Note || "",
      stage6Code: p.stage6Code,
      // Утсан дээрх асуултын зөв сонголтоор 4-р шатны хэсгийг шифрлэнэ
      qrLock: await makeLock([MOBILE_QUIZ.options[p.mobileQuizCorrect]], {
        f: norm(p.stage4Fragment),
      }),
      stages,
      final: await makeLock([p.masterPassword], { ok: 1 }),
      vault: {
        salt: vaultSalt,
        box: await boxSeal(await deriveKey(password, vaultSalt, VAULT_ITER), p),
      },
    };
  }
  // === SEAL END ===

  const OBF_KEY = "hth31-empasoft-night-of-the-bugs";
  function obfuscate(obj) {
    const bytes = new TextEncoder().encode(JSON.stringify(obj));
    let sum = 7;
    let bin = "";
    bytes.forEach((b, i) => {
      sum = (Math.imul(sum, 31) + b) >>> 0;
      bin += String.fromCharCode(
        b ^ OBF_KEY.charCodeAt(i % OBF_KEY.length) ^ ((i * 73) & 255),
      );
    });
    return "obf1." + sum.toString(36) + "." + btoa(bin);
  }
  // Буруу/гараар өөрчилсөн утга бол null (checksum таарахгүй)
  function deobfuscate(str) {
    try {
      const [tag, sum, b64] = String(str).split(".");
      if (tag !== "obf1") return null;
      const bin = atob(b64);
      const bytes = new Uint8Array(bin.length);
      let check = 7;
      for (let i = 0; i < bin.length; i++) {
        bytes[i] =
          bin.charCodeAt(i) ^
          OBF_KEY.charCodeAt(i % OBF_KEY.length) ^
          ((i * 73) & 255);
        check = (Math.imul(check, 31) + bytes[i]) >>> 0;
      }
      if (check.toString(36) !== sum) return null;
      return JSON.parse(new TextDecoder().decode(bytes));
    } catch (e) {
      return null;
    }
  }

  // 🔒 Анхны тохиргоо — ШИФРЛЭГДСЭН (хариулт агуулаагүй). build-defaults.mjs үүсгэнэ.
  // Organizer password-оор #admin-д нэвтэрч ⚙ SETTINGS-ээс өөрчилнө.
  // prettier-ignore
  const SEALED_DEFAULTS = /*SEALED*/{"v":2,"hintPenalties":[30,45,60,90,120],"hintPenaltyEnabled":true,"qrBaseUrl":"","finalHint":"IT туслах ажилтан хамгийн түрүүнд юу гэж асуудаг вэ? “Унтраагаад дахин асаагаад үзсэн үү?” — үүнийг англиар НЭГ үгээр хэлдэг.","stage1Bin":["01000011","01000001","01001110","01000100","01011001"],"stage2Cipher":"KDOORZHHQ","stage2Shift":3,"stage3Lines":["Every file now ends with the same word: boo.","Monitors flicker orange whenever the clock strikes twelve.","Pale light pours out of the locked computer lab.","Abandoned terminals blink with messages nobody typed.","Shadows crawl across the server room at midnight.","Old hard drives spin up all on their own.","Fog crawls slowly under the classroom door.","The clock in the hallway has stopped at 3:13."],"stage5Note":"","stage6Code":"code = \"GHOST\"\n\nif code[3] == \"O\":\n    print(\"ACCESS GRANTED\")","qrLock":{"salt":"p9QtMjIbS+Y3drCoNVTqdw==","boxes":[{"iv":"GXFCp/o8L7ddwe3v","ct":"RIKlRzQtxmrIYkSlpqaayOeBrImxtCQvtx7kah8="}]},"stages":[{"salt":"ouYlFBb2Gbgw0tMMXPeccw==","boxes":[{"iv":"A5zxIhlluj25Ga/c","ct":"f8T/9YIikgI/czzt35Vjrxp96appjMSYzg=="}]},{"salt":"fa6ZSeJjOHAZ2CjzDpRAlQ==","boxes":[{"iv":"7Oo4C3ZHnPUJCP+y","ct":"cQtTtO6lVV1eOHivXEdz8rrKFtnYdRE95A=="}]},{"salt":"5C4Y/cmfA+hyUINRvvNqhQ==","boxes":[{"iv":"STGEj6ZD6KPGTmP+","ct":"UzdoSYbqiFfKO8CmRWd7dmfEL23MDC+E/A=="}]},{"salt":"VXOY+qKJulBK31LVuSPTng==","boxes":[{"iv":"F6Apvrjjua08hBYq","ct":"nH0Jn2mHzQvR+QJID0IEjP79b+SmP+l8WQ=="}]},{"salt":"pHyEeSZ9Vb+4+EV5YYeNpQ==","boxes":[{"iv":"rc2oBC6Jl/NMMe5H","ct":"M8452AWANtFkDYEVSIJ9XRqevPfu0ZioKw=="}]},{"salt":"eLUGWKqVWjN/XDieXzJkYQ==","boxes":[{"iv":"481CxiI8zA+xe9dr","ct":"XpUFHo+ogV1si0ttI3djTdpUmHF4geTDFA=="},{"iv":"VY5fgkEQ0C0rjcor","ct":"6JaJJUCASzM2/wt+SqRDkzNU1micRp7QzA=="},{"iv":"usoOKC9af6d2s2yP","ct":"w2VKNLa4RKd0MT7ErxQX6i0vSj4gPAw9eQ=="},{"iv":"evBxEntJRwcRauwl","ct":"AS5JbxniAGATrE0rB3XOL0qNt81ABNkGsA=="},{"iv":"C10bpo74lOxKdn+9","ct":"ZF4fWwaXkGZCRBRJwAO8iJCOCwzsY0hsog=="},{"iv":"8mnDhk/9kIm0n6Nk","ct":"Wjjz/oYNQ9/YS+tHfZ3ghx/eUrq7UR0+tQ=="}]}],"final":{"salt":"St+DOOFvlFe68CCpe7wpYw==","boxes":[{"iv":"qgXer1W0wyclDUmk","ct":"wvJsQAOZYzfUTJVZKUMgcj7kTbxcIuJT"}]},"vault":{"salt":"D5ZmaNKvI68KSPnxOzusGw==","box":{"iv":"42w/+JwPCE8TpMJ5","ct":"5C+05knA4KQurzGNYMg+1MDP9zk8ytFvEedKFsZEnnoOQk1TSaFbah9CX8A+MOuY5iOloUag8g9tFOokDEH3G/VkH3nc0kyxNF/IPnJOl/foOuXPBYz+XpYVp9U89UDWwWZ1NhGGGjsKjMh+GKkm5QRqyldA/lCyusku+b0VBGaAMJS+pwaPAuqd0x/frZtCtZnJrlV8nfPAtqQ8v30wzJqyMrIPjVsRFsAnlbqU4680v0nrN1CpvFGxFXecm7B1odiHWoS2eJ3bvC+IQgmGREN0s0JisZI/PuwPrHCpM/87YGSWuoICFg14jn+sXv6SHXYuEPmu+M8pSu7SDqjRWrJ7PFZCdQsv1gwXSyT4XBUSEv0sbhKeOcJAiBhwygAa5uXFysCd/CW0JDGgzOp/yJsZx51fjQ5hZhc5N2DH1vAxfx2es6a4gQhkS1R2c2Zf0o0QMBjpo4NQcvkWla107j1TH9ScUpDoU60N4RqiYK55HUl5jOB9Xa0O1pCRL49NQaCmkKZtF3v517CCKEKqO7RLC5X7+LIU2+7rDONYeh/U9mWiF7qwVk8b/GlLPjlpmgFlqmKOyxGCcXO6YxiHNk6TCQH/R3BBPLPCqfj+/9DmYsYHG9rSjlOioh73GNmYicupeR1yQPC1dOSuo964empU/Xtppw0T3V5UKn2AX0BnESpueqG058bEA3ibwdbaC/CXzkNV3xQ6uh0aR+3P1SxBcFFNr2bNs2HzYnyjOnN1YnYjoN4l/AQpY4B7gt7Jmb/CwruPKknSH1Din/solWBAXDC9IdOri6seXVMzTpSspisdxc+2Y3nQvPypuHf8LdwIPfh3ohgwOpk8QWJTM0a8U27/QenJGOmogTCO7CNm5jy7mz70ptw5UsCv6CoRb/eAu6J0L/NLyLnubAkfygq8B/VTwYyxm7ubZHvqrgBMr5FtE+9tTQ=="}}}/*END*/

  /* ================================================================
   1. ТОХИРГОО — анхны (default) утгууд.
   #admin хуудсанд SAVE SETTINGS дарвал эдгээрийг БҮХ PC дээр шууд дарна.
   ================================================================ */
  const DEFAULT_CONFIG = {
    // ⏱ Нийт хугацаа (минут). #admin → TOTAL TIME-аар бүх PC-д өөрчилнө.
    timerMinutes: 15,

    // 💡 Сануулгын торгууль (секунд) — ТОГЛООМ ДАХЬ НИЙТ hint-ийн тоогоор өснө.
    // 1-р hint +30с, 2-р +45с, 3-р +60с, 4-р +90с, 5-р болон түүнээс хойш +120с.
    // Олон hint авсан баг финалын цаг нь их нэмэгдэж, онооны самбарт доогуур орно.
    hintPenaltyEnabled: true,
    hintPenalties: [30, 45, 60, 90, 120],

    // 📱 QR кодын үндсэн хаяг. Хоосон бол одоогийн хуудасны хаягийг автоматаар авна.
    // Жишээ: 'https://username.github.io/hack-the-halloween/'
    qrBaseUrl: "",

    // 🌐 Firebase Realtime Database-ийн хаяг (онооны самбар, удирдлага, тохиргоо)
    firebaseUrl:
      "https://hackthehalloween-default-rtdb.asia-southeast1.firebasedatabase.app",

    // 🔒 Таавар, шифрлэгдсэн түлхүүрийн хэсгүүд, organizer vault
    ...SEALED_DEFAULTS,
  };

  const REMOTE = String(DEFAULT_CONFIG.firebaseUrl).replace(/\/+$/, "");

  /* ================================================================
   2. ХАДГАЛАХ (localStorage) — алдаа гарвал санах ойд үргэлжилнэ
   ================================================================ */
  const KEYS = {
    remoteConfig: "hth_rconfig_v1", // Organizer-ийн тохиргооны кэш (Firebase /config)
    state: "hth_state_v1",
    board: "hth_leaderboard_v1",
    sound: "hth_sound_v1",
    reset: "hth_reset_v1", // сүүлд хэрэгжүүлсэн RESET ALL-ийн мөч (resetAt)
    pc: "hth_pc_v1", // энэ PC-ийн id (багуудын шууд төлөвт)
  };
  const memoryStore = {};
  const store = {
    get(key, fallback) {
      try {
        const raw = localStorage.getItem(key);
        return raw == null ? fallback : JSON.parse(raw);
      } catch (e) {
        return key in memoryStore ? memoryStore[key] : fallback;
      }
    },
    set(key, value) {
      memoryStore[key] = value;
      try {
        localStorage.setItem(key, JSON.stringify(value));
      } catch (e) {
        /* хувийн цонх гэх мэт */
      }
    },
    // 🔒 Кодлосон утга. Гараар өөрчилсөн (checksum таарахгүй) бол устгаад fallback.
    getSecret(key, fallback) {
      const raw = this.get(key, null);
      const v = raw == null ? null : deobfuscate(raw);
      if (raw != null && v == null) this.del(key);
      return v == null ? fallback : v;
    },
    setSecret(key, value) {
      this.set(key, obfuscate(value));
    },
    del(key) {
      delete memoryStore[key];
      try {
        localStorage.removeItem(key);
      } catch (e) {
        /* ignore */
      }
    },
  };

  /* ================================================================
   3. ТУСЛАХ ФУНКЦУУД
   ================================================================ */
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
  const esc = (s) =>
    String(s ?? "").replace(
      /[&<>"']/g,
      (c) =>
        ({
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          '"': "&quot;",
          "'": "&#39;",
        })[c],
    );
  const pad2 = (n) => String(n).padStart(2, "0");
  // Секундийг MM:SS болгоно
  const fmt = (sec) => {
    sec = Math.max(0, Math.floor(sec));
    return pad2(Math.floor(sec / 60)) + ":" + pad2(sec % 60);
  };
  const isTouch = () => window.matchMedia("(pointer: coarse)").matches;
  const shuffle = (arr) => {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  };

  // Одоогийн цаг (ms) — Firebase серверийн цагтай тааруулсан (clockOffset-ийг syncClock тооцно)
  let clockOffset = 0;
  const now = () => Date.now() + clockOffset;

  // UTF-8 текстийг URL-д тохирох base64 болгох / буцаах
  function encodeToken(obj) {
    const b64 = btoa(unescape(encodeURIComponent(JSON.stringify(obj))));
    return b64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  }
  function decodeToken(token) {
    try {
      let b64 = token.replace(/-/g, "+").replace(/_/g, "/");
      while (b64.length % 4) b64 += "=";
      return JSON.parse(decodeURIComponent(escape(atob(b64))));
    } catch (e) {
      return null;
    }
  }

  /* ================================================================
   4. ТОХИРГОО ба ТӨЛӨВ (state)
   ================================================================ */
  // DEFAULT_CONFIG ← Organizer-ийн тохиргоо (Firebase /config, бүх PC-д ижил)
  let CONFIG = loadConfig();
  function loadConfig() {
    const remote = store.getSecret(KEYS.remoteConfig, {});
    // Хуучин (хариулт агуулсан) хэлбэрийн тохиргоог хэрэглэхгүй
    return Object.assign({}, DEFAULT_CONFIG, remote.v === 2 ? remote : {});
  }

  function freshState() {
    return {
      status: "start", // start | briefing | playing | won | lost
      createdAt: now(), // энэ тоглоом үүссэн мөч — RESET ALL-оос өмнөх эсэхийг шалгана
      team: "",
      stage: 0, // 0–5 = шатууд, 6 = FINAL
      durationSec: CONFIG.timerMinutes * 60,
      startedAt: null,
      penaltySec: 0, // hint-ийн торгууль (сек)
      hints: {}, // { шатны индекс: ашигласан тоо }
      frags: [], // зөв хариултаар тайлсан түлхүүрийн хэсгүүд
      finishedAt: null,
      finalTime: null,
      recorded: false,
      boardId: null, // онооны самбар дахь энэ багийн бичлэгийн id
      frozenElapsed: null, // дууссан үеийн нийт хугацаа (сек)
    };
  }
  // createdAt байхгүй хуучин төлөвийг "маш хуучин" (0) гэж үзнэ
  let state = Object.assign(
    freshState(),
    { createdAt: 0 },
    store.getSecret(KEYS.state, {}),
  );
  // 🔒 Кодлож хадгална — Application tab-д stage-ээ гараар өөрчилж болохгүй
  const saveState = () => store.setSecret(KEYS.state, state);

  /* ⏱ ЦАГИЙН ТООЦОО — энгийнээр:
     НИЙТ ХУГАЦАА   = ТОГЛОСОН ХУГАЦАА + HINT-ИЙН ТОРГУУЛЬ
     ҮЛДСЭН ХУГАЦАА = НИЙТ ХУГАЦААНЫ ЛИМИТ − НИЙТ ХУГАЦАА   (0 болбол TIME'S UP)
   • ТОГЛОСОН ХУГАЦАА = одоо − эхэлсэн мөч − ⏸ PAUSE ALL-д зогссон хугацаа
     ± Organizer-ийн ±1 MIN ALL. Эхэлсэн мөчийг хадгалдаг тул refresh хийсэн ч зөв.
   • HINT-ИЙН ТОРГУУЛЬ: hint бүр цаг нэмнэ (hintPenalties).
   • Онооны самбарт НИЙТ ХУГАЦАА-гаар эрэмбэлнэ — бага нь түрүүлнэ.
   • PC-ийн цаг хоорондоо зөрдөг тул Firebase серверийн цагтай тааруулна (clockOffset). */
  // Firebase /control: { startAt, durationSec, pausedAt, pausedTotal, adjustSec, resetAt }
  let ctl = {};
  // Энэ PC-ийн тоглоом одоогийн нийтийн тойрогт (round) хамаарах уу?
  const inRound = () =>
    !!ctl.startAt && !!state.startedAt && state.startedAt === ctl.startAt;
  const isPaused = () => inRound() && !!ctl.pausedAt;
  // Нийт хугацааны лимит (сек): Organizer-ийн TOTAL TIME, эсвэл default
  const gameDuration = () => Number(ctl.durationSec) || state.durationSec;
  // ⏸ PAUSE ALL-д зогссон хугацаа (ms) — тоглоом эхэлснээс хойших хэсгийг л тооцно
  function globalPauseMs(ref) {
    if (!inRound()) return 0;
    let ms = Number(ctl.pausedTotal) || 0;
    if (ctl.pausedAt)
      ms += Math.max(0, ref - Math.max(ctl.pausedAt, ctl.startAt));
    return ms;
  }
  function elapsedSec() {
    if (!state.startedAt) return Math.max(0, state.penaltySec);
    // Дууссан тоглоомын цагийг царцаана (дараа нь pause/±1 MIN нөлөөлөхгүй)
    if (state.finishedAt && state.frozenElapsed != null)
      return state.frozenElapsed;
    const ref = state.finishedAt || now();
    const adjust = inRound() ? Number(ctl.adjustSec) || 0 : 0;
    return Math.max(
      0,
      (ref - state.startedAt - globalPauseMs(ref)) / 1000 +
        state.penaltySec +
        adjust,
    );
  }
  // Ялалтын дэлгэцэд: тоглосон хугацаа + hint-ийн торгууль = нийт хугацаа
  function timeBreakdown() {
    const total = Math.round(state.finalTime ?? elapsedSec());
    const penalty = Math.min(total, Math.round(state.penaltySec || 0));
    return { played: total - penalty, penalty, total };
  }
  function remainingSec() {
    return Math.max(0, gameDuration() - elapsedSec());
  }
  function hintsUsedTotal() {
    return Object.values(state.hints).reduce((a, b) => a + b, 0);
  }

  /* ================================================================
   5. ТААВАР ҮҮСГЭГЧИД
   ================================================================ */
  // === ACROSTIC BEGIN ===
  // Нуугдсан мессежийн өгүүлбэрүүд — үсэг бүрт 2 хувилбар (давтагдсан үсэгт 2 дахь нь)
  const ACROSTIC_BANK = {
    A: [
      "Abandoned terminals blink with messages nobody typed.",
      "All the hallway lights flicker at exactly midnight.",
    ],
    B: [
      "Bats circle the server room window every night.",
      "Behind the firewall, something is breathing.",
    ],
    C: [
      "Cold fans hum like whispers from another world.",
      "Candles melt slowly beside the broken keyboard.",
    ],
    D: [
      "Dark shapes move across the security cameras.",
      "Doors in the IT building open by themselves.",
    ],
    E: [
      "Every file now ends with the same word: boo.",
      "Echoes of laughter come from the empty lab.",
    ],
    F: [
      "Fog crawls slowly under the classroom door.",
      "Footsteps follow you down the empty corridor.",
    ],
    G: [
      "Ghostly cursors move on screens nobody is using.",
      "Green code drips down the cracked monitor.",
    ],
    H: [
      "Hollow pumpkins grin from every desk in the lab.",
      "Heavy rain hits the windows of the data center.",
    ],
    I: [
      "Inside the mainframe, a strange voice keeps counting.",
      "Icy air leaks from the cooling vents.",
    ],
    J: [
      "Jack-o'-lanterns glow in the dark corridor.",
      "Just before midnight, the printer starts printing by itself.",
    ],
    K: [
      "Keyboards type strange words when no one is touching them.",
      "Knocking sounds come from inside the server rack.",
    ],
    L: [
      "Lost passwords drift through the network like spirits.",
      "Lanterns swing slowly although there is no wind.",
    ],
    M: [
      "Monitors flicker orange whenever the clock strikes twelve.",
      "Mysterious emails arrive from an address that does not exist.",
    ],
    N: [
      "Nobody remembers who installed the strange program.",
      "Night falls, and the Wi-Fi signal starts to whisper.",
    ],
    O: [
      "Old hard drives spin up all on their own.",
      "Orange eyes glow behind the cracked webcam.",
    ],
    P: [
      "Pale light pours out of the locked computer lab.",
      "Pumpkins rot slowly next to the coffee machine.",
    ],
    Q: [
      "Quiet footsteps echo behind the last row of desks.",
      "Questions appear on the screen, written in red.",
    ],
    R: [
      "Rats hide among the tangled network cables.",
      "Red warning lights pulse like a heartbeat.",
    ],
    S: [
      "Shadows crawl across the server room at midnight.",
      "Spiders spin webs across the old router.",
    ],
    T: [
      "The clock in the hallway has stopped at 3:13.",
      "Thunder shakes the building and every screen goes black.",
    ],
    U: [
      "Unknown users log in from the graveyard network.",
      "Under the desk, a cable moves like a snake.",
    ],
    V: [
      "Voices crackle through the broken speakers.",
      "Vampire bats hang from the ceiling of the lecture hall.",
    ],
    W: [
      "Webcams switch on by themselves in the dark.",
      "Whispers fill the room whenever the fans slow down.",
    ],
    X: [
      "X marks the desk where the last admin vanished.",
      "Xenon lamps buzz above the empty hallway.",
    ],
    Y: [
      "You can hear typing, but the room is empty.",
      "Yellow eyes watch from the top of the bookshelf.",
    ],
    Z: [
      "Zombie processes refuse to die in the task manager.",
      "Zero users are online, yet someone keeps typing.",
    ],
  };
  function acrosticLines(word) {
    const used = {};
    return [...word].map((ch) => {
      const list = ACROSTIC_BANK[ch] || ["???"];
      const n = (used[ch] = (used[ch] || 0) + 1);
      return list[(n - 1) % list.length];
    });
  }
  // === ACROSTIC END ===

  function getStage5Note() {
    if (String(CONFIG.stage5Note || "").trim()) return CONFIG.stage5Note;
    return (
      "ӨӨРТӨӨ САНУУЛАХ НЬ: (БИТГИЙ МАРТААРАЙ!!!)\n" +
      "Нууц үгээ байнга мартаад байдаг болохоор амархан санахаар нэгийг зохиочихлоо\n" +
      "Нууц үг:\n\n" +
      "   [QR-аас олсон үг] +\n" +
      "   [1-р даалгаврын нууц үг хэдэн үсэгтэй вэ?]\n\n" +
      "Үүнийг ХЭН Ч ХЭЗЭЭ Ч тааж чадахгүй.\n— admin"
    );
  }

  // Энэ баг зөв хариултаар тайлсан түлхүүрийн хэсэг
  const fragmentFor = (stageIdx) => (state.frags || [])[stageIdx] || "?";

  // Python кодыг энгийн өнгөөр будах
  function highlightPython(code) {
    const KW =
      /\b(if|else|elif|for|while|in|def|return|import|from|and|or|not|True|False|None)\b/g;
    return code
      .split("\n")
      .map((line, i) => {
        const parts = line.split(/("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*')/g);
        const html = parts
          .map((p, j) =>
            j % 2 === 1
              ? `<span class="tok-str">${esc(p)}</span>`
              : esc(p)
                  .replace(KW, '<span class="tok-kw">$1</span>')
                  .replace(
                    /\b(print|len|input)\b/g,
                    '<span class="tok-fn">$1</span>',
                  ),
          )
          .join("");
        return `<div class="ln"><span class="num">${i + 1}</span><span class="src">${html || " "}</span></div>`;
      })
      .join("");
  }

  // QR код руу оруулах хаяг/текст. Хэсэг нь шифрлэгдсэн (q) — утсан дээрх
  // асуултад зөв хариулж байж л тайлагдана.
  function qrTarget() {
    const token = encodeToken({ q: CONFIG.qrLock, t: state.team || "" });
    let base = String(CONFIG.qrBaseUrl || "").trim();
    if (!base && /^https?:$/.test(location.protocol))
      base = location.href.split("#")[0];
    if (base)
      return {
        mode: "url",
        value: base.split("#")[0] + "#hidden-server/" + token,
      };
    // file:// үед утас PC-ийн файлыг нээж чадахгүй → текст QR (утасны камер текстийг шууд харуулна)
    return {
      mode: "text",
      value:
        "HACK THE HALLOWEEN // HIDDEN SERVER FOUND\nThe hidden server only opens when the game is hosted online (https). Ask an organizer for help.",
    };
  }

  /* ================================================================
   6. ШАТУУДЫН ТОДОРХОЙЛОЛТ
   ================================================================ */
  // Таавар бүрийн агуулга шифрлэгдсэн тохиргооноос (хариултын үг кодонд байхгүй)
  function getStages() {
    const bytes = CONFIG.stage1Bin || [];
    const shift = shiftOf(CONFIG);
    const cipher = CONFIG.stage2Cipher || "";
    const lines = CONFIG.stage3Lines || [];
    // 3-р шат: мөрүүдийн эхний үсэг = нууц үг. Харагдах мөрүүдийг холиод
    // (acrostic ажиллахгүй), жинхэнэ үсгүүдийг мөр бүрийн төгсгөлд бараг
    // үл харагдах өнгөөр дарааллаар нь нууна (Ctrl+A / F12-аар л харагдана).
    const hiddenLetters = lines.map((l) => (l.trim()[0] || "").toUpperCase());
    const shuffledLines = lines
      .map((l, k) => [l, (k * 5 + 3) % 7 + k / 100])
      .sort((a, b) => a[1] - b[1])
      .map(([l]) => l);
    const logLevels = ["INFO", "WARN", "ERROR", "INFO", "DEBUG", "WARN", "INFO", "ERROR"];
    const lock = (k) => (CONFIG.stages || [])[k];
    const abc = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");

    return [
      /* ---------- ШАТ 1: BINARY ---------- */
      {
        key: "binary",
        title: "BINARY CODE",
        mission:
          "Компьютерийн хэлээр бичигдсэн нууц мессеж олдлоо. Binary кодыг тайлж, нуугдсан үгийг ол.",
        puzzle: () => `
        <div class="term">
          <div class="term-label">&gt; cat intercepted_signal.bin</div>
          <div class="binary">${bytes.map((b, k) => `<span${k >= bytes.length - 4 ? ' class="nocopy"' : ""}>${b}</span>`).join("")}</div>
          <div class="term-foot">1 байт = 8 бит = 1 үсэг | ${bytes.length} байт = ${Math.ceil(bytes.length)} үсэг</div>
        </div>`,
        label: "тайлсан үг",
        placeholder: "Type your answer…",
        lock: lock(0),
        hints: [
          "Binary-г эхлээд Decimal болго. Дараа нь Text рүү хөрвүүлээд үз.",
          "Google-ээс хай.",
        ],
        lesson:
          "Компьютер үсэг бүрийг тоо болгож хадгалдаг: <b>A = 65 = 01000001</b>. Энэ стандартыг <b>ASCII</b> гэдэг. Таны дэлгэц дээрх бүх бичвэр цаанаа зөвхөн 0, 1-ээс бүтдэг.",
      },

      /* ---------- ШАТ 2: CAESAR ---------- */
      {
        key: "caesar",
        title: "CAESAR CIPHER",
        mission:
          "Вирус нэг чухал үгийг нуужээ. Үсэг бүр нь байрнаасаа шилжсэн байна. Жинхэнэ үгийг нь ол.",
        puzzle: () => `
        <div class="term cipher-wrap">
          <div class="term-label">&gt; cat encrypted_message.txt</div>
          <div class="cipher">${esc(cipher)}</div>
          <div class="shift-tag">SHIFT: ${shift}</div>
        </div>`,
        label: "тайлсан үг",
        placeholder: "Enter your decoded message…",
        lock: lock(1),
        hints: [
          `Үсэг бүрийг цагаан толгойн дагуу <b>${shift} байраар УРАГШ</b> шилжүүлсэн байна. Тиймээс үсэг бүрийг ${shift} байраар ХОЙШ нь буцаа.`,
          `Тайлах хүснэгт (шифрлэгдсэн → жинхэнэ):<div class="abc-grid">${abc.map((c) => `<span><b>${c}</b>→${caesar(c, (26 - shift) % 26)}</span>`).join("")}</div>`,
        ],
        lesson:
          "Юлий Цезарь энэ шифрийг 2000 орчим жилийн өмнө хэрэглэж байжээ. Өнөөдөр компьютер үүнийг хэдхэн миллисекундэд тайлчихна. Тиймээс бодит системүүд <b>AES</b>, <b>TLS</b> зэрэг хүчтэй шифрлэлт ашигладаг (хөтөч дээрх 🔒 тэмдэг яг үүнийг заадаг).",
      },

      /* ---------- ШАТ 3: HIDDEN MESSAGE ---------- */
      {
        key: "hidden",
        title: "HIDDEN MESSAGE",
        mission:
          "Халдвар авсан серверээс энэ log файлыг сэргээжээ. Дотор нь нуугдсан мессежийг ол.",
        puzzle: () => `
        <div class="term">
          <div class="term-label">&gt; cat recovered_log_31-10.txt</div>
          <ol class="log">${shuffledLines
            .map(
              (l, k) =>
                `<li><span class="log-ts">[23:${pad2(13 + k)}:${pad2((k * 17 + 4) % 60)}] ${logLevels[k % logLevels.length]}</span> ${esc(l)}<span class="ghost">${" ".repeat(6)}${esc(hiddenLetters[k] || "")}</span></li>`,
            )
            .join("")}</ol>
        </div>`,
        label: "нуугдсан мессеж",
        placeholder: "Enter the hidden message…",
        lock: lock(2),
        hints: [
          "Бүх зүйл нүдэнд харагддаггүй. Хакерууд дэлгэцийг биш, <b>цаад өгөгдлийг</b> нь уншдаг.",
          "Log-ийг бүхэлд нь <b>сонгоод</b> үз (<code>Ctrl + A</code>), эсвэл <code>F12</code> дарж кодыг нь хар. Мөр бүрийн төгсгөлд нэг үсэг нуугдсан.",
        ],
        lesson:
          "Энгийн мэт харагдах зүйл дотор мессеж нуухыг <b>стеганографи</b> гэдэг. Халдагчид хамгаалалтын программд баригдахгүйн тулд өгөгдлөө зураг, хөгжим, текст дотор нууж оруулдаг.",
      },

      /* ---------- ШАТ 4: QR CODE ---------- */
      {
        key: "qr",
        title: "QR CODE CHALLENGE",
        mission:
          "Вирус нууц сервер рүү орох далд хаалга нээжээ. Утсаараа кодыг уншуулж, хамгаалалтын шалгалтыг даван нууц үгийн хэсгийг ол.",
        puzzle: () => `
        <div class="term qr-wrap">
          <div class="term-label">&gt; ./open_backdoor --target hidden-server</div>
          <div class="qr-box" id="qr-box"></div>
          <div class="scan-msg">QR кодыг утсаараа уншуулаарай.</div>
          <div class="muted small">Апп хэрэггүй, утасныхаа камерыг нээгээд гарч ирсэн холбоос дээр дарахад л болно.</div>
        </div>`,
        label: "утсан дээр гарсан нууц үг",
        placeholder: "Enter your secret password…",
        lock: lock(3),
        after: renderQR,
        hints: [], // QR шатанд hint байхгүй
        lesson:
          "Бодит амьдрал дээр эзэн нь тодорхойгүй QR кодыг бүү уншуул. <b>“Quishing”</b> буюу QR фишинг гэдэг нь зурагт хуудас, зогсоолын төлбөрийн машин дээр хуурамч QR код наагаад хүмүүсийг луйврын сайт руу оруулдаг арга юм.",
      },

      /* ---------- ШАТ 5: FAKE LOGIN ---------- */
      {
        key: "login",
        title: "FAKE LOGIN SYSTEM",
        mission:
          "EMAPSOFT-ийн хамгаалалтын системд нэвтэр. Админ нууц үгээ нуухдаа нэг том алдаа гаргаж. Өмнө нь цуглуулсан сэжүүрүүдээ ашиглаад нэвтэр.",
        puzzle: () => `
        <div class="term">
          <div class="term-label">&gt; ls /home/admin</div>
          <div class="ls"><span>admin_notes.txt</span><span>cat_memes/</span><span>totally_not_passwords.txt</span></div>
          <div class="term-label">&gt; cat admin_notes.txt</div>
          <pre class="note">${esc(getStage5Note())}</pre>
        </div>`,
        side: () => `
        <form id="answer-form" class="login-box" autocomplete="off" novalidate>
          <div class="login-title">EMPASOFT SECURITY</div>
          <div class="login-status" id="login-status">SYSTEM LOCKED 🔒</div>
          <label for="answer-input" class="login-label">Password:</label>
          <div class="login-input-row">
            <input id="answer-input" class="masked" type="text" name="hth-unlock" autocomplete="off" autocapitalize="characters" spellcheck="false" placeholder="••••••••" data-lpignore="true" data-1p-ignore data-form-type="other">
            <button type="button" class="btn peek" id="peek" aria-label="Show password">👁</button>
          </div>
          <button type="submit" class="btn btn-primary btn-block" id="submit-btn">[ UNLOCK ]</button>
          <div id="feedback" class="feedback" aria-live="polite"></div>
        </form>`,
        lock: lock(4),
        hints: [
          "<b>admin_notes.txt</b>-г анхааралтай унш. Хэрэгтэй хоёр хэсгээ та өмнөх шатуудад (2-р шат, 4-р шат) аль хэдийн олчихсон.",
          "Бүтэц нь: ҮГ + ТОО, зайгүй (жишээ нь <code>CAT3</code>). 2-р шатны үгийн бүх үсгийг тоолоорой.",
        ],
        lesson:
          "Нууц үгээ энгийн тэмдэглэлд хэзээ ч бүү бич, амархан таагдах мэдээллээр ч бүү зохио. <b>Нууц үг хадгалагч</b> (password manager) ашиглаж, <b>2FA</b> буюу хоёр шатлалт баталгаажуулалтаа заавал асаагаарай.",
      },

      /* ---------- ШАТ 6: FIND THE BUG ---------- */
      {
        key: "bug",
        title: "FIND THE BUG",
        mission:
          "Вирусын эх код задарчихлаа! Энэ код <b>ACCESS GRANTED</b> гэж хэвлэх ёстой ч юу ч хэвлэхгүй байна. Нэг тоо буруу бичигдсэн. Түүнийг засаж вирусыг зогсоо.",
        puzzle: () => `
        <div class="term">
          <div class="term-label">&gt; cat virus_core.py</div>
          <pre class="code">${highlightPython(String(CONFIG.stage6Code))}</pre>
          <div class="question">❓ <code>[3]</code>-ын оронд ямар тоо бичвэл ACCESS GRANTED хэвлэгдэх вэ?</div>
        </div>`,
        label: "зөв тоо",
        placeholder: "Зөвхөн тоо бич…",
        lock: lock(5),
        hints: [
          "<code>code[3]</code> нь <code>\"GHOST\"</code> үгийн нэг үсгийг авна. Аль үсгийг авч байгааг тоолоод үз. Энэ нь <code>\"O\"</code> мөн үү?",
          "Python тоолохдоо <b>0-ээс</b> эхэлдэг: G=0, H=1, O=?, S=3, T=4.",
        ],
        lesson:
          "Ихэнх програмчлалын хэлэнд тоолол <b>0-ээс</b> эхэлдэг. Нэгээр зөрөх энэ алдааг <b>off-by-one error</b> гэдэг бөгөөд програмистуудын хамгийн түгээмэл алдааны нэг. Кодын өчүүхэн алдаа ч бодит аюулгүй байдлын цоорхой болж хувирдаг тул хөгжүүлэгчид code review, тест заавал ашигладаг.",
      },
    ];
  }

  // Hint 2: мастер үгийн эхний, сүүлийн үсэг + урт — багийн тайлсан хэсгүүдээс
  // (мастер үгийн 1-р хэсэг = шат FRAGMENT_ORDER.indexOf(0), сүүлийнх = …indexOf(5))
  function finalPatternHint() {
    const frags = state.frags || [];
    const first = String(frags[FRAGMENT_ORDER.indexOf(0)] || "?")[0];
    const last = String(
      frags[FRAGMENT_ORDER.indexOf(TOTAL_STAGES - 1)] || "?",
    ).slice(-1);
    const len = frags.reduce((n, f) => n + String(f || "").length, 0);
    const blanks = Array(Math.max(0, len - 2))
      .fill("_")
      .join(" ");
    return `Үг <b>${esc(first)}</b> үсгээр эхэлж, <b>${esc(last)}</b> үсгээр төгсөнө: <code>${esc(`${first} ${blanks} ${last}`)}</code>`;
  }
  const FINAL_HINTS = () => [
    "Компьютер гацаад юу ч ажиллахгүй болоход хамгийн түрүүнд юу хийдэг вэ? 🤔",
    finalPatternHint(),
  ];

  /* ================================================================
   7. ДУУ (WebAudio — файл хэрэггүй)
   ================================================================ */
  const sfx = (() => {
    let ctx = null;
    let on = store.get(KEYS.sound, true);
    function tone(freq, dur, type = "square", vol = 0.04, delay = 0) {
      if (!on) return;
      try {
        ctx = ctx || new (window.AudioContext || window.webkitAudioContext)();
        const t = ctx.currentTime + delay;
        const o = ctx.createOscillator(),
          g = ctx.createGain();
        o.type = type;
        o.frequency.setValueAtTime(freq, t);
        g.gain.setValueAtTime(vol, t);
        g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
        o.connect(g).connect(ctx.destination);
        o.start(t);
        o.stop(t + dur + 0.02);
      } catch (e) {
        /* дуу дэмжихгүй */
      }
    }
    return {
      success() {
        [523, 659, 784, 1047].forEach((f, i) =>
          tone(f, 0.14, "square", 0.035, i * 0.08),
        );
      },
      error() {
        tone(150, 0.22, "sawtooth", 0.05);
        tone(110, 0.3, "sawtooth", 0.05, 0.12);
      },
      hint() {
        tone(880, 0.08, "sine", 0.06);
        tone(660, 0.12, "sine", 0.06, 0.09);
      },
      win() {
        [392, 523, 659, 784, 659, 1047].forEach((f, i) =>
          tone(f, 0.22, "triangle", 0.06, i * 0.13),
        );
      },
      lose() {
        [330, 262, 196, 131].forEach((f, i) =>
          tone(f, 0.4, "sawtooth", 0.05, i * 0.25),
        );
      },
      toggle() {
        on = !on;
        store.set(KEYS.sound, on);
        return on;
      },
      get on() {
        return on;
      },
    };
  })();

  /* ================================================================
   8. ДЭЛГЭЦ СОЛИХ, HUD
   ================================================================ */
  const app = $("#app");
  let view = "game"; // game | server | leaderboard | admin

  function swap(html, after) {
    app.classList.add("out");
    setTimeout(() => {
      app.innerHTML = html;
      app.classList.remove("out");
      app.classList.add("in");
      window.scrollTo(0, 0);
      if (after) after();
      setTimeout(() => app.classList.remove("in"), 520);
    }, 200);
  }

  function updateHUD() {
    // Ялалтын дэлгэц дээр HUD нууна (дэлгэц багтаахын тулд — статистик тэнд харагдана)
    const show =
      view === "game" && ["briefing", "playing", "lost"].includes(state.status);
    $("#hud").hidden = !show;
    document.body.classList.toggle("has-hud", show);
    if (!show) return;

    $$(".js-team").forEach((el) => {
      el.textContent = state.team || "—";
    });
    $$(".js-hints").forEach((el) => {
      el.textContent = hintsUsedTotal();
    });

    const rem = remainingSec();
    $("#hud-timer").textContent = fmt(Math.ceil(rem));
    const wrap = $("#hud-timer-wrap");
    const live = state.status === "playing";
    wrap.classList.toggle("warn", live && rem <= 180 && rem > 60);
    wrap.classList.toggle("danger", live && rem <= 60);
    $("#hud-paused").hidden = !(isPaused() && live);

    // ● ● ● ○ ○ ○
    let dots = "";
    for (let k = 0; k < TOTAL_STAGES; k++) {
      const cls =
        k < state.stage ? "done" : k === state.stage && live ? "current" : "";
      dots += `<span class="dot ${cls}">${k < state.stage ? "●" : cls ? "◉" : "○"}</span>`;
    }
    const label =
      state.stage >= TOTAL_STAGES
        ? "FINAL"
        : `STAGE ${state.stage + 1} / ${TOTAL_STAGES}`;
    $("#hud-progress").innerHTML = `${dots}<span>&nbsp;${label}</span>`;

    let keys = "🔑 ";
    for (let k = 0; k < TOTAL_STAGES; k++) {
      keys +=
        k < state.stage
          ? `<span class="key-slot got${k === keyPop.idx && Date.now() < keyPop.until ? " pop" : ""}">${esc(fragmentFor(k))}</span>`
          : '<span class="key-slot">?</span>';
    }
    // Өөрчлөгдсөн үед л дахин зурна (tick бүрт анимаци дахин эхлэхгүй)
    if ($("#hud-keys").innerHTML !== keys) $("#hud-keys").innerHTML = keys;
    document.documentElement.style.setProperty(
      "--hud-h",
      $("#hud").offsetHeight + "px",
    );
  }

  function flash(text, bad = false, ms = 1150, sub = "") {
    const el = $("#flash");
    el.innerHTML = sub
      ? `<div>${esc(text)}<small class="flash-sub">${esc(sub)}</small></div>`
      : esc(text);
    el.classList.toggle("bad", bad);
    el.hidden = false;
    el.style.animation = "none";
    void el.offsetWidth;
    el.style.animation = "";
    clearTimeout(flash._t);
    flash._t = setTimeout(() => {
      el.hidden = true;
    }, ms);
  }

  function penaltyPop(sec) {
    if (!sec) return;
    const pop = document.createElement("span");
    pop.className = "penalty-pop";
    pop.textContent = `−${sec} сек`;
    $("#hud-timer-wrap").appendChild(pop);
    setTimeout(() => pop.remove(), 1700);
  }

  /* ================================================================
   9. ДЭЛГЭЦҮҮД
   ================================================================ */
  function render() {
    view = "game";
    document.body.classList.toggle("lost", state.status === "lost");
    // QR шатанд scanline эффектийг унтраана — QR код илүү хурдан уншигдана
    document.body.classList.toggle(
      "qr-stage",
      state.status === "playing" && getStages()[state.stage]?.key === "qr",
    );
    updateHUD();
    switch (state.status) {
      case "briefing":
        return renderBriefing();
      case "playing":
        return state.stage < TOTAL_STAGES
          ? renderStage(state.stage)
          : renderFinal();
      case "won":
        return renderWin();
      case "lost":
        return renderLose();
      default:
        return renderStart();
    }
  }

  /* ----- START ----- */
  function renderStart() {
    const boot = [
      ["", "> EMPASOFT OS v6.66 — BOOTING..."],

      ["", "> System integrity ............ FAILED"],

      ["warn", "> ⚠ INTRUSION DETECTED: pumpkin.exe"],

      ["warn", "> ⚠ FILES ENCRYPTED BY HALLOWEEN_VIRUS"],

      ["bad", "> ☠ SECURITY SYSTEMS COMPROMISED."],

      ["bad", "> ☠ EMPASOFT SYSTEM HAS BEEN HACKED."],
    ];
    swap(
      `
    <section class="start narrow">
      <div class="floaters" aria-hidden="true">
        <span style="left:4%;top:12%">👻</span><span style="right:6%;top:6%;animation-delay:-3s">🎃</span>
        <span style="left:10%;bottom:8%;animation-delay:-5s">🦇</span><span style="right:10%;bottom:16%;animation-delay:-2s">💀</span>
      </div>
      <div class="boot">
        ${boot.map(([c, t], i) => `<div class="boot-line ${c}" style="animation-delay:${0.15 + i * 0.4}s">${esc(t)}</div>`).join("")}
        <div class="boot-line cursor" style="animation-delay:${0.15 + boot.length * 0.4}s">&gt; awaiting response team</div>
      </div>
      <h1 class="title glitch" data-text="HACK THE HALLOWEEN"><small>EMPASOFT INSTITUTE OF TECHNOLOGY // 31.10</small>HACK THE HALLOWEEN</h1>
      <div class="hacked-banner">⚠ EMPASOFT SYSTEM HAS BEEN HACKED ⚠</div>
      <p class="muted">Halloween-ийн хортой программ EMPASOFT-ийн системийг түгжчихлээ. <br/> <b>Танай баг системийг сэргээх ёстой!</b></p>
      <form class="start-form" id="team-form" autocomplete="off">
        <label for="team-input">БАГИЙН НЭРЭЭ ОРУУЛНА УУ:</label>
        <div class="answer-row">
          <span class="prompt">&gt;</span>
          <input id="team-input" type="text" maxlength="24" placeholder="Багийн нэр…" required>
          <button class="btn btn-primary" type="submit">START MISSION</button>
        </div>
        <div class="feedback error" id="team-err"></div>
      </form>
      <div class="start-links">
        <button class="btn btn-small" type="button" id="open-board">🏆 Leaderboard</button>
      </div>
    </section>`,
      () => {
        const input = $("#team-input");
        if (!isTouch()) input.focus();
        $("#team-form").addEventListener("submit", (e) => {
          e.preventDefault();
          const name = input.value.trim().replace(/\s+/g, " ");
          if (!name) {
            $("#team-err").textContent = "✖ Эхлээд багийн нэрээ оруулна уу.";
            input.classList.add("shake");
            setTimeout(() => input.classList.remove("shake"), 400);
            return;
          }
          state = freshState();
          state.team = name;
          state.status = "briefing";
          saveState();
          sfx.success();
          render();
        });
        $("#open-board").addEventListener("click", () => {
          location.hash = "leaderboard";
        });
      },
    );
  }

  /* ----- MISSION BRIEFING ----- */
  // Одоогийн огноо, цагийг монгол хэлбэрээр: "10-р сарын 31-ний 23:59"
  // Өдрийн нөхцөл: 1, 4, 9-өөр төгсвөл -ний (нэг, дөрөв, ес), бусад нь -ны
  function mnDateTime(d = new Date()) {
    const day = d.getDate();
    const suf = [1, 4, 9].includes(day % 10) ? "ний" : "ны";
    return `${d.getMonth() + 1}-р сарын ${day}-${suf} ${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
  }

  // Organizer-ийн 🚦 START-аар тавьсан нийтийн эхлэх мөч. Тавиагүй, эсвэл тэр
  // тойргийн хугацаа бүхэлдээ өнгөрсөн бол null → STARTING SOON.
  function scheduledStartMs() {
    const t = Number(ctl.startAt) || 0;
    return t && now() - t < gameDuration() * 1000 ? t : null;
  }

  function renderBriefing() {
    // "1-р −30 сек, 2-р −45 сек, 3-р −60 секунд гэх мэтээр" — эхний 3-ыг тохиргооноос
    const pens = CONFIG.hintPenalties.slice(0, 3);
    const penText = pens
      .map(
        (s, k) =>
          `${k + 1}-р −${s} ${k === pens.length - 1 ? "секунд" : "сек"}`,
      )
      .join(", ");
    swap(
      `
    <section class="card brief narrow">
  <div class="classified">CLASSIFIED</div>

  <h2>📁 MISSION BRIEFING</h2>

  <p>Багийн нэр: <span class="hl-o">${esc(state.team)}</span></p>

  <p>
    <span class="hl" id="brief-time">${mnDateTime()}</span> цагт
    Halloween-ийн хортой программ EMPASOFT-ийн системд нэвтэрч,
    бүх файлыг түгжжээ.
  </p>

  <p><b>🎯Дүрэм:</b></p>

  <ul>
    <li><b>6 даалгавар</b> гүйцэтгэнэ.</li>
    <li>Даалгавар бүрээс <b>1 үсэг</b> цуглуулна.</li>
    <li>Цуглуулсан 6 үсгээ нэгтгэж, <b>МАСТЕР НУУЦ ҮГ</b> бүтээнэ.</li>
  </ul>

  <div class="rules">
    ⏱ <b id="brief-minutes">${Math.round(gameDuration() / 60)}</b> <b>минутын</b> хугацаатай<br>
    💡 ${CONFIG.hintPenaltyEnabled ? `Hint бүрт хугацаанаас: <b>${esc(penText)}</b> гэх мэтээр хасагдана` : "Hint ашиглахад хугацаа хасагдахгүй"}<br>
    📱 Нэг <b>утас</b> бэлэн байлгаарай, нэг даалгаврыг утсаар гүйцэтгэнэ.<br>
    🤝 Багаараа ажилла. Ярилц. Ажлаа хуваа.<br>
    🏆 <b>Мастер нууц үгийг хамгийн түрүүлж бүтээсэн баг ялна!</b>
  </div>

  <div class="start-countdown waiting" id="start-countdown">
    STARTING SOON
  </div>

  <div class="start-wait muted small" id="start-wait"></div>
</section>`,
      () => {
        // Цагийг бодит хугацаагаар шинэчилнэ (дэлгэцээс гарахад зогсоно)
        const clock = setInterval(() => {
          const el = $("#brief-time");
          if (!el) return clearInterval(clock);
          el.textContent = mnDateTime();
        }, 1000);
        const begin = (startedAt) => {
          if (state.status !== "briefing") return;
          state.status = "playing";
          state.stage = 0;
          state.frags = [];
          state.startedAt = startedAt;
          saveState();
          sfx.success();
          flash("⚠ CONNECTING…", false, 700);
          render();
        };

        // 🚦 Organizer START дарахгүй бол STARTING SOON. Дармагц том тоолуур гарч,
        // тэр мөчид бүх PC зэрэг эхэлнэ (startedAt = нийтийн мөч → цаг яг адилхан).
        const wait = $("#start-wait"),
          big = $("#start-countdown");
        const update = () => {
          if (!document.body.contains(big)) return clearInterval(cd);
          const startMs = scheduledStartMs();
          big.classList.toggle("waiting", !startMs);
          if (!startMs) {
            big.textContent = "STARTING SOON";
            big.classList.remove("soon");
            wait.textContent =
              "Зохион байгуулагч тоглоомыг эхлүүлэхийг хүлээнэ үү. Эхлэхэд энд тоолуур гарч, бүх баг зэрэг эхэлнэ.";
            return;
          }
          const left = Math.ceil((startMs - now()) / 1000);
          if (left <= 0) {
            clearInterval(cd);
            return begin(startMs);
          }
          const d = new Date(startMs - clockOffset);
          big.textContent = fmt(left);
          big.classList.toggle("soon", left <= 10);
          wait.textContent = `Бүх баг ${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}-д зэрэг эхэлнэ. Тоглоом автоматаар нээгдэнэ — хүлээж байгаарай.`;
        };
        const cd = setInterval(update, 250);
        update();
      },
    );
  }

  /* ----- STAGE (1–6) ----- */
  function renderStage(i) {
    const st = getStages()[i];
    const side = st.side
      ? st.side()
      : `
    <form id="answer-form" class="answer-form" autocomplete="off" novalidate>
      <label for="answer-input">ХАРИУЛТ — ${esc(st.label)}</label>
      <div class="answer-row">
        <span class="prompt">&gt;</span>
        <input id="answer-input" type="text" autocomplete="off" autocapitalize="characters" spellcheck="false" placeholder="${esc(st.placeholder)}">
        <button type="submit" class="btn btn-primary" id="submit-btn">SUBMIT</button>
      </div>
      <div id="feedback" class="feedback" aria-live="polite"></div>
    </form>`;

    swap(
      `
    <section class="card stage-card stage-${st.key}">
      <div class="stage-head">
        <span class="stage-num">STAGE ${pad2(i + 1)} / ${pad2(TOTAL_STAGES)}</span>
        <span class="stage-title">${st.title}</span>
      </div>
      <div class="stage-body">
        <div class="stage-main">
          <div class="mission"><span class="label">MISSION:</span>${st.mission}</div>
          <div class="puzzle">${st.puzzle()}</div>
        </div>
        <div class="stage-side">
          ${side}
          ${
            st.hints.length
              ? `<div class="hint-area">
            <div class="hint-bar">
              <div id="hint-tabs" class="hint-tabs" role="tablist" aria-label="Hints"></div>
              <button type="button" id="hint-btn" class="btn btn-hint"></button>
            </div>
            <div id="hint-list" class="hint-list" aria-live="polite"></div>
          </div>`
              : ""
          }
        </div>
      </div>
    </section>`,
      () => {
        bindAnswerForm(st.lock, (payload) => onStageSolved(i, st, payload.f));
        if (st.hints.length) bindHints(i, st.hints);
        const peek = $("#peek");
        if (peek)
          peek.addEventListener("click", () => {
            const inp = $("#answer-input");
            // type="password" биш (хөтөч "нууц үг хадгалах уу?" гэж асуухгүй) — CSS-ээр нууна
            inp.classList.toggle("masked");
          });
        if (st.after) st.after();
        if (!isTouch()) $("#answer-input").focus();
      },
    );
  }

  const WRONG_MSGS = [
    "✖ ACCESS DENIED: Bro is NOT cooking. 💀",

    "✖ ERROR 0xDEAD: Nah bro, яаж ингэж итгэлтэй буруу хариулдаг байна аа. 😭",

    "✖ SYSTEM WARNING: Aura чинь -10000000 болчихлоо. 📉💀",

    "✖ ERROR 404: Lock in bro, наад чинь зөв хариу биш. 😭🙏",

    "✖ Буруу. Аврах баг биш, устгах баг ирчихэв үү? 💀",
  ];

  // lock — шифрлэгдсэн цоож. Зөв хариулт бичвэл onCorrect(тайлагдсан payload).
  function bindAnswerForm(lock, onCorrect) {
    const form = $("#answer-form"),
      input = $("#answer-input"),
      fb = $("#feedback"),
      btn = $("#submit-btn");
    let wrong = 0,
      busy = false;
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      if (state.status !== "playing" || busy) return;
      const val = norm(input.value);
      if (!val) {
        fb.className = "feedback error";
        fb.textContent = "✖ Эхлээд хариултаа бичнэ үү.";
        return;
      }
      const stageAtSubmit = state.stage;
      busy = true;
      btn.disabled = true;
      fb.className = "feedback";
      fb.textContent = "⏳ CHECKING…";
      let payload = null;
      try {
        payload = await openLock(lock, val);
      } catch (err) {
        busy = false;
        btn.disabled = false;
        fb.className = "feedback error";
        fb.textContent =
          "✖ Хариулт шалгаж чадсангүй. Тоглоомыг https хаягаар нээнэ үү.";
        return;
      }
      busy = false;
      // Шалгаж байх хооронд дэлгэц солигдсон бол (жишээ нь PAUSE/RESET) юу ч хийхгүй
      if (
        !form.isConnected ||
        state.status !== "playing" ||
        state.stage !== stageAtSubmit
      )
        return;
      if (payload) {
        fb.className = "feedback ok";
        fb.textContent = "✔ CORRECT";
        input.disabled = true;
        onCorrect(payload);
      } else {
        btn.disabled = false;
        fb.className = "feedback error";
        fb.textContent = WRONG_MSGS[wrong++ % WRONG_MSGS.length];
        sfx.error();
        form.classList.remove("shake");
        void form.offsetWidth;
        form.classList.add("shake");
        input.select();
      }
    });
  }

  function bindHints(stageIdx, hints) {
    const btn = $("#hint-btn"),
      list = $("#hint-list");
    // Дараагийн hint-ийн торгууль = тоглоом дахь нийт hint-ийн тоогоор (шат бүрээр биш)
    const penaltyFor = (k = hintsUsedTotal()) =>
      CONFIG.hintPenaltyEnabled
        ? Number(
            CONFIG.hintPenalties[Math.min(k, CONFIG.hintPenalties.length - 1)],
          ) || 0
        : 0;
    // Hint-үүдийг доош овоолохгүй: нэг удаад НЭГИЙГ л харуулна (хуудас уртсахгүй,
    // scroll хийх шаардлагагүй). Авсан hint-үүдийн хооронд HINT 1 / HINT 2 табаар шилжинэ.
    const tabs = $("#hint-tabs");
    let shown = null; // сонгосон hint (null = хамгийн сүүлд авсан)
    const draw = (animate = false) => {
      const used = state.hints[stageIdx] || 0;
      const sel = shown == null || shown >= used ? used - 1 : shown;
      tabs.innerHTML =
        used > 1
          ? hints
              .slice(0, used)
              .map(
                (_, k) =>
                  `<button type="button" role="tab" class="hint-tab${k === sel ? " on" : ""}" aria-selected="${k === sel}" data-k="${k}">HINT ${k + 1}</button>`,
              )
              .join("")
          : "";
      list.innerHTML =
        sel >= 0
          ? `<div class="hint${animate ? " new" : ""}"><b>💡 HINT ${sel + 1}:</b> ${hints[sel]}</div>`
          : "";
      if (used >= hints.length) {
        btn.hidden = true;
      } else {
        const p = penaltyFor();
        btn.textContent = `💡 HINT ${used + 1}/${hints.length}${p ? ` (−${p} сек)` : ""}`;
        btn.disabled = false;
      }
    };
    btn.addEventListener("click", () => {
      if (state.status !== "playing") return;
      const used = state.hints[stageIdx] || 0;
      if (used >= hints.length) return;
      const p = penaltyFor();
      state.hints[stageIdx] = used + 1;
      state.penaltySec += p;
      saveState();
      sfx.hint();
      penaltyPop(p);
      shown = null;
      draw(true);
      updateHUD();
      tick();
    });
    tabs.addEventListener("click", (e) => {
      const tab = e.target.closest(".hint-tab");
      if (!tab) return;
      shown = Number(tab.dataset.k);
      draw();
    });
    draw();
  }

  // Зөв хариулт → ~1 сек "ACCESS GRANTED · 🔑 хэсэг" анивчаад дараагийн шат
  // автоматаар нээгдэнэ (товч дарах шаардлагагүй, цаг алдахгүй). Аюулгүй байдлын
  // санамжууд (lesson) тоглоом дууссаны дараа нэг дор харагдана.
  let keyPop = { idx: -1, until: 0 }; // HUD дээр шинэ түлхүүрийн нүдийг тодруулна
  function onStageSolved(i, st, fragment) {
    state.frags = Object.assign([], state.frags, { [i]: fragment });
    state.stage = i + 1;
    saveState();
    sfx.success();
    keyPop = { idx: i, until: Date.now() + 1800 };
    updateHUD();
    flash("ACCESS GRANTED", false, 1150, `🔑 ${fragment}`);
    const box = $(".login-box");
    if (box) {
      box.classList.add("granted");
      $("#login-status").textContent = "ACCESS GRANTED ✔";
    }
    if ($("#hint-btn")) $("#hint-btn").hidden = true;
    // Анивчилт бүрэн бүрхсэн үед дараагийн шатыг зурна
    setTimeout(() => {
      if (
        view === "game" &&
        state.status === "playing" &&
        state.stage === i + 1
      )
        render();
    }, 550);
  }

  /* ----- QR ----- */
  function renderQR() {
    const box = $("#qr-box");
    if (!box) return;
    const target = qrTarget();
    if (window.QRCode) {
      box.innerHTML = "";
      // Level L = цэг цөөн, том → утсаар хурдан уншигдана
      new window.QRCode(box, {
        text: target.value,
        width: 512,
        height: 512,
        colorDark: "#000000",
        colorLight: "#ffffff",
        correctLevel: window.QRCode.CorrectLevel.L,
      });
      box.removeAttribute("title");
    } else {
      box.innerHTML = `<div class="qr-fallback">⚠ QR код ачаалагдсангүй (интернэт байхгүй байж магадгүй).<br>Зохион байгуулагчаас тусламж аваарай.</div>`;
    }
  }

  /* ----- FINAL BOSS ----- */
  function renderFinal() {
    const finalIdx = TOTAL_STAGES; // hints-ийн индекс
    swap(
      `
    <section class="card final-card narrow">
      <div class="final-warn glitch" data-text="⚠️ FINAL SYSTEM">⚠️ FINAL SYSTEM</div>
      <div class="final-sub">Бүх сэжүүр цугларлаа.</div>
      <p class="center muted">Вирус мастер түлхүүрийн 6 үсгийг салгаж, холиод нуужээ. Танай баг олсон үсгүүд:</p>
      <div class="frag-row">
        ${Array.from({ length: TOTAL_STAGES }, (_, k) => `<div class="frag" style="animation-delay:${k * 0.08}s"><small>STAGE ${k + 1}</small><b>${esc(fragmentFor(k))}</b></div>`).join("")}
      </div>
      <form id="answer-form" class="answer-form" autocomplete="off" novalidate>
        <label for="answer-input">МАСТЕР НУУЦ ҮГЭЭ оруулна уу:</label>
        <div class="answer-row">
          <span class="prompt">&gt;</span>
          <input id="answer-input" type="text" autocomplete="off" autocapitalize="characters" spellcheck="false" placeholder="MASTER PASSWORD…">
          <button type="submit" class="btn btn-primary" id="submit-btn">RESTORE SYSTEM</button>
        </div>
        <div id="feedback" class="feedback" aria-live="polite"></div>
      </form>
      <div class="hint-area">
        <div class="hint-bar">
          <div id="hint-tabs" class="hint-tabs" role="tablist" aria-label="Hints"></div>
          <button type="button" id="hint-btn" class="btn btn-hint"></button>
        </div>
        <div id="hint-list" class="hint-list" aria-live="polite"></div>
      </div>
    </section>`,
      () => {
        bindAnswerForm(CONFIG.final, onFinalSolved);
        bindHints(finalIdx, FINAL_HINTS());
        if (!isTouch()) $("#answer-input").focus();
      },
    );
  }

  function onFinalSolved() {
    state.status = "won";
    state.finishedAt = now();
    state.finalTime = Math.min(gameDuration(), elapsedSec());
    state.frozenElapsed = state.finalTime;
    if (!state.recorded) {
      state.boardId = addBoardEntry(
        state.team,
        state.finalTime,
        hintsUsedTotal(),
        state.penaltySec,
      );
      state.recorded = true;
    }
    saveState();
    sfx.win();
    flash("🔓 SYSTEM RESTORED", false, 1300);
    setTimeout(render, 900);
  }

  /* ----- WIN ----- */
  function renderWin() {
    const t = state.finalTime ?? elapsedSec();
    const tb = timeBreakdown();
    swap(
      `
    <section class="win narrow">
      <div class="win-lock">🔓</div>
      <h1 class="win-title glitch" data-text="SYSTEM RESTORED">SYSTEM RESTORED</h1>
      <div class="win-congrats">CONGRATULATIONS!</div>
      <p class="win-msg">Та EMPASOFT-ийн аюулгүй байдлын системийг аварлаа!</p>
      <div class="win-team">${/^team\b/i.test(state.team) ? "" : "TEAM "}<span>${esc(state.team)}</span> COMPLETED THE MISSION</div>
      <div class="time-calc" aria-label="Хугацааны тооцоо">
        <div class="tc-part"><span>⏱ ТОГЛОСОН ХУГАЦАА</span><b>${fmt(tb.played)}</b><small>эхэлснээс дуусах хүртэл</small></div>
        <div class="tc-op">+</div>
        <div class="tc-part"><span>💡 HINT-ИЙН ТОРГУУЛЬ</span><b class="tc-pen">+${fmt(tb.penalty)}</b><small>${hintsUsedTotal()} hint авсан</small></div>
        <div class="tc-op">=</div>
        <div class="tc-part tc-total"><span>🏁 НИЙТ ХУГАЦАА</span><b>${fmt(tb.total)}</b></div>
      </div>
     <div class="start-links">
        <button class="btn btn-small" id="open-board">🏆 Leaderboard</button>
        <button class="btn btn-small btn-danger" id="new-game">↺ ДАХИН ЭХЛЭХ</button>
      </div>
      ${lessonsHtml()}
    </section>`,
      () => {
        $("#open-board").addEventListener("click", () => {
          location.hash = "leaderboard";
        });
        bindNewGame($("#new-game"));
        bindLessons();
        rainParticles();
      },
    );
  }

  function rainParticles() {
    const box = $("#particles");
    box.innerHTML = "";
    const icons = ["🎃", "👻", "🦇", "💀", "🍬", "🕸️", "✨"];
    const count = window.innerWidth < 600 ? 22 : 40;
    for (let k = 0; k < count; k++) {
      const s = document.createElement("span");
      s.textContent = icons[k % icons.length];
      s.style.left = Math.random() * 100 + "vw";
      s.style.fontSize = 1.2 + Math.random() * 1.8 + "rem";
      s.style.animationDuration = 3 + Math.random() * 3.5 + "s";
      s.style.animationDelay = Math.random() * 2.5 + "s";
      box.appendChild(s);
    }
    setTimeout(() => {
      box.innerHTML = "";
    }, 9000);
  }

  // 🛡 Шат бүрийн аюулгүй байдлын санамж — тоглоом дууссаны дараа.
  // Нэг удаад НЭГ санамж (scroll гаргахгүй), 8 сек тутам автоматаар дараагийнх руу
  // шилжинэ. Хулгана дээр нь байвал зогсоно; таб дарвал автомат шилжилт зогсоно.
  function lessonsHtml() {
    const st = getStages();
    return `
      <div class="lessons" id="lessons">
        <h2 class="lessons-title">ӨНӨӨДӨР СУРСАН ${TOTAL_STAGES} ЗҮЙЛ</h2>
        <div class="lesson-tabs" role="tablist" aria-label="Аюулгүй байдлын санамжууд">${st
          .map(
            (s, k) =>
              `<button type="button" role="tab" class="lesson-tab${k ? "" : " on"}" aria-selected="${!k}" data-k="${k}"><b>${k + 1}</b> ${s.key.toUpperCase()}</button>`,
          )
          .join("")}</div>
        <div class="lesson-deck">${st
          .map(
            (s, k) =>
              `<div class="lesson${k ? "" : " on"}" role="tabpanel"><span class="lesson-head">STAGE ${pad2(k + 1)} · ${s.title}</span><p>${s.lesson}</p></div>`,
          )
          .join("")}</div>
      </div>`;
  }
  function bindLessons() {
    const box = $("#lessons");
    if (!box) return;
    const tabs = $$(".lesson-tab", box),
      cards = $$(".lesson", box);
    let current = 0;
    const show = (k) => {
      current = k;
      tabs.forEach((t, i) => {
        t.classList.toggle("on", i === k);
        t.setAttribute("aria-selected", String(i === k));
      });
      cards.forEach((c, i) => c.classList.toggle("on", i === k));
    };
    box.addEventListener("click", (e) => {
      const tab = e.target.closest(".lesson-tab");
      if (!tab) return;
      box.classList.add("manual");
      show(Number(tab.dataset.k));
    });
    // 8 сек тутам дараагийн санамж руу (хулгана дээр нь эсвэл tab нуугдсан үед зогсоно).
    // Табын доорх явцын шугам (CSS) энэ хугацаатай ижил.
    const STEP = 8000;
    let left = STEP,
      last = performance.now();
    const timer = setInterval(() => {
      if (!box.isConnected || box.classList.contains("manual"))
        return clearInterval(timer);
      const t = performance.now();
      if (!document.hidden && !box.matches(":hover, :focus-within"))
        left -= t - last;
      last = t;
      if (left <= 0) {
        left = STEP;
        show((current + 1) % tabs.length);
      }
    }, 200);
  }

  /* ----- LOSE ----- */
  function renderLose() {
    swap(
      `
    <section class="lose narrow">
      <div class="skull">💀</div>
      <h1 class="lose-title glitch" data-text="TIME'S UP">TIME'S UP</h1>
      <p>Halloween вирус яллаа.</p>
      <p class="muted"><span class="hl-o">${esc(state.team)}</span> баг ${TOTAL_STAGES} шатнаас ${Math.min(state.stage, TOTAL_STAGES)}-ийг давлаа.</p>
      <div class="start-links"><button class="btn btn-small btn-danger" id="new-game">↺ ДАХИН ЭХЛЭХ</button></div>
      ${lessonsHtml()}
    </section>`,
      () => {
        bindNewGame($("#new-game"));
        bindLessons();
      },
    );
  }

  // ↺ ДАХИН ЭХЛЭХ — 2 удаа дарж баталгаажуулна. Энэ PC дээр тоглосон багийн
  // үр дүнг онооны самбараас (нийтийн самбараас ч) устгаж, бусад багийнхыг
  // үлдээнэ. Дараа нь localStorage-ийг (hth_*) цэвэрлээд хуудсыг шинээр ачаална.
  function bindNewGame(btn) {
    const steps = [
      btn.textContent,
      `☠ "${state.team}" БАГИЙН ҮР ДҮН УСТНА — ДАХИН ДАРЖ БАТАЛГААЖУУЛ`,
    ];
    let step = 0,
      t;
    btn.addEventListener("click", async () => {
      clearTimeout(t);
      if (step < steps.length - 1) {
        step += 1;
        btn.textContent = steps[step];
        btn.classList.remove("shake");
        void btn.offsetWidth;
        btn.classList.add("shake");
        sfx.error();
        // 4 секунд дотор дарахгүй бол буцаад анхны төлөвтөө орно
        t = setTimeout(() => {
          step = 0;
          btn.textContent = steps[0];
        }, 4000);
        return;
      }
      btn.disabled = true;
      btn.textContent = "🧹 ЦЭВЭРЛЭЖ БАЙНА…";
      // Энэ багийн бичлэгийг олно (хуучин state-д boardId байхгүй бол нэр + цагаар)
      const mine = getBoard().filter((e) =>
        state.boardId
          ? e.id === state.boardId
          : state.recorded &&
            norm(e.team) === norm(state.team) &&
            e.time === Math.round(state.finalTime),
      );
      const ids = mine.map((e) => e.id);
      if (state.boardId && !ids.includes(state.boardId))
        ids.push(state.boardId);
      // Бусад багийн илгээгдээгүй үр дүнг илгээж, энэ багийнхыг устгана (3 сек хүртэл хүлээнэ)
      const others = getBoard().filter((e) => e.pending && !ids.includes(e.id));
      await Promise.race([
        Promise.all([...ids.map(removeBoardEntry), ...others.map(pushRemote)]),
        new Promise((r) => setTimeout(r, 3000)),
      ]);
      try {
        Object.keys(localStorage)
          // Онооны самбарыг (бусад багийнхыг) үлдээнэ — энэ багийнх дээр устсан
          .filter(
            (k) =>
              k.startsWith("hth_") &&
              ![KEYS.board, KEYS.pc, KEYS.reset].includes(k),
          )
          .forEach((k) => localStorage.removeItem(k));
      } catch (e) {
        /* хувийн цонх гэх мэт */
      }
      location.replace(location.pathname + location.search);
    });
  }

  function loseGame() {
    if (state.status !== "playing") return;
    state.status = "lost";
    state.frozenElapsed = Math.min(gameDuration(), elapsedSec());
    state.finishedAt = now();
    saveState();
    sfx.lose();
    flash("TIME'S UP 💀", true, 1400);
    render();
  }

  /* ================================================================
   10. ОНООНЫ САМБАР + FIREBASE-ТЭЙ ХОЛБОГДОХ
   Firebase Realtime Database (REST) руу бичиж, бүх PC-ийн үр дүнг шууд
   (live) татна. localStorage нь кэш — интернет тасарсан ч ажилласаар байна.
   ================================================================ */

  const remoteUrl = (path = "") => `${REMOTE}/leaderboard${path}.json`;
  const getBoard = () => store.get(KEYS.board, []);
  const sortedBoard = () =>
    getBoard()
      .slice()
      .sort((a, b) => a.time - b.time || (a.hints || 0) - (b.hints || 0));
  let adminDrawBoard = null; // Admin самбар нээлттэй үед жагсаалтыг дахин зурах
  function boardChanged() {
    refreshBoardView();
    if (adminDrawBoard && !modal.hidden && $("#lb-list")) adminDrawBoard();
  }
  function pushRemote(entry) {
    const { pending, ...data } = entry;
    return fetch(remoteUrl("/" + entry.id), {
      method: "PUT",
      body: JSON.stringify(data),
    })
      .then((r) => {
        if (!r.ok) throw new Error(r.status);
        store.set(
          KEYS.board,
          getBoard().map((e) => (e.id === entry.id ? data : e)),
        );
      })
      .catch(() => {
        /* интернетгүй — дараагийн sync дээр дахин оролдоно */
      });
  }
  function addBoardEntry(team, timeSec, hints, penalty = 0) {
    const entry = {
      id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
      team: String(team).slice(0, 30),
      time: Math.round(timeSec), // финалын цаг (hint-ийн торгууль ОРСОН)
      hints: Number(hints) || 0,
      penalty: Math.round(Number(penalty) || 0),
      pending: true, // Firebase руу илгээгдтэл
    };
    store.set(KEYS.board, [...getBoard(), entry]);
    pushRemote(entry);
    return entry.id;
  }
  function removeBoardEntry(id) {
    store.set(
      KEYS.board,
      getBoard().filter((e) => e.id !== id),
    );
    return fetch(remoteUrl("/" + id), { method: "DELETE" }).catch(() => {});
  }
  function clearBoard() {
    store.set(KEYS.board, []);
    fetch(remoteUrl(), { method: "DELETE" }).catch(() => {});
  }
  // Серверээс бүх үр дүнг татаж кэшийг шинэчилнэ (илгээгдээгүйг хадгалж, дахин илгээнэ)
  async function syncBoard() {
    try {
      const r = await fetch(remoteUrl());
      if (!r.ok) return;
      const data = (await r.json()) || {};
      const remote = Object.keys(data).map((id) => ({ ...data[id], id }));
      const pending = getBoard().filter((e) => e.pending && !(e.id in data));
      store.set(KEYS.board, [...remote, ...pending]);
      pending.forEach(pushRemote);
      boardChanged();
    } catch (e) {
      /* интернетгүй — кэшээ харуулсаар байна */
    }
  }
  function startBoardSync() {
    syncBoard();
    // Firebase өөрчлөлт бүрт event илгээнэ → шууд шинэчлэгдэнэ
    if ("EventSource" in window) {
      const es = new EventSource(remoteUrl());
      es.addEventListener("put", syncBoard);
      es.addEventListener("patch", syncBoard);
    }
    // Нөөц: stream тасарсан ч 10 секунд тутам шалгана
    setInterval(syncBoard, 10000);
  }

  /* ----- 🌐 НИЙТИЙН УДИРДЛАГА + СЕРВЕРИЙН ЦАГ -----
   Organizer-ийн самбараас Firebase /control-д бичнэ. Бүх PC үүнийг сонсож
   нэг дор дагана: эхлэх тоолуур, нийт хугацаа, pause, ±1 мин, бүгдийг reset.
   PC бүр өөрийн төлөвийг /teams/<pcId>-д бичиж, Organizer бүх багийг хянана. */
  const controlUrl = () => `${REMOTE}/control.json`;
  // Серверийн цагийг асууж PC-ийн цагийн зөрүүг тооцно (сүлжээний хоцролтыг хасна)
  async function syncClock() {
    try {
      const t0 = Date.now();
      const r = await fetch(`${REMOTE}/clock.json`, {
        method: "PUT",
        body: JSON.stringify({ ".sv": "timestamp" }),
      });
      const t1 = Date.now();
      const server = await r.json();
      if (r.ok && typeof server === "number")
        clockOffset = Math.round(server - (t0 + t1) / 2);
    } catch (e) {
      /* интернетгүй — PC-ийн өөрийн цагийг хэрэглэнэ */
    }
  }
  async function syncControl() {
    try {
      const r = await fetch(controlUrl());
      if (!r.ok) return;
      const prevDuration = gameDuration();
      ctl = (await r.json()) || {};
      applyControl(prevDuration);
    } catch (e) {
      /* ignore */
    }
  }
  // Organizer-ийн тушаалыг энэ PC дээр хэрэгжүүлнэ
  function applyControl(prevDuration) {
    // 🔄 RESET ALL: reset-ийн мөчөөс ӨМНӨ эхэлсэн тоглоомыг эхний дэлгэц рүү буцаана.
    // Нэг reset-ийг нэг л удаа хэрэгжүүлнэ (KEYS.reset) — давтан reset хийхгүй.
    const resetAt = Number(ctl.resetAt) || 0;
    if (resetAt && store.get(KEYS.reset, null) !== resetAt) {
      store.set(KEYS.reset, resetAt);
      if ((state.createdAt || 0) < resetAt && state.status !== "start") {
        state = freshState();
        saveState();
        document.body.classList.remove("lost");
        if (view === "game") render();
        pushTeamStatus(true);
        return;
      }
    }
    // Нийт хугацаа өөрчлөгдвөл briefing дээрх минутыг шинэчилнэ
    const mins = $("#brief-minutes");
    if (mins && prevDuration !== gameDuration())
      mins.textContent = Math.round(gameDuration() / 60);
    if (view === "game") {
      updateHUD();
      tick();
    }
  }
  // Firebase /control-ийн хэсгийг шинэчилнэ (PATCH) эсвэл бүхэлд нь солино (PUT)
  async function writeControl(data, replace = false) {
    const r = await fetch(controlUrl(), {
      method: replace ? "PUT" : "PATCH",
      body: JSON.stringify(data),
    });
    if (!r.ok) throw new Error(r.status);
    ctl = replace ? { ...data } : { ...ctl, ...data };
    Object.keys(ctl).forEach((k) => ctl[k] == null && delete ctl[k]);
  }

  /* ----- 📡 БАГУУДЫН ШУУД ТӨЛӨВ (/teams/<pcId>) ----- */
  function pcId() {
    let id = store.get(KEYS.pc, null);
    if (!id) {
      id = "pc-" + Math.random().toString(36).slice(2, 8);
      store.set(KEYS.pc, id);
    }
    return id;
  }
  let lastStatus = "";
  function pushTeamStatus(force = false) {
    if (view === "server" || view === "admin") return;
    const data = {
      team: state.team || "",
      status: state.status,
      stage: Math.min(state.stage, TOTAL_STAGES),
      hints: hintsUsedTotal(),
      remaining: Math.ceil(remainingSec()),
      finalTime: state.finalTime ?? null,
    };
    const key = JSON.stringify({
      ...data,
      remaining: Math.floor(data.remaining / 15),
    });
    if (!force && key === lastStatus) return;
    lastStatus = key;
    fetch(`${REMOTE}/teams/${pcId()}.json`, {
      method: "PUT",
      body: JSON.stringify({ ...data, seen: { ".sv": "timestamp" } }),
    }).catch(() => {});
  }

  /* ----- ⚙ НИЙТИЙН ТОХИРГОО (/config) -----
   Organizer тохиргоо хадгалахад бүх PC шууд авна. Firebase-д зөвхөн
   шифрлэгдсэн тохиргоо (sealConfig) JSON string хэлбэрээр байна. */
  const configUrl = () => `${REMOTE}/config.json`;
  function setRemoteConfig(cfg) {
    const prev = JSON.stringify(store.getSecret(KEYS.remoteConfig, {}));
    if (prev === JSON.stringify(cfg)) return;
    store.setSecret(KEYS.remoteConfig, cfg);
    CONFIG = loadConfig();
    // Тоглож буй багийн дэлгэцийг шинэ хариулт/таавраар дахин зурна (явц, hint хадгалагдана)
    if (view === "game" && ["briefing", "playing"].includes(state.status))
      render();
    if (adminUnlocked) refreshAdminVault();
  }
  async function syncConfig() {
    try {
      const r = await fetch(configUrl());
      if (!r.ok) return;
      const raw = await r.json();
      if (raw == null) return setRemoteConfig({});
      // Хуучин хэлбэрийн ("obf1." …) тохиргоо → анхны тохиргоо хэрэглэнэ
      let cfg = {};
      try {
        cfg = JSON.parse(raw);
      } catch (e) {
        /* хуучин хэлбэр */
      }
      setRemoteConfig(cfg && cfg.v === 2 ? cfg : {});
    } catch (e) {
      /* интернетгүй — кэшлэсэн тохиргоогоо хэрэглэнэ */
    }
  }

  function startControlSync() {
    syncClock();
    syncControl();
    syncConfig();
    if ("EventSource" in window) {
      const es = new EventSource(controlUrl());
      es.addEventListener("put", syncControl);
      es.addEventListener("patch", syncControl);
      const esc2 = new EventSource(configUrl());
      esc2.addEventListener("put", syncConfig);
      esc2.addEventListener("patch", syncConfig);
    }
    setInterval(syncConfig, 15000);
    setInterval(syncControl, 5000);
    setInterval(syncClock, 60000);
    pushTeamStatus(true);
    setInterval(pushTeamStatus, 3000);
    // 1 минут тутам "амьд байна" гэж мэдэгдэнэ
    setInterval(() => pushTeamStatus(true), 60000);
  }

  function renderLeaderboard() {
    // Самбар аль хэдийн нээлттэй бол (шинэ баг нэмэгдэх) картыг алга болгож
    // дахин гаргахгүй — байрандаа шинэчилж, зөвхөн ШИНЭ мөрийг анимацитай гаргана.
    const live = view === "leaderboard" && $(".app > .board");
    const seen = new Set(
      live ? $$(".board-list li[data-id]").map((li) => li.dataset.id) : [],
    );
    view = "leaderboard";
    updateHUD();
    const list = sortedBoard();
    const medal = ["🥇", "🥈", "🥉"];
    // Энэ PC дээр тоглосон баг (boardId-гаар, хуучин state бол нэр + цагаар)
    const isMine = (e) =>
      state.boardId
        ? e.id === state.boardId
        : state.recorded &&
          norm(e.team) === norm(state.team) &&
          e.time === Math.round(state.finalTime);
    (live ? (html, after) => ((app.innerHTML = html), after()) : swap)(
      `
    <section class="card board narrow">
      <h1 class="board-title">🏆 HACK THE HALLOWEEN</h1>
      <div class="board-sub">LEADERBOARD // fastest teams to restore the system</div>
      ${
        list.length
          ? `<div class="board-head" aria-hidden="true">
          <span>#</span><span>БАГИЙН НЭР</span><span class="r">НИЙТ ХУГАЦАА</span><span class="r bh">HINT</span>
        </div>
        <ol class="board-list">${list
          .map(
            (e, k) => `
        <li data-id="${esc(e.id)}" class="${k < 3 ? "r" + (k + 1) : ""}${isMine(e) ? " mine" : ""}${seen.has(String(e.id)) ? " still" : ""}" style="animation-delay:${live ? 0 : Math.min(k, 12) * 0.05}s">
          <span class="rank">${medal[k] || k + 1}</span>
          <span class="team">${esc(e.team)}${isMine(e) ? ' <span class="you">(Your team)</span>' : ""}</span>
          <span class="time">${fmt(e.time)}</span>
          <span class="bh">💡 ${e.hints ?? 0}${e.penalty ? `<small>+${fmt(e.penalty)}</small>` : ""}</span>
        </li>`,
          )
          .join("")}</ol>
        <div class="board-note">⏱ Нийт хугацаа = Тоглосон хугацаа + Hint ашигласны торгууль. Хоёр багийн хугацаа тэнцсэн тохиолдолд бага Hint ашигласан баг түрүүлнэ.</div>`
          : '<div class="board-empty">Одоогоор системийг сэргээсэн баг алга… 👻</div>'
      }
      <div class="start-links"><button class="btn btn-small" id="board-back">◀ Тоглоом руу буцах</button></div>
    </section>`,
      () => {
        $("#board-back").addEventListener("click", () => {
          history.pushState(null, "", location.pathname + location.search);
          render();
        });
      },
    );
  }

  /* ================================================================
   11. УТСАН ДЭЭРХ "НУУЦ СЕРВЕР" (QR-ээр нээгдэнэ)
   Backend байхгүй тул PC→утас мэдээллийг QR доторх URL-ээр дамжуулна
   (багийн нэр + fragment). Утас→PC: тоглогч fragment-ийг PC дээр бичнэ.
   ================================================================ */
  function renderServer(token) {
    view = "server";
    updateHUD();
    const data = decodeToken(token || "");
    if (!data || !data.q || !Array.isArray(data.q.boxes)) {
      swap(
        `<section class="card server narrow"><div class="server-pumpkin">💀</div><h1>SIGNAL CORRUPTED</h1><p class="muted">Энэ QR холбоос эвдэрсэн байна. Багийнхаа компьютер дээрх кодыг дахин уншуулаарай.</p></section>`,
      );
      return;
    }
    // Зөв сонголт кодонд байхгүй — сонгосон хариултаар хэсгийг тайлж үзнэ
    const quiz = MOBILE_QUIZ;
    const opts = shuffle(quiz.options);
    let busy = false;

    swap(
      `
    <section class="card server narrow">
      <div class="server-head">📡 HIDDEN-SERVER-0x31 // fictional node</div>
      <div id="srv-step"></div>
    </section>`,
      () => {
        const step = $("#srv-step");
        // 1) Хурдан "холбогдож байна" анимаци (~1 сек)
        step.innerHTML = `<div class="server-step"><div class="muted">НУУЦ СЕРВЕРТ ХОЛБОГДОЖ БАЙНА…</div><div class="connect-bar"><i></i></div></div>`;
        setTimeout(() => {
          // 2) Аюулгүй байдлын асуулт (том товчнууд)
          step.innerHTML = `
        <div class="server-step">
          ${data.t ? `<div class="team-pill">👥 Холбогдсон баг: ${esc(data.t)}</div>` : ""}
          <div class="quiz-q">🛡 ${esc(quiz.question)}</div>
          <div class="quiz-opts">${opts.map((o, k) => `<button type="button" class="btn" data-k="${k}">${esc(o)}</button>`).join("")}</div>
          <div class="feedback error" id="quiz-fb" aria-live="polite"></div>
        </div>`;
          $$(".quiz-opts .btn", step).forEach((btn) =>
            btn.addEventListener("click", async () => {
              if (busy) return;
              busy = true;
              let got = null;
              try {
                got = await openLock(data.q, opts[Number(btn.dataset.k)]);
              } catch (err) {
                /* crypto.subtle байхгүй (https биш) */
              }
              busy = false;
              if (got && got.f) {
                sfx.success();
                showFragment(got.f);
              } else {
                sfx.error();
                btn.disabled = true;
                $("#quiz-fb").textContent =
                  "✖ ACCESS DENIED — энэ нууц үг хэтэрхий сул байна. Дахиад сонгоорой!";
                btn.classList.add("shake");
              }
            }),
          );
        }, 950);

        // 3) Fragment харуулах
        function showFragment(fragment) {
          step.innerHTML = `
        <div class="server-step">
          <div class="server-pumpkin">🎃</div>
          <h1 class="glitch" data-text="YOU FOUND THE HIDDEN SERVER">YOU FOUND THE HIDDEN SERVER</h1>
          <p class="closer">Та зорилгодоо ойртож байна...</p>
          <div class="frag-label">Нууц үг:</div>
          <div class="frag-big">${esc(fragment)}</div>
          <p>Энэ үгийг багийнхаа компьютер${data.t ? ` (<span class="hl">${esc(data.t)}</span>)` : ""} дээрх <b class="hl-o">STAGE 04</b>-т бичээрэй.</p>
          <p class="muted small">Бодит амьдралд: зөвхөн баталгаатай QR кодыг уншуулж, нэвтрэхийн өмнө вэб хаягийг заавал шалгаарай.</p>
        </div>`;
        }
      },
    );
  }

  /* ================================================================
   12. ЗОХИОН БАЙГУУЛАГЧИЙН САМБАР (ADMIN)
   Нээх: зөвхөн <линк>#admin (PIN-тэй). Энгийн линк дээр shortcut байхгүй.
   ================================================================ */
  let adminUnlocked = false;
  // Нэвтэрсэн organizer-ийн нээлттэй тохиргоо (хариултууд) + password — зөвхөн санах ойд
  let adminPlain = null,
    adminPassword = "";
  // Өөр organizer тохиргоо хадгалбал шинэ vault-ыг дахин нээнэ
  async function refreshAdminVault() {
    const p = await openVault(CONFIG.vault, adminPassword).catch(() => null);
    if (!p) {
      // Password өөрчлөгдсөн → дахин нэвтэрнэ
      adminUnlocked = false;
      adminPlain = null;
      adminPassword = "";
      if (view === "admin") renderAdminLogin();
      return;
    }
    adminPlain = p;
    // Нээлттэй admin самбарын тохиргооны талбаруудыг шинэ утгаар шинэчилнэ
    // (хэн нэгэн талбар дээр бичиж байгаа бол хөндөхгүй)
    if (
      !modal.hidden &&
      $("#s-save") &&
      !panel.contains(document.activeElement)
    )
      renderAdminPanel();
  }
  const modal = $("#admin-modal"),
    panel = $("#admin-panel");

  // 🛠 ADMIN ХУУДАС: <линк>#admin — Organizer тоглоомгүйгээр бүгдийг эндээс удирдана.
  // Энэ хуудас баг биш: LIVE TEAMS-д харагдахгүй, RESET ALL нөлөөлөхгүй.
  const gameUrl = () => location.href.split("#")[0];
  function renderAdminPage() {
    view = "admin";
    updateHUD();
    document.body.classList.remove("lost", "qr-stage");
    app.innerHTML = "";
    modal.hidden = false;
    if (adminUnlocked) renderAdminPanel();
    else renderAdminLogin();
  }

  function renderAdminLogin() {
    panel.innerHTML = `
    <div class="admin-head"><h2>🔧 ORGANIZER ACCESS</h2></div>
    <form id="pin-form" autocomplete="off">
      <div class="field"><label for="pin-input">ORGANIZER PASSWORD</label><input id="pin-input" type="password"></div>
      <button class="btn btn-primary btn-block" id="pin-btn" style="margin-top:12px">UNLOCK CONSOLE</button>
      <div class="admin-msg err" id="pin-msg"></div>
    </form>`;
    $("#pin-input").focus();
    $("#pin-form").addEventListener("submit", async (e) => {
      e.preventDefault();
      const pwd = $("#pin-input").value.trim();
      const btn = $("#pin-btn");
      if (!pwd || btn.disabled) return;
      btn.disabled = true;
      $("#pin-msg").textContent = "";
      let plain = null;
      try {
        // Хамгийн сүүлийн тохиргоог Firebase-ээс авсны дараа нээнэ
        await syncConfig();
        plain = await openVault(CONFIG.vault, pwd);
      } catch (err) {
        btn.disabled = false;
        $("#pin-msg").textContent =
          "✖ Open the game over https to use the console.";
        return;
      }
      btn.disabled = false;
      if (plain) {
        adminUnlocked = true;
        adminPlain = plain;
        adminPassword = pwd;
        renderAdminPanel();
      } else {
        $("#pin-msg").textContent = "✖ Wrong password.";
        sfx.error();
      }
    });
  }

  function field(id, label, value, help = "", type = "text", full = false) {
    return `<div class="field ${full ? "full" : ""}"><label for="${id}">${label}</label>
    ${type === "textarea" ? `<textarea id="${id}" spellcheck="false">${esc(value)}</textarea>` : `<input id="${id}" type="${type}" value="${esc(value)}" spellcheck="false">`}
    ${help ? `<div class="help">${help}</div>` : ""}</div>`;
  }

  function renderAdminPanel() {
    const c = adminPlain; // нээлттэй тохиргоо (vault-аас)
    const keyAnswers = plainAnswers(c);
    const keyFrags = plainFragments(c);
    const qr = qrTarget();
    panel.innerHTML = `
    <div class="admin-head"><h2>⚙ ORGANIZER CONSOLE</h2></div>
    <div class="admin-links muted small">
      🎮 Game for teams: <a href="${esc(gameUrl())}" target="_blank" rel="noopener">${esc(gameUrl())}</a><br>
      🏆 Leaderboard (projector): <a href="${esc(gameUrl())}#leaderboard" target="_blank" rel="noopener">${esc(gameUrl())}#leaderboard</a>
    </div>

    <div class="admin-sec">
      <h3>🌐 ALL PCs CONTROL (every team at once)</h3>
      <div class="status-grid" id="ctl-status"></div>

      <div class="ctl-label">🚦 START — every PC shows one countdown and starts together</div>
      <div class="btn-row">
        <button class="btn btn-small" data-start="5" title="Туршилтад: 5 секундын дараа бүх PC эхэлнэ">🧪 TEST: START IN 5s</button>
        <button class="btn btn-small btn-primary" data-start="30">▶ START IN 30s</button>
        <button class="btn btn-small btn-primary" data-start="60">▶ START IN 1 MIN</button>
        <button class="btn btn-small btn-primary" data-start="90">▶ START IN 1 MIN 30s</button>
        <button class="btn btn-small btn-primary" data-start="120">▶ START IN 2 MIN</button>
        <button class="btn btn-small btn-danger" id="ctl-cancel">✕ CANCEL START</button>
      </div>

      <div class="ctl-label">⏱ TOTAL TIME — changes the timer on every PC, even mid-game</div>
      <div class="btn-row">
        <input id="ctl-minutes" class="ctl-input" type="number" min="1" max="180" value="${Math.round(gameDuration() / 60)}" aria-label="Total minutes"> <span class="muted small">min</span>
        <button class="btn btn-small btn-primary" id="ctl-duration">✔ APPLY TO ALL</button>
      </div>

      <div class="ctl-label">🎮 DURING THE GAME</div>
      <div class="btn-row">
        <button class="btn btn-small" id="ctl-pause"></button>
        <button class="btn btn-small" id="ctl-plus">+1 MIN ALL</button>
        <button class="btn btn-small" id="ctl-minus">−1 MIN ALL</button>
        <button class="btn btn-small btn-danger" id="ctl-reset">🔄 RESET ALL PCs (new round)</button>
      </div>
      <div class="help muted small" style="margin-top:4px">RESET ALL sends every PC back to the team-name screen and clears the start. The leaderboard is kept.</div>
      <div class="admin-msg" id="adm-msg-ctl"></div>

      <div class="ctl-label">📡 LIVE TEAMS</div>
      <ul class="lb-admin-list ctl-teams" id="ctl-teams"><li class="muted">Loading…</li></ul>
    </div>

    <div class="admin-sec">
      <h3>🏆 LEADERBOARD (shared by all PCs)</h3>
      <ul class="lb-admin-list" id="lb-list"></ul>
      <div class="btn-row">
        <button class="btn btn-small" id="lb-view">📺 OPEN LEADERBOARD VIEW</button>
        <button class="btn btn-small" id="lb-demo">+ DEMO DATA</button>
        <button class="btn btn-small btn-danger" id="lb-clear">🗑 CLEAR ALL</button>
      </div>
      <div class="admin-msg" id="adm-msg2"></div>
    </div>

    <div class="admin-sec">
      <h3>⚙ SETTINGS (ALL PCs — saved changes apply to every PC instantly)</h3>
      <div class="form-grid">
        ${field("s-pen", "HINT PENALTIES (seconds, comma separated)", c.hintPenalties.join(", "), "Counts ALL hints in the game: 1st hint, 2nd hint, … (the last value repeats). Grows so teams can't spam hints.")}
        <div class="field full"><label class="check"><input type="checkbox" id="s-penon" ${c.hintPenaltyEnabled ? "checked" : ""}> Hint time penalty enabled</label></div>
        ${field("s-w1", "STAGE 1 — binary word (A–Z)", c.stage1Word, "Binary is generated automatically.")}
        ${field("s-w2", "STAGE 2 — Caesar word (A–Z)", c.stage2Word, "Cipher text is generated automatically.")}
        ${field("s-shift", "STAGE 2 — shift (1–25)", c.stage2Shift, "", "number")}
        ${field("s-w3", "STAGE 3 — hidden word (A–Z)", c.stage3Word, "Sentences are generated automatically.")}
        ${field("s-w4", "STAGE 4 — QR fragment", c.stage4Fragment)}
        ${field("s-w5", "STAGE 5 — login password", c.stage5Password, `Empty = automatic (currently <b>${esc(stage5Password(c))}</b>).`)}
        ${field("s-note", "STAGE 5 — admin_notes.txt (empty = default)", c.stage5Note, "", "textarea", true)}
        ${field("s-a6", "STAGE 6 — accepted answers (comma separated)", c.stage6Answers.join(", "), "", "text", true)}
        ${field("s-code6", "STAGE 6 — buggy code", c.stage6Code, "", "textarea", true)}
        ${field("s-master", "MASTER PASSWORD (≥ 6 characters)", c.masterPassword, "Split into 6 scrambled fragments.")}
        ${field("s-pin", "NEW ORGANIZER PASSWORD (empty = keep the current one)", "", "Encrypts the answer key. A longer password is harder to guess.", "password")}
        ${field("s-qr", "QR BASE URL (empty = this page)", c.qrBaseUrl, "e.g. https://username.github.io/hack-the-halloween/")}
      </div>
      <div class="btn-row" style="margin-top:14px">
        <button class="btn btn-primary btn-small" id="s-save">💾 SAVE SETTINGS</button>
        <button class="btn btn-small btn-danger" id="s-defaults">↺ RESTORE DEFAULTS</button>
      </div>
      <div class="admin-msg" id="adm-msg3"></div>
    </div>

    <div class="admin-sec">
      <h3>🔑 ANSWER KEY</h3>
      <details><summary>Show answers (don’t let players see!)</summary>
        <table class="key-table" style="margin-top:10px">
          ${keyAnswers.map((a, k) => `<tr><td>STAGE ${k + 1}</td><td><b>${esc(a.join(" / "))}</b> · fragment: <b>${esc(keyFrags[k])}</b></td></tr>`).join("")}
          <tr><td>FINAL</td><td><b>${esc(norm(c.masterPassword))}</b></td></tr>
          <tr><td>PHONE QUIZ</td><td><b>${esc(MOBILE_QUIZ.options[c.mobileQuizCorrect])}</b></td></tr>
        </table>
      </details>
    </div>

    <div class="admin-sec">
      <h3>📱 QR CODE</h3>
      <div class="muted small">Mode: <b>${qr.mode === "url" ? "URL (phones open the hidden-server page)" : "TEXT (game opened as a local file — phones will only see plain text; host the game online for the full phone challenge)"}</b></div>
      <div class="qr-target" style="margin-top:6px">${esc(qr.value)}</div>
      ${qr.mode === "url" ? '<div class="btn-row" style="margin-top:8px"><a class="btn btn-small" target="_blank" rel="noopener" href="' + esc(qr.value) + '">OPEN HIDDEN SERVER PAGE ↗</a></div>' : ""}
    </div>`;

    const ok = (el, t) => {
      el.className = "admin-msg ok";
      el.textContent = t;
    };
    const err = (el, t) => {
      el.className = "admin-msg err";
      el.textContent = t;
    };

    // --- 🌐 Бүх PC-ийн удирдлага ---
    const msgC = $("#adm-msg-ctl");
    const roundStarted = () => ctl.startAt && ctl.startAt <= now();
    // Нийтийн тойргийн үлдсэн хугацаа (hint-ийн торгуулийг тооцохгүй)
    const roundLeft = () => {
      const ref = now();
      const pause =
        (Number(ctl.pausedTotal) || 0) +
        (ctl.pausedAt
          ? Math.max(0, ref - Math.max(ctl.pausedAt, ctl.startAt))
          : 0);
      const el =
        (ref - ctl.startAt - pause) / 1000 + (Number(ctl.adjustSec) || 0);
      return Math.max(0, gameDuration() - el);
    };
    const drawCtl = () => {
      const el = $("#ctl-status");
      if (!el) return;
      const t = ctl.startAt;
      const adj = Number(ctl.adjustSec) || 0;
      const round = !t
        ? "WAITING (STARTING SOON)"
        : t > now()
          ? `STARTS IN ${fmt(Math.ceil((t - now()) / 1000))}`
          : roundLeft() <= 0
            ? "FINISHED"
            : ctl.pausedAt
              ? "⏸ PAUSED"
              : "▶ RUNNING";
      el.innerHTML = `
      <div><span>ROUND</span><b>${round}</b></div>
      <div><span>TOTAL TIME</span><b>${fmt(gameDuration())}</b></div>
      <div><span>ROUND TIME LEFT</span><b>${roundStarted() ? fmt(Math.ceil(roundLeft())) : "—"}</b></div>
      <div><span>TIME ADDED (ALL)</span><b>${adj ? (adj < 0 ? "+" : "−") + fmt(Math.abs(adj)) : "—"}</b></div>`;
      $("#ctl-pause").textContent = ctl.pausedAt
        ? "▶ RESUME ALL"
        : "⏸ PAUSE ALL";
    };
    const drawTeams = async () => {
      const ul = $("#ctl-teams");
      if (!ul) return;
      try {
        const r = await fetch(`${REMOTE}/teams.json`);
        const data = (await r.json()) || {};
        const order = { playing: 0, briefing: 1, won: 2, lost: 3, start: 4 };
        const rows = Object.values(data)
          .filter((t) => t && now() - (t.seen || 0) < 10 * 60 * 1000)
          .sort(
            (a, b) =>
              (order[a.status] ?? 9) - (order[b.status] ?? 9) ||
              b.stage - a.stage,
          );
        if (!$("#ctl-teams")) return;
        ul.innerHTML = rows.length
          ? rows
              .map((t) => {
                const ago = Math.max(0, Math.round((now() - t.seen) / 1000));
                const st =
                  t.status === "playing"
                    ? `${t.stage >= TOTAL_STAGES ? "FINAL" : "STAGE " + (t.stage + 1)} · ⏱ ${fmt(t.remaining)} left`
                    : t.status === "won"
                      ? `✔ WON · ${fmt(t.finalTime)}`
                      : t.status === "lost"
                        ? `💀 TIME'S UP · stage ${t.stage}/${TOTAL_STAGES}`
                        : t.status === "briefing"
                          ? "⏳ waiting to start"
                          : "📝 entering team name";
                return `<li><span><b>${esc(t.team || "—")}</b> — ${st} · 💡${t.hints || 0}</span><span class="muted small">${ago < 90 ? ago + "s" : Math.round(ago / 60) + "m"} ago</span></li>`;
              })
              .join("")
          : '<li class="muted">No PCs online yet.</li>';
      } catch (e) {
        ul.innerHTML = '<li class="muted">✖ Could not reach Firebase.</li>';
      }
    };
    drawCtl();
    drawTeams();
    let n = 0;
    const ctlTimer = setInterval(() => {
      if (modal.hidden || !$("#ctl-status")) return clearInterval(ctlTimer);
      drawCtl();
      if (++n % 6 === 0) drawTeams();
    }, 500);
    // Firebase-ээс хамгийн сүүлийн /control-ийг аваад өөрчилж, үр дүнг харуулна
    const run = async (fn, msg) => {
      try {
        await syncControl();
        await fn();
        ok(msgC, typeof msg === "function" ? msg() : msg);
      } catch (e) {
        err(
          msgC,
          String(e.message || "").startsWith("✖")
            ? e.message
            : "✖ Could not reach Firebase.",
        );
      }
      drawCtl();
      if (view === "game") {
        updateHUD();
        tick();
      }
    };
    const fail = (t) => {
      throw new Error(t);
    };

    $$("[data-start]", panel).forEach((b) =>
      b.addEventListener("click", () =>
        run(
          async () => {
            await syncClock();
            // Шинэ тойрог: өмнөх pause/±1 MIN-ийг арилгана, нийт хугацааг үлдээнэ
            await writeControl(
              {
                startAt: now() + Number(b.dataset.start) * 1000,
                durationSec: gameDuration(),
                resetAt: ctl.resetAt || null,
              },
              true,
            );
          },
          `✔ All PCs start in ${fmt(Number(b.dataset.start))}.`,
        ),
      ),
    );
    $("#ctl-cancel").addEventListener("click", () =>
      run(
        () =>
          writeControl({
            startAt: null,
            pausedAt: null,
            pausedTotal: null,
            adjustSec: null,
          }),
        "Shared start cancelled — PCs show STARTING SOON.",
      ),
    );
    $("#ctl-duration").addEventListener("click", () => {
      const m = Number($("#ctl-minutes").value);
      run(async () => {
        if (!(m >= 1 && m <= 180)) fail("✖ Total time must be 1–180 minutes.");
        await writeControl({ durationSec: Math.round(m * 60) });
      }, `✔ Total time is now ${m} min on every PC.`);
    });
    $("#ctl-pause").addEventListener("click", () => {
      let resumed = false;
      run(
        async () => {
          if (!roundStarted()) fail("✖ The round hasn't started yet.");
          if (ctl.pausedAt) {
            const paused = Math.max(
              0,
              now() - Math.max(ctl.pausedAt, ctl.startAt),
            );
            await writeControl({
              pausedAt: null,
              pausedTotal: (Number(ctl.pausedTotal) || 0) + paused,
            });
            resumed = true;
          } else await writeControl({ pausedAt: now() });
        },
        () => (resumed ? "▶ All timers resumed." : "⏸ All timers paused."),
      );
    });
    $("#ctl-plus").addEventListener("click", () =>
      run(
        () => writeControl({ adjustSec: (Number(ctl.adjustSec) || 0) - 60 }),
        "✔ +1 minute for every team.",
      ),
    );
    $("#ctl-minus").addEventListener("click", () =>
      run(
        () => writeControl({ adjustSec: (Number(ctl.adjustSec) || 0) + 60 }),
        "✔ −1 minute for every team.",
      ),
    );
    confirmButton($("#ctl-reset"), () =>
      run(async () => {
        await syncClock();
        await writeControl(
          { resetAt: now(), durationSec: gameDuration() },
          true,
        );
        await fetch(`${REMOTE}/teams.json`, { method: "DELETE" });
        drawTeams();
      }, "🔄 All PCs reset to the team-name screen."),
    );

    // --- Онооны самбар ---
    const msg2 = $("#adm-msg2");
    const drawBoard = () => {
      const list = sortedBoard();
      $("#lb-list").innerHTML = list.length
        ? list
            .map(
              (e, k) =>
                `<li><span>${k + 1}. ${esc(e.team)} — <b class="hl">${fmt(e.time)}</b> · 💡${e.hints ?? 0}</span><button class="btn btn-small btn-danger" data-del="${esc(e.id)}">✕</button></li>`,
            )
            .join("")
        : '<li class="muted">Empty.</li>';
      $$("[data-del]", panel).forEach((b) =>
        b.addEventListener("click", () => {
          removeBoardEntry(b.dataset.del);
          drawBoard();
          refreshBoardView();
        }),
      );
    };
    adminDrawBoard = drawBoard;
    drawBoard();
    $("#lb-view").addEventListener("click", () =>
      window.open(gameUrl() + "#leaderboard", "_blank"),
    );
    $("#lb-demo").addEventListener("click", () => {
      [
        ["Team Ghost", 522, 1],
        ["Team Bug", 615, 2],
        ["Team Cyber", 663, 3],
        ["Team Pumpkin", 801, 4],
      ].forEach(([t, s, h]) => addBoardEntry(t, s, h));
      drawBoard();
      refreshBoardView();
      ok(msg2, "Demo data added.");
    });
    confirmButton($("#lb-clear"), () => {
      clearBoard();
      drawBoard();
      refreshBoardView();
      ok(msg2, "Leaderboard cleared.");
    });

    // --- Тохиргоо хадгалах ---
    const msg3 = $("#adm-msg3");
    $("#s-save").addEventListener("click", async () => {
      const v = (id) => $("#" + id).value;
      const newPassword = v("s-pin").trim();
      const next = {
        hintPenalties: v("s-pen")
          .split(",")
          .map((x) => Number(x.trim()))
          .filter((x) => Number.isFinite(x) && x >= 0),
        hintPenaltyEnabled: $("#s-penon").checked,
        stage1Word: lettersOnly(v("s-w1")),
        stage2Word: lettersOnly(v("s-w2")),
        stage2Shift: Number(v("s-shift")),
        stage3Word: lettersOnly(v("s-w3")),
        stage4Fragment: norm(v("s-w4")),
        stage5Password: v("s-w5").trim(),
        stage5Note: v("s-note"),
        stage6Answers: v("s-a6")
          .split(",")
          .map((x) => x.trim())
          .filter(Boolean),
        stage6Code: v("s-code6"),
        masterPassword: norm(v("s-master")),
        finalHint: adminPlain.finalHint,
        qrBaseUrl: v("s-qr").trim(),
        mobileQuizCorrect: adminPlain.mobileQuizCorrect,
      };
      const problems = [];
      if (!next.hintPenalties.length)
        problems.push("at least one hint penalty number");
      if (!next.stage1Word || next.stage1Word.length > 12)
        problems.push("stage 1 word (1–12 letters)");
      if (!next.stage2Word) problems.push("stage 2 word");
      if (!(next.stage2Shift >= 1 && next.stage2Shift <= 25))
        problems.push("shift 1–25");
      if (next.stage3Word.length < 2)
        problems.push("stage 3 word (2+ letters)");
      if (!next.stage4Fragment) problems.push("stage 4 fragment");
      if (!next.stage6Answers.length) problems.push("stage 6 answers");
      if (next.masterPassword.length < 6)
        problems.push("master password (6+ characters)");
      if (newPassword && newPassword.length < 4)
        problems.push("organizer password (4+ characters)");
      if (next.qrBaseUrl && !/^https?:\/\//i.test(next.qrBaseUrl))
        problems.push("QR URL must start with http(s)://");
      if (problems.length)
        return err(msg3, "✖ Please fix: " + problems.join(", "));
      // 🌐 Firebase /config руу бичнэ → бүх PC шууд шинэчлэгдэнэ
      const btn = $("#s-save");
      btn.disabled = true;
      ok(msg3, "⏳ Encrypting…");
      const password = newPassword || adminPassword;
      // Хариултуудыг шифрлээд л илгээнэ — Firebase-д нээлттэй хариулт очихгүй
      const sealed = await sealConfig(next, password, acrosticLines);
      fetch(configUrl(), {
        method: "PUT",
        body: JSON.stringify(JSON.stringify(sealed)),
      })
        .then((r) => {
          if (!r.ok) throw new Error(r.status);
          adminPlain = next;
          adminPassword = password;
          setRemoteConfig(sealed);
          ok(msg3, "✔ Saved to ALL PCs. Every team's game updates now.");
          setTimeout(renderAdminPanel, 1200);
        })
        .catch(() => {
          btn.disabled = false;
          err(msg3, "✖ Could not reach Firebase. Nothing was changed.");
        });
    });
    confirmButton($("#s-defaults"), () =>
      fetch(configUrl(), { method: "DELETE" })
        .then((r) => {
          if (!r.ok) throw new Error(r.status);
          setRemoteConfig({});
          renderAdminPanel();
        })
        .catch(() =>
          err(msg3, "✖ Could not reach Firebase. Nothing was changed."),
        ),
    );
  }

  // Хоёр дарж баталгаажуулдаг товч (confirm() цонх ашиглахгүй)
  function confirmButton(btn, action) {
    const label = btn.textContent;
    let armed = false,
      t;
    btn.addEventListener("click", () => {
      if (!armed) {
        armed = true;
        btn.textContent = "⚠ CLICK AGAIN TO CONFIRM";
        t = setTimeout(() => {
          armed = false;
          btn.textContent = label;
        }, 3000);
        return;
      }
      clearTimeout(t);
      armed = false;
      btn.textContent = label;
      action();
    });
  }
  function refreshBoardView() {
    if (view === "leaderboard") renderLeaderboard();
  }

  /* ================================================================
   13. АРЫН BINARY БОРОО
   ================================================================ */
  function startRain() {
    const canvas = $("#bg-rain");
    const ctx = canvas.getContext("2d");
    const fs = 16;
    let w, h, cols, drops;
    const resize = () => {
      w = canvas.width = window.innerWidth;
      h = canvas.height = window.innerHeight;
      cols = Math.ceil(w / fs);
      drops = Array.from({ length: cols }, () => Math.random() * -60);
    };
    resize();
    window.addEventListener("resize", resize);
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let last = 0;
    const frame = (t) => {
      if (t - last > 70 && view !== "server") {
        last = t;
        ctx.fillStyle = "rgba(6,7,8,0.2)";
        ctx.fillRect(0, 0, w, h);
        ctx.font = fs + "px monospace";
        for (let i = 0; i < cols; i += 2) {
          const y = drops[i] * fs;
          ctx.fillStyle = Math.random() < 0.03 ? "#ff7a1a" : "#39ff7a";
          ctx.fillText(Math.random() < 0.5 ? "0" : "1", i * fs, y);
          if (y > h && Math.random() > 0.975) drops[i] = 0;
          drops[i] += 1;
        }
      }
      requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
  }

  /* ================================================================
   14. ЦАГ ХЭМЖИГЧ, ROUTER, ЭХЛЭЛ
   ================================================================ */
  function tick() {
    if (view !== "game") return;
    if (state.status === "playing" || state.status === "briefing") updateHUD();
    if (state.status === "playing" && !isPaused() && remainingSec() <= 0)
      loseGame();
  }

  function route() {
    const h = location.hash;
    // Танихгүй хаяг (жишээ: #leaderbord, ?x=1) → 404 хуудас.
    // Зөвшөөрөгдөх нь: хоосон, #leaderboard, #goonerboi, #hidden-server/<token> (QR)
    const known =
      !h ||
      h === "#" ||
      h === "#leaderboard" ||
      h === "#goonerboi" ||
      h === "#hidden-server" ||
      h.startsWith("#hidden-server/");
    if (!known || location.search) return location.replace("404.html");
    if (h === "#goonerboi") return renderAdminPage();
    modal.hidden = true;
    if (h.startsWith("#hidden-server"))
      return renderServer(h.split("/")[1] || "");
    if (h === "#leaderboard") return renderLeaderboard();
    render();
  }

  function init() {
    startRain();

    // Дуу асаах/унтраах
    const st = $("#sound-toggle");
    st.textContent = sfx.on ? "🔊" : "🔇";
    st.addEventListener("click", () => {
      st.textContent = sfx.toggle() ? "🔊" : "🔇";
    });

    window.addEventListener("hashchange", route);
    window.addEventListener("resize", updateHUD);
    // Нэг хөтчийн өөр tab-д онооны самбар/тохиргоо шинэчлэгдвэл
    window.addEventListener("storage", (e) => {
      if (e.key === KEYS.board) refreshBoardView();
      if (e.key === KEYS.remoteConfig) CONFIG = loadConfig();
    });

    route();
    startBoardSync();
    startControlSync();
    setInterval(tick, 250);
  }

  document.addEventListener("DOMContentLoaded", init);
})();
