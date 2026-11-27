/* Local PDF reading. No uploads, OCR, external services, or automatic schedule changes. */
(function (root) {
  'use strict';
  const MAX_BYTES = 4 * 1024 * 1024;
  const MAX_PAGES = 20;
  let runtimePromise;
  const normalize = text => String(text || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[.,:]/g, '').replace(/\s+/g, ' ').trim();
  const dayNames = new Map([
    ['e hene', 1], ['hene', 1], ['monday', 1],
    ['e marte', 2], ['marte', 2], ['tuesday', 2],
    ['e merkure', 3], ['merkure', 3], ['wednesday', 3],
    ['e enjte', 4], ['enjte', 4], ['thursday', 4],
    ['e premte', 5], ['premte', 5], ['friday', 5],
    ['e shtune', 6], ['shtune', 6], ['saturday', 6],
    ['e diel', 0], ['diel', 0], ['e diele', 0], ['diele', 0], ['sunday', 0]
  ]);
  const timePattern = /\b([01]?\d|2[0-3])[:.]([0-5]\d)\b/g;

  function range(text) {
    const times = [...text.matchAll(timePattern)].map(match => `${match[1].padStart(2, '0')}:${match[2]}`);
    return times.length === 2 && times[0] < times[1] ? { startTime: times[0], endTime: times[1] } : null;
  }

  function linesFromItems(items) {
    const lines = [];
    const words = items.filter(item => typeof item.str === 'string' && item.str.trim() && item.transform)
      .map(item => ({ text: item.str.replace(/\s+/g, ' ').trim(), x: item.transform[4], y: item.transform[5], width: item.width || 0 }))
      .sort((a, b) => b.y - a.y || a.x - b.x);
    for (const word of words) {
      let line = lines.at(-1);
      if (!line || Math.abs(line.y - word.y) > 3) { line = { y: word.y, words: [] }; lines.push(line); }
      line.words.push(word);
    }
    for (const line of lines) {
      line.words.sort((a, b) => a.x - b.x);
      line.text = line.words.map(word => word.text).join(' ');
    }
    return lines.sort((a, b) => b.y - a.y);
  }

  function headersForLine(line) {
    const headers = [];
    for (let index = 0; index < line.words.length; index++) {
      for (let count = 1; count <= 2; count++) {
        const words = line.words.slice(index, index + count);
        const day = dayNames.get(normalize(words.map(word => word.text).join(' ')));
        if (day === undefined || headers.some(header => header.day === day)) continue;
        headers.push({ day, x: (words[0].x + words.at(-1).x + words.at(-1).width) / 2 });
        index += count - 1;
        break;
      }
    }
    return headers.sort((a, b) => a.x - b.x);
  }

  function parsePages(pages) {
    const lessons = [];
    let activeDay = null;
    function append(day, text, times) {
      const subject = text.replace(timePattern, '').replace(/^[\s\d.\-–—:|]+|[\s\-–—:|]+$/g, '').replace(/\s+/g, ' ').trim();
      if (!subject || subject.length > 120 || /^(pushim|pauze|break)$/i.test(normalize(subject))) return;
      if (lessons.some(item => item.day === day && item.subject === subject && item.startTime === times.startTime && item.endTime === times.endTime)) return;
      if (lessons.length < 200) lessons.push({ day, subject, ...times, room: '', isExample: false });
    }
    for (const page of pages) {
      const lines = linesFromItems(page.items || []);
      let columns = null;
      for (let index = 0; index < lines.length; index++) {
        const line = lines[index];
        const headers = headersForLine(line);
        if (headers.length >= 2) { columns = headers; activeDay = null; continue; }
        const exactDay = dayNames.get(normalize(line.text));
        if (exactDay !== undefined) { activeDay = exactDay; columns = null; continue; }
        const times = range(line.text);
        if (!times) continue; // Never invent times from a period number or from an image.
        const inlineDay = normalize(line.text).match(/^(e hene|hene|e marte|marte|e merkure|merkure|e enjte|enjte|e premte|premte|e shtune|shtune|e diel|diel|e diele|diele|monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/);
        if (inlineDay) { activeDay = dayNames.get(inlineDay[1]); columns = null; }
        if (columns) {
          const words = [...line.words];
          // Include wrapped subject text up to the next timetable row.
          while (index + 1 < lines.length && lines[index].y - lines[index + 1].y <= 22 && !/\b\d{1,2}[:.]\d{2}\b/.test(lines[index + 1].text) && !headersForLine(lines[index + 1]).length) {
            words.push(...lines[++index].words);
          }
          const cells = columns.map(() => []);
          for (const word of words) {
            if (/\b\d{1,2}[:.]\d{2}\b/.test(word.text) || /^\d+$/.test(word.text)) continue;
            const center = word.x + word.width / 2;
            let column = columns.findIndex((header, i) => i === columns.length - 1 || center < (header.x + columns[i + 1].x) / 2);
            cells[column].push(word.text);
          }
          columns.forEach((header, i) => append(header.day, cells[i].join(' '), times));
        } else {
          let text = inlineDay ? line.text.split(/\s+/).slice(inlineDay[1].split(' ').length).join(' ') : line.text;
          if (headers.length === 1) {
            activeDay = headers[0].day;
            const words = line.words.filter(word => dayNames.get(normalize(word.text)) === undefined && normalize(word.text) !== 'e');
            text = words.map(word => word.text).join(' ');
          }
          if (activeDay !== null) append(activeDay, text, times);
        }
      }
    }
    return lessons;
  }

  function loadScript(src) {
    return new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = src;
      script.onload = resolve;
      script.onerror = () => reject(new Error('Lexuesi lokal i PDF-së nuk u hap. Provo ta rifreskosh aplikacionin.'));
      document.head.appendChild(script);
    });
  }

  async function runtime() {
    if (!runtimePromise) runtimePromise = (async () => {
      // Preload the core in the same page: works under file://, without remote workers.
      await loadScript('./vendor/pdf.worker.js');
      await loadScript('./vendor/pdf.js');
      if (!root.pdfjsLib || !root.pdfjsWorker) throw new Error('Lexuesi i PDF-së nuk është gati.');
      return root.pdfjsLib;
    })().catch(error => { runtimePromise = null; throw error; });
    return runtimePromise;
  }

  async function open(bytes) {
    const pdfjs = await runtime();
    const loading = pdfjs.getDocument({ data: bytes, isEvalSupported: false, enableXfa: false, useWasm: false, verbosity: 0 });
    // Avoid leaving an unresolved password callback on a protected document.
    let rejectPassword;
    const protectedDocument = new Promise((resolve, reject) => { rejectPassword = reject; });
    loading.onPassword = () => rejectPassword(Object.assign(new Error('PDF i mbrojtur'), { name: 'PasswordException' }));
    try { return await Promise.race([loading.promise, protectedDocument]); }
    catch (error) { await loading.destroy(); throw new Error(error?.name === 'PasswordException' ? 'PDF-ja është e mbrojtur. Përdor një kopje pa fjalëkalim ose cakto orët vetë.' : 'PDF-ja nuk mund të lexohet. Provo një PDF tjetër ose cakto orët vetë.'); }
  }

  async function read(file) {
    if (!file || !/\.pdf$/i.test(file.name)) throw new Error('Zgjidh një skedar PDF.');
    if (!file.size || file.size > MAX_BYTES) throw new Error('PDF-ja duhet të jetë deri në 4 MB.');
    const bytes = new Uint8Array(await file.arrayBuffer());
    if (String.fromCharCode(...bytes.slice(0, 5)) !== '%PDF-') throw new Error('Skedari nuk është PDF i vlefshëm.');
    const data = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(new Error('PDF-ja nuk u lexua.'));
      reader.readAsDataURL(new Blob([bytes], { type: 'application/pdf' }));
    });
    const pdfDocument = await open(bytes);
    try {
      if (pdfDocument.numPages > MAX_PAGES) throw new Error('Zgjidh një PDF me jo më shumë se 20 faqe.');
      const pages = [];
      for (let page = 1; page <= pdfDocument.numPages; page++) {
        const content = await (await pdfDocument.getPage(page)).getTextContent();
        pages.push(content);
      }
      return { pdf: { name: file.name.slice(0, 180), type: 'application/pdf', data }, lessons: parsePages(pages), document: pdfDocument };
    } catch (error) { await pdfDocument.destroy(); throw error; }
  }

  function bytesFromData(data) {
    const binary = atob(data.split(',')[1]);
    return Uint8Array.from(binary, char => char.charCodeAt(0));
  }

  const api = { read, open, bytesFromData, parsePages, linesFromItems, MAX_BYTES };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.EmmaSchedulePdf = api;
})(globalThis);
