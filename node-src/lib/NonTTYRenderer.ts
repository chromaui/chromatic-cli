export default class NonTTYRenderer {
  tasks;

  options;

  constructor(tasks: any, options: any) {
    this.tasks = tasks;
    this.options = options;
  }

  static get nonTTY() {
    return true;
  }

  render() {
    // eslint-disable-next-line no-restricted-syntax
    for (const task of this.tasks) {
      let lastData;
      task.subscribe((event) => {
        if (event.type === 'TITLE') this.options.log.info(`${task.title}`);
        if (event.type === 'DATA' && lastData !== event.data) {
          lastData = event.data;
          this.options.log.info(`    → ${event.data}`);
        }
      });
    }
  }

  end() {
    // do nothing
  }
}
