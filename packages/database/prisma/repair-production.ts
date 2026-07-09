const repairs = [
  "20260404193000_add_code_police_rules",
  "20260406090000_add_interest_profiles_and_feedback",
  "20260523000000_add_banned_words_table",
  "20260531000000_add_nickname_mod_granular_toggles",
  "20260706000000_add_custom_form_hierarchy",
  "20260706010000_add_ban_appeal_notify_dm",
  "20260706020000_add_tutoring_hierarchy_grade",
  "20260708000000_add_welcome_thread_system",
  "20260709000000_add_welcome_menu_page_actions",
];

async function run(command: string[]) {
  const process = Bun.spawn(command, {
    cwd: import.meta.dir + "/..",
    stdout: "inherit",
    stderr: "inherit",
  });

  return process.exited;
}

async function resolveApplied(migration: string) {
  const process = Bun.spawn(
    ["bun", "run", "prisma", "migrate", "resolve", "--applied", migration],
    {
      cwd: import.meta.dir + "/..",
      stdout: "pipe",
      stderr: "pipe",
    },
  );

  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(process.stdout).text(),
    new Response(process.stderr).text(),
    process.exited,
  ]);
  const output = `${stdout}\n${stderr}`;

  if (exitCode === 0 || output.includes("P3008")) return;

  if (output.trim()) console.error(output.trim());
  throw new Error(`La reconciliation Prisma de ${migration} a echoue.`);
}

for (const migration of repairs) {
  console.log(`[MigrationRepair] Reconciliation de ${migration}...`);

  const executeCode = await run([
    "bun",
    "run",
    "prisma",
    "db",
    "execute",
    "--file",
    `prisma/repairs/${migration}.sql`,
  ]);

  if (executeCode !== 0) {
    throw new Error(`La reparation SQL de ${migration} a echoue.`);
  }

  // Already-applied migrations return P3008; only that failure is safe to
  // suppress because the desired production state is exactly the same.
  await resolveApplied(migration);
}

console.log("[MigrationRepair] Historique de production reconcilie.");
