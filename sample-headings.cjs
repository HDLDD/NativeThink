const ids = [['11','Alice'],['1661','Sherlock'],['2701','MobyDick'],['43','Jekyll'],['730','OliverTwist'],['1184','MonteCristo'],['244','TimeMachine'],['1232','ThePrince'],['1635','Meditations'],['1228','Origin'],['3300','Republic']];
(async () => {
  for (const [id, name] of ids) {
    try {
      const r = await fetch(`https://nativethink.pages.dev/api/gutenberg?id=${id}`, { signal: AbortSignal.timeout(90000) });
      const { text } = await r.json();
      const paras = text.split(/\r?\n\s*\r?\n/).map(p => p.replace(/\r?\n(?!\r?\n)/g, ' ').replace(/\s+/g, ' ').trim()).filter(p => p.length > 1);
      let inContent = false;
      const cands = [];
      for (const en of paras) {
        if (/\*\*\* START OF THE PROJECT GUTENBERG EBOOK/i.test(en)) { inContent = true; continue; }
        if (/\*\*\* END OF THE PROJECT GUTENBERG EBOOK/i.test(en)) break;
        if (!inContent) continue;
        const t = en.trim();
        // 候选：短行且含章节/编号特征
        if (t.length <= 70 && (/chapter|book|part|volume|letter|^[IVXLCDM]+[.\s]/i.test(t) || (t === t.toUpperCase() && /[A-Z]{4,}/.test(t)))) cands.push(t);
        if (cands.length >= 6) break;
      }
      console.log(`\n=== ${id} ${name} ===`);
      cands.forEach(c => console.log('  |' + c.slice(0, 70)));
    } catch (e) { console.log(`${id}: ERR`); }
  }
})();
