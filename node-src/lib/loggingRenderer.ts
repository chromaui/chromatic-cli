import UpdateRenderer from 'listr-update-renderer';

/**
 * The default Listr renderer to show the TUI. This also updates a log file at the same time.
 */
export default class LoggingRenderer {
  static readonly nonTTY = false;
  tasks;
  options;
  updateRenderer;

  constructor(tasks: any, options: any) {
    this.tasks = tasks;
    this.options = options;
    this.updateRenderer = new UpdateRenderer(tasks, options);
  }

  render() {
    this.updateRenderer.render();
    for (const task of this.tasks) {
      let lastData;
      task.subscribe((event) => {
        if (event.type === 'TITLE') this.options.log.file(`${task.title}`);
        if (event.type === 'DATA' && lastData !== event.data) {
          lastData = event.data;
          this.options.log.file(`    → ${event.data}`);
        }
      });
    }
  }

  end() {
    this.updateRenderer.end();
  }
}
