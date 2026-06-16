class ServerSwitcherStore {
  open = $state(false);

  show = () => {
    this.open = true;
  };

  close = () => {
    this.open = false;
  };

  toggle = () => {
    this.open = !this.open;
  };
}

export const serverSwitcherStore = new ServerSwitcherStore();
