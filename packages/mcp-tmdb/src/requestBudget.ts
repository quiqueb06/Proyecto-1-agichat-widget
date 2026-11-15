import { TmdbError } from './config.js';
export class RequestBudget {
  private day = '';
  private count = 0;
  constructor(
    private limit: number,
    private now = Date.now,
  ) {}
  get used() {
    const day = new Date(this.now()).toISOString().slice(0, 10);
    if (day !== this.day) {
      this.day = day;
      this.count = 0;
    }
    return this.count;
  }
  take() {
    if (this.used >= this.limit) throw new TmdbError('BUDGET_EXHAUSTED');
    this.count++;
  }
  reset() {
    this.count = 0;
  }
}
