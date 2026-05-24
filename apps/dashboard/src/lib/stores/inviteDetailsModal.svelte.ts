class InviteDetailsModalStore {
  open = $state(false);
  code = $state<string | null>(null);

  show(inviteCode: string) {
    this.code = inviteCode;
    this.open = true;
  }

  close() {
    this.open = false;
    this.code = null;
  }
}

export const inviteDetailsModal = new InviteDetailsModalStore();
