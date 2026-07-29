/** Which mobile overlay is currently on screen. Only one may be open at a time. */
type MobileSheet = 'nav' | 'account' | null;

class MobileNavStore {
  #sheet = $state<MobileSheet>(null);

  get sheet(): MobileSheet {
    return this.#sheet;
  }

  get isOpen(): boolean {
    return this.#sheet !== null;
  }

  open(sheet: Exclude<MobileSheet, null>): void {
    this.#sheet = sheet;
  }

  toggle(sheet: Exclude<MobileSheet, null>): void {
    this.#sheet = this.#sheet === sheet ? null : sheet;
  }

  close(): void {
    this.#sheet = null;
  }
}

export const mobileNav = new MobileNavStore();
