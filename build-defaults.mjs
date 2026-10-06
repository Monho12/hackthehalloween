// Анхны (default) тохиргоог шифрлээд script.js доторх SEALED_DEFAULTS-д бичнэ.
//
//   HTH_ORGANIZER_PASSWORD="..." node build-defaults.mjs <нээлттэй-тохиргоо.json>
//
// ⚠ Нээлттэй тохиргооны JSON файлд хариултууд байгаа тул repo-д бүү хадгал.
// JSON-ийн бүтэц (#admin → ⚙ SETTINGS-ийн талбаруудтай ижил):
// { hintPenalties, hintPenaltyEnabled, stage1Word, stage2Word, stage2Shift,
//   stage3Word, stage4Fragment, stage5Password, stage5Note, stage6Answers,
//   stage6Code, masterPassword, finalHint, qrBaseUrl, mobileQuizCorrect }
import { readFileSync, writeFileSync } from "node:fs";

const SCRIPT = new URL("./script.js", import.meta.url);
const [, , plainPath] = process.argv;
const password = process.env.HTH_ORGANIZER_PASSWORD || "";
if (!plainPath || password.length < 4) {
  console.error(
    'Usage: HTH_ORGANIZER_PASSWORD="4+ chars" node build-defaults.mjs plain.json',
  );
  process.exit(1);
}

const src = readFileSync(SCRIPT, "utf8");
const section = (name) => {
  const m = src.match(
    new RegExp(`// === ${name} BEGIN ===[^\\n]*\\n([\\s\\S]*?)// === ${name} END ===`),
  );
  if (!m) throw new Error(`${name} section not found in script.js`);
  return m[1];
};
// script.js-ийн яг ижил функцуудыг ашиглана (браузер, build хоёр зөрөхгүй)
const lib = new Function(
  `${section("SEAL")}\n${section("ACROSTIC")}\n` +
    "return { sealConfig, acrosticLines, openLock, openVault, plainAnswers, plainFragments };",
)();

const plain = JSON.parse(readFileSync(plainPath, "utf8"));
const sealed = await lib.sealConfig(plain, password, lib.acrosticLines);

// Шалгалт: зөв хариулт бүр өөрийн хэсгийг тайлах, буруу хариулт тайлахгүй
const answers = lib.plainAnswers(plain);
const frags = lib.plainFragments(plain);
for (let k = 0; k < answers.length; k++) {
  for (const a of answers[k]) {
    const got = await lib.openLock(sealed.stages[k], a);
    if (!got || got.f !== frags[k]) throw new Error(`stage ${k + 1} self-test failed`);
  }
  if (await lib.openLock(sealed.stages[k], "WRONGANSWER"))
    throw new Error(`stage ${k + 1} accepts a wrong answer`);
}
if (!(await lib.openLock(sealed.final, plain.masterPassword)))
  throw new Error("final self-test failed");
const vault = await lib.openVault(sealed.vault, password);
if (JSON.stringify(vault) !== JSON.stringify(plain))
  throw new Error("vault self-test failed");

const out = src.replace(
  /\/\*SEALED\*\/[\s\S]*?\/\*END\*\//,
  `/*SEALED*/${JSON.stringify(sealed)}/*END*/`,
);
if (out === src && !src.includes(JSON.stringify(sealed)))
  throw new Error("SEALED_DEFAULTS marker not found");
writeFileSync(SCRIPT, out);
console.log("✔ SEALED_DEFAULTS updated (self-test passed).");
