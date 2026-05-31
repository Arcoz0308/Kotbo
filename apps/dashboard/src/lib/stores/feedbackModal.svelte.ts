class FeedbackModalStore {
  open = $state(false);

  show() {
    this.open = true;
  }

  close() {
    this.open = false;
  }
}

export const feedbackModal = new FeedbackModalStore();
