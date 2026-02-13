class Helper {
  constructor() {
    // prop not defined
  }
}

class Controller {
  constructor() {
    this.helper = new Helper();
  }
  get prop() { return this.helper.prop; }
}

const c = new Controller();
try {
  c.prop.value = 'test';
} catch (e) {
  console.log('Error:', e.message);
}
