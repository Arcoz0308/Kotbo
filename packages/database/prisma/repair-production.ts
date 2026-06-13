const repairs = [
  "20260404193000_add_code_police_rules",
  "20260406090000_add_interest_profiles_and_feedback",
  "20260523000000_add_banned_words_table",
  "20260531000000_add_nickname_mod_granular_toggles",
];

async function run(command: string[], quiet = false) {
  const process = Bun.spawn(command, {
    cwd: import.meta.dir + "/..",
    stdout: quiet ? "ignore" : "inherit",
    stderr: quiet ? "ignore" : "inherit",
  });

  return process.exited;
}

for (const migration of repairs) {
  console.log(`[MigrationRepair] Reconciliation de ${migration}...`);

  const executeCode = await run([
    "bunx",
    "prisma",
    "db",
    "execute",
    "--file",
    `prisma/repairs/${migration}.sql`,
  ]);

  if (executeCode !== 0) {
    throw new Error(`La reparation SQL de ${migration} a echoue.`);
  }

  // Already-applied migrations return P3008; suppress it because the desired
  // production state is exactly the same.
  await run(["bunx", "prisma", "migrate", "resolve", "--applied", migration], true);
}

console.log("[MigrationRepair] Historique de production reconcilie.");
