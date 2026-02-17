import { test } from 'node:test';
import assert from 'node:assert';
import { EventsMap } from '../../js/nostr/eventsMap.js';

test('EventsMap functionality', async (t) => {
  await t.test('indexes events by author on set', () => {
    const map = new EventsMap();
    const event1 = { id: '1', pubkey: 'abc', kind: 1 };
    const event2 = { id: '2', pubkey: 'abc', kind: 1 };
    const event3 = { id: '3', pubkey: 'def', kind: 1 };

    map.set(event1.id, event1);
    map.set(event2.id, event2);
    map.set(event3.id, event3);

    const abcEvents = map.getEventsByAuthor('abc');
    assert.strictEqual(abcEvents.length, 2);
    assert.ok(abcEvents.includes(event1));
    assert.ok(abcEvents.includes(event2));

    const defEvents = map.getEventsByAuthor('def');
    assert.strictEqual(defEvents.length, 1);
    assert.ok(defEvents.includes(event3));
  });

  await t.test('updates index on delete', () => {
    const map = new EventsMap();
    const event1 = { id: '1', pubkey: 'abc', kind: 1 };
    map.set(event1.id, event1);

    assert.strictEqual(map.getEventsByAuthor('abc').length, 1);

    map.delete(event1.id);
    assert.strictEqual(map.getEventsByAuthor('abc').length, 0);
  });

  await t.test('updates index on overwrite with different object', () => {
    const map = new EventsMap();
    const event1 = { id: '1', pubkey: 'abc', kind: 1 };
    const event1Update = { id: '1', pubkey: 'abc', kind: 1, content: 'update' };

    map.set(event1.id, event1);
    assert.ok(map.getEventsByAuthor('abc').includes(event1));

    map.set(event1.id, event1Update);
    const abcEvents = map.getEventsByAuthor('abc');
    assert.strictEqual(abcEvents.length, 1);
    assert.ok(abcEvents.includes(event1Update));
    assert.ok(!abcEvents.includes(event1));
  });

  await t.test('clears index on clear', () => {
    const map = new EventsMap();
    const event1 = { id: '1', pubkey: 'abc', kind: 1 };
    map.set(event1.id, event1);

    map.clear();
    assert.strictEqual(map.getEventsByAuthor('abc').length, 0);
    assert.strictEqual(map.size, 0);
  });

  await t.test('normalizes pubkeys', () => {
    const map = new EventsMap();
    const event1 = { id: '1', pubkey: 'ABC', kind: 1 };
    map.set(event1.id, event1);

    assert.strictEqual(map.getEventsByAuthor('abc').length, 1);
    assert.strictEqual(map.getEventsByAuthor('ABC').length, 1);
    assert.strictEqual(map.getEventsByAuthor(' abc ').length, 1);
  });

  await t.test('handles non-event objects gracefully', () => {
      const map = new EventsMap();
      map.set('1', null);
      map.set('2', { foo: 'bar' }); // No pubkey

      assert.strictEqual(map.getEventsByAuthor('undefined').length, 0);
  });
});
