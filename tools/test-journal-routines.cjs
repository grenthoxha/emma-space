/* Run with: node tools/test-journal-routines.cjs (no extra dependencies). */
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const editor = require('../journal-editor.js');
const model = require('../space-model.js');
const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const scripts = [...source.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)].map(match => match[1]);
scripts.forEach((script, index) => new vm.Script(script, {filename: `inline-${index}`}));
for (const file of ['journal-editor.js', 'sw.js']) new vm.Script(fs.readFileSync(path.join(root, file), 'utf8'), {filename: file});

const photos = [{id: 'p', name: 'Test', data: 'data:image/png;base64,AAAA'}];
const legacy = editor.normalize(undefined, 'Një kujtim\nMe dashuri.', photos);
assert.equal(editor.text(legacy), 'Një kujtim\nMe dashuri.');
assert.equal(legacy[1].photoId, 'p');
const blocks = [{type: 'text', text: 'Para'}, {type: 'photo', photoId: 'p', align: 'right', width: 35}, {type: 'text', text: 'Pas'}];
assert.deepEqual(editor.normalize(JSON.parse(JSON.stringify(blocks)), '', photos), blocks);
assert.equal(editor.text(blocks), 'Para\nPas');
assert(editor.html(blocks, photos).includes('data-align="right"'));
assert(!editor.html([{type: 'text', text: '<img onerror="oops">'}], []).includes('<img'));
assert.equal(editor.safePhotoData('https://example.com/photo.png'), '');
assert.equal(editor.safePhotoData('data:image/svg+xml;base64,AAAA'), '');

// Expose pure model helpers only inside this isolated test, never in the app.
const appScript = scripts.find(script => script.includes('  bootstrapApp();'));
assert(appScript);
const isolated = appScript.replace('  bootstrapApp();', '  globalThis.testApi = {blankState, normalizeState, parseBackupPayload, buildBackupPayload, routineProgress, routinePeriod, syncRoutinePeriod, setState: value => state = value};');
const context = {
  EmmaJournalEditor: editor, EmmaSpaceModel:model, EmmaAuthService:require('../auth-service'),
  document: {addEventListener() {}, querySelector() {return null;}, querySelectorAll() {return [];}},
  window: {addEventListener() {}}, localStorage: {getItem() {return null;}}, location: {hash: '#home'},
  console, Date, TextEncoder, setTimeout, clearTimeout, setInterval, clearInterval
};
vm.runInNewContext(isolated, context);
const api = context.testApi;
const data = api.blankState();
data.removedDefaultRoutines = [0, 0, 99];
data.completed = [0, 1, 1, 55];
data.journalPages = [{id: 'old', body: 'Shkrimi i vjetër', title: 'Kujtim', photos}, {id: 'new', body: 'Para\nPas', title: 'Me foto', photos, content: blocks}];
api.setState(api.normalizeState(data));
assert.equal(api.routineProgress(), 17);
const backup = api.buildBackupPayload();
assert.equal(backup.version, 7);
const restored = api.parseBackupPayload(JSON.parse(JSON.stringify(backup)));
assert.equal(restored.journalPages[0].body, 'Shkrimi i vjetër');
assert.equal(restored.journalPages[0].content[1].photoId, 'p');
assert.deepEqual(JSON.parse(JSON.stringify(restored.journalPages[1].content)), blocks);
assert.deepEqual(JSON.parse(JSON.stringify(restored.removedDefaultRoutines)), [0]);
assert.throws(() => api.parseBackupPayload({format: 'not-backup', nope: true}));

for (const [hour, key] of [[0, 'morning'], [11, 'morning'], [12, 'afternoon'], [17, 'afternoon'], [18, 'evening'], [23, 'evening']]) {
  assert.equal(api.routinePeriod({getHours: () => hour}), key);
}
const groups = ['morning', 'afternoon', 'evening'].map(key => ({dataset: {routinePeriod: key}, open: false}));
let moved;
context.document.querySelector = selector => selector === '.routine-screen' ? {
  querySelectorAll: () => groups,
  querySelector: () => ({after: node => moved = node.dataset.routinePeriod})
} : null;
for (const [hour, key] of [[8, 'morning'], [14, 'afternoon'], [20, 'evening']]) {
  api.syncRoutinePeriod(true, {getHours: () => hour});
  assert.equal(moved, key);
  assert.equal(groups.filter(group => group.open).length, 1);
  assert(groups.find(group => group.dataset.routinePeriod === key).open);
}
groups[2].open = false;
api.syncRoutinePeriod(false, {getHours: () => 21});
assert.equal(groups[2].open, false, 'Honor manual collapse until the next period');
api.syncRoutinePeriod(false, {getHours: () => 7});
assert(groups[0].open, 'Switch automatically when the daypart changes');
console.log('PASS: syntax, diary migration/layout/media backup, safe images, routine counts and live dayparts');
